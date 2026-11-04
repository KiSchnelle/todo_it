import * as vscode from "vscode";
import { ManualTask, TaskLink, TaskPriority } from "../models/types";
import { Logger } from "../util/logger";
import { newId } from "../util/uuid";
import { applyReorder, ReorderTarget } from "./reorder";
import { collectDescendants } from "./hierarchy";
import { normalizeTask, TaskStorage } from "./taskStorage";

export interface NewTaskInput {
  title: string;
  priority?: TaskPriority;
  dueDate?: string;
  note?: string;
  links?: TaskLink[];
  parentId?: string;
}

export interface TaskUpdate {
  title?: string;
  priority?: TaskPriority;
  dueDate?: string;
  note?: string;
  links?: TaskLink[];
  done?: boolean;
  snoozedUntil?: string;
}

function compareTasks(a: ManualTask, b: ManualTask): number {
  if (a.done !== b.done) {
    return a.done ? 1 : -1;
  }
  return a.order - b.order;
}

/** In-memory source of truth for manual tasks, loaded lazily per folder and written through on every change. */
export class TaskStore {
  private readonly byFolder = new Map<string, ManualTask[]>();
  /** In-flight loads, shared by concurrent callers so a late load cannot clobber a mutation. */
  private readonly loading = new Map<string, Promise<ManualTask[]>>();
  /** Bumped by setStorage so loads started against the old backend are discarded. */
  private generation = 0;
  /** Number of in-flight saves per folder, used to ignore watcher events for our own writes. */
  private readonly saving = new Map<string, number>();
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private readonly _onWillDispose = new vscode.EventEmitter<void>();
  /** Fires once when the store is disposed (e.g. extension deactivation). */
  readonly onWillDispose = this._onWillDispose.event;

  constructor(
    private storage: TaskStorage,
    private readonly logger: Logger,
  ) {
    // Pick up external edits (git pull / branch switch / manual edit) so a stale
    // cache never overwrites them on the next save.
    this.watcher = vscode.workspace.createFileSystemWatcher("**/.vscode/{todos,todos.local}.json");
    const onExternal = (uri: vscode.Uri): void => void this.reloadFromDisk(uri);
    this.watcher.onDidChange(onExternal);
    this.watcher.onDidCreate(onExternal);
    this.watcher.onDidDelete(onExternal);
  }

