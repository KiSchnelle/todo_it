import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { ManualTask, TaskPriority } from "../models/types";
import { Logger } from "../util/logger";
import { TaskStorage } from "./taskStorage";

export interface NewTaskInput {
  title: string;
  priority?: TaskPriority;
  dueDate?: string;
  note?: string;
}

export interface TaskUpdate {
  title?: string;
  priority?: TaskPriority;
  dueDate?: string;
  note?: string;
  done?: boolean;
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

  async addTask(folder: vscode.WorkspaceFolder, input: NewTaskInput): Promise<ManualTask> {
    const tasks = await this.ensureLoaded(folder);
    const now = Date.now();
    const task: ManualTask = {
      id: randomUUID(),
      title: input.title,
      done: false,
      priority: input.priority,
      dueDate: input.dueDate,
      note: input.note,
      createdAt: now,
      updatedAt: now,
      order: tasks.reduce((max, t) => Math.max(max, t.order), 0) + 1,
    };
    tasks.push(task);
    await this.persist(folder, tasks);
    return task;
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
    task.updatedAt = Date.now();
    await this.persist(folder, tasks);
  }

  async setDone(folder: vscode.WorkspaceFolder, id: string, done: boolean): Promise<void> {
    await this.updateTask(folder, id, { done });
  }

  async removeTask(folder: vscode.WorkspaceFolder, id: string): Promise<void> {
    const tasks = await this.ensureLoaded(folder);
    const next = tasks.filter((t) => t.id !== id);
    if (next.length === tasks.length) {
      return;
    }
    await this.persist(folder, next);
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
