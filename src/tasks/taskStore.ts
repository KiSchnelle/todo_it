import * as vscode from "vscode";
import { ManualTask, TaskLink, TaskPriority } from "../models/types";
import { Logger } from "../util/logger";
import { newId } from "../util/uuid";
import { applyReorder, ReorderTarget } from "./reorder";
import { TaskStorage } from "./taskStorage";

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
  private readonly loaded = new Set<string>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private storage: TaskStorage,
    private readonly logger: Logger,
  ) {}

  /** Swap the storage backend (e.g. when the `tasks.storage` setting changes) and drop the cache. */
  setStorage(storage: TaskStorage): void {
    this.storage = storage;
    this.byFolder.clear();
    this.loaded.clear();
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
    const byParent = new Map<string, ManualTask[]>();
    for (const t of tasks) {
      const key = t.parentId ?? "";
      const list = byParent.get(key);
      if (list) {
        list.push(t);
      } else {
        byParent.set(key, [t]);
      }
    }
    const out: ManualTask[] = [];
    const queue: string[] = [parentId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const children = byParent.get(id) ?? [];
      for (const child of children) {
        out.push(child);
        queue.push(child.id);
      }
    }
    return out;
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
    const tasks = await this.ensureLoaded(folder);
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      return;
    }
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
    await this.persist(folder, tasks);
  }

  /** Toggle done. Cascades the same state to all descendant tasks. */
  async setDone(folder: vscode.WorkspaceFolder, id: string, done: boolean): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      return;
    }
    const now = Date.now();
    if (task.done !== done) {
      task.done = done;
      task.updatedAt = now;
    }
    for (const child of this.collectDescendants(tasks, id)) {
      if (child.done !== done) {
        child.done = done;
        child.updatedAt = now;
      }
    }
    await this.persist(folder, tasks);
  }

  /** Remove a task and all its descendants. */
  async removeTask(folder: vscode.WorkspaceFolder, id: string): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const target = tasks.find((t) => t.id === id);
    if (!target) {
      return;
    }
    const remove = new Set<string>([id]);
    for (const d of this.collectDescendants(tasks, id)) {
      remove.add(d.id);
    }
    const next = tasks.filter((t) => !remove.has(t.id));
    await this.persist(folder, next);
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

  private async ensureLoaded(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const key = folder.uri.toString();
    let tasks = this.byFolder.get(key);
    if (!this.loaded.has(key) || !tasks) {
      tasks = await this.storage.load(folder);
      this.byFolder.set(key, tasks);
      this.loaded.add(key);
    }
    return tasks;
  }

  private async persist(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    this.byFolder.set(folder.uri.toString(), tasks);
    try {
      await this.storage.save(folder, tasks);
    } catch (err) {
      this.logger.error(`Failed to save tasks for "${folder.name}"`, err);
      void vscode.window.showErrorMessage(
        "Todo It: failed to save tasks. See the Todo It output channel for details.",
      );
    }
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