  private async reloadFromDisk(uri: vscode.Uri): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return;
    }
    const key = folder.uri.toString();
    const current = this.byFolder.get(key);
    if (!current || (this.saving.get(key) ?? 0) > 0) {
      return;
    }
    const gen = this.generation;
    try {
      const fresh = await this.storage.load(folder);
      if (
        gen !== this.generation ||
        (this.saving.get(key) ?? 0) > 0 ||
        this.byFolder.get(key) !== current
      ) {
        return;
      }
      const same =
        JSON.stringify(fresh.map(normalizeTask)) === JSON.stringify(current.map(normalizeTask));
      if (!same) {
        this.byFolder.set(key, fresh);
        this._onDidChange.fire();
      }
    } catch (err) {
      this.logger.error(`Failed to reload tasks for "${folder.name}"`, err);
    }
  }

  /** Swap the storage backend (e.g. when the `tasks.storage` setting changes) and drop the cache. */
  setStorage(storage: TaskStorage): void {
    this.storage = storage;
    this.generation++;
    this.byFolder.clear();
    this.loading.clear();
    this._onDidChange.fire();
  }

  async getTasks(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const tasks = await this.ensureLoaded(folder);
    return [...tasks].sort(compareTasks);
  }

  /** All currently-loaded tasks across folders (sync). Folders not yet queried are not included. */
  all(): ManualTask[] {
    const out: ManualTask[] = [];
    for (const tasks of this.byFolder.values()) {
      out.push(...tasks);
    }
    return out;
  }

  async addTask(folder: vscode.WorkspaceFolder, input: NewTaskInput): Promise<ManualTask> {
    const tasks = await this.ensureLoaded(folder);
    const now = Date.now();
    const siblings = tasks.filter((t) => t.parentId === input.parentId);
    const task: ManualTask = {
      id: newId(),
      title: input.title,
      done: false,
      priority: input.priority,
      dueDate: input.dueDate,
      note: input.note,
      links: input.links && input.links.length > 0 ? [...input.links] : undefined,
      parentId: input.parentId,
      createdAt: now,
      updatedAt: now,
      order: siblings.reduce((max, t) => Math.max(max, t.order), 0) + 1,
    };
    tasks.push(task);
    await this.persist(folder, tasks);
    return task;
  }

  /** Collect all descendants (children, grandchildren, …) of `parentId`. Excludes the parent itself. */
  collectDescendants(tasks: ManualTask[], parentId: string): ManualTask[] {
    return collectDescendants(tasks, parentId);
  }

  async descendantsOf(folder: vscode.WorkspaceFolder, parentId: string): Promise<ManualTask[]> {
    return this.collectDescendants(await this.ensureLoaded(folder), parentId);
  }

  /** Re-parent a task. Pass `undefined` to move it to the top level. Places it at the end of the new sibling list. */
  async moveTask(
    folder: vscode.WorkspaceFolder,
    id: string,
    newParentId: string | undefined,
  ): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      return;
    }
    if (task.parentId === newParentId) {
      return;
    }
    // Block re-parenting onto self or a descendant — that would create a cycle.
    if (newParentId === id) {
      return;
    }
    const descendants = this.collectDescendants(tasks, id);
    if (descendants.some((d) => d.id === newParentId)) {
      return;
    }
    task.parentId = newParentId;
    const siblings = tasks.filter((t) => t.parentId === newParentId && t.id !== id);
    task.order = siblings.reduce((max, t) => Math.max(max, t.order), 0) + 1;
    task.updatedAt = Date.now();
    await this.persist(folder, tasks);
  }

  async updateTask(folder: vscode.WorkspaceFolder, id: string, update: TaskUpdate): Promise<void> {
    await this.updateMany(folder, [id], update);
  }

  /** Apply the same update to several tasks, persisting and notifying once. */
  async updateMany(
    folder: vscode.WorkspaceFolder,
    ids: readonly string[],
    update: TaskUpdate,
  ): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const wanted = new Set(ids);
    let changed = false;
    for (const task of tasks) {
      if (!wanted.has(task.id)) {
        continue;
      }
      changed = true;
      if (update.title !== undefined) {
        task.title = update.title;
      }
      if (update.done !== undefined) {
        task.done = update.done;
      }
      // Optional fields: the key being present (even as undefined) means set-or-clear.
      if ("priority" in update) {
        task.priority = update.priority;
      }
      if ("dueDate" in update) {
        task.dueDate = update.dueDate;
      }
      if ("note" in update) {
        task.note = update.note;
      }
      if ("links" in update) {
        task.links = update.links && update.links.length > 0 ? [...update.links] : undefined;
      }
      if ("snoozedUntil" in update) {
        task.snoozedUntil = update.snoozedUntil;
      }
      task.updatedAt = Date.now();
    }
    if (changed) {
      await this.persist(folder, tasks);
    }
  }

  /** Toggle done. Cascades the same state to all descendant tasks. */
  async setDone(folder: vscode.WorkspaceFolder, id: string, done: boolean): Promise<void> {
    await this.setDoneMany(folder, [id], done);
  }

  /** Like {@link setDone} for several tasks, persisting and notifying once. */
  async setDoneMany(
    folder: vscode.WorkspaceFolder,
    ids: readonly string[],
    done: boolean,
  ): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const now = Date.now();
    let found = false;
    for (const id of ids) {
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        continue;
      }
      found = true;
      for (const t of [task, ...this.collectDescendants(tasks, id)]) {
        if (t.done !== done) {
          t.done = done;
          t.updatedAt = now;
        }
      }
    }
    if (found) {
      await this.persist(folder, tasks);
    }
  }

  /** Remove a task and all its descendants. */
  async removeTask(folder: vscode.WorkspaceFolder, id: string): Promise<void> {
    await this.removeMany(folder, [id]);
  }

  /** Remove several tasks (and their descendants), persisting and notifying once. */
  async removeMany(folder: vscode.WorkspaceFolder, ids: readonly string[]): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const remove = new Set<string>();
    for (const id of ids) {
      if (!tasks.some((t) => t.id === id)) {
        continue;
      }
      remove.add(id);
      for (const d of this.collectDescendants(tasks, id)) {
        remove.add(d.id);
      }
    }
    if (remove.size === 0) {
      return;
    }
    await this.persist(
      folder,
      tasks.filter((t) => !remove.has(t.id)),
    );
  }

  /**
   * Reorders dragged tasks within their parent's sibling list. Cross-parent
   * drags are no-ops here — callers should validate same-parent first (or use
   * {@link moveTask} to re-parent first). An orphaned task (its parent was
   * deleted) is treated as top-level for ordering purposes.
   */
  async reorder(
    folder: vscode.WorkspaceFolder,
    draggedIds: string[],
    target: ReorderTarget,
  ): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const first = tasks.find((t) => draggedIds.includes(t.id));
    if (!first) {
      return;
    }
    const ids = new Set(tasks.map((t) => t.id));
    const parentId = first.parentId && ids.has(first.parentId) ? first.parentId : undefined;
    const siblings = tasks.filter((t) => {
      const effective = t.parentId && ids.has(t.parentId) ? t.parentId : undefined;
      return effective === parentId;
    });
    applyReorder(siblings, draggedIds, target);
    await this.persist(folder, tasks);
  }

  private ensureLoaded(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const key = folder.uri.toString();
    const cached = this.byFolder.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = this.loading.get(key);
    if (pending) {
      return pending;
    }
    const gen = this.generation;
    const p: Promise<ManualTask[]> = (async () => {
      const tasks = await this.storage.load(folder);
      if (gen !== this.generation) {
        // Storage was swapped while loading; discard this result and load again.
        return this.ensureLoaded(folder);
      }
      this.byFolder.set(key, tasks);
      return tasks;
    })().finally(() => {
      if (this.loading.get(key) === p) {
        this.loading.delete(key);
      }
    });
    this.loading.set(key, p);
    return p;
  }

  private async persist(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    const key = folder.uri.toString();
    this.byFolder.set(key, tasks);
    this.saving.set(key, (this.saving.get(key) ?? 0) + 1);
    try {
      await this.storage.save(folder, tasks);
    } catch (err) {
      this.logger.error(`Failed to save tasks for "${folder.name}"`, err);
      void vscode.window.showErrorMessage(
        "Todo It: failed to save tasks. See the Todo It output channel for details.",
      );
    } finally {
      const n = (this.saving.get(key) ?? 1) - 1;
      if (n <= 0) {
        this.saving.delete(key);
      } else {
        this.saving.set(key, n);
      }
    }
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onWillDispose.fire();
    this._onWillDispose.dispose();
    this.watcher.dispose();
    this._onDidChange.dispose();
  }
}
