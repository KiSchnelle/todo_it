import * as vscode from "vscode";
import { ManualTask, TaskFile, TaskLink, TasksStorageMode } from "../models/types";
import { TASKS_FILE, TASKS_FILE_LOCAL, TASKS_SCHEMA_VERSION } from "../config/defaults";
import { Logger } from "../util/logger";

export interface TaskStorage {
  load(folder: vscode.WorkspaceFolder): Promise<ManualTask[]>;
  save(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void>;
}

function isFileNotFound(err: unknown): boolean {
  return (
    err instanceof vscode.FileSystemError &&
    (err.code === "FileNotFound" || err.code === "EntryNotFound")
  );
}

function isValidLink(value: unknown): value is TaskLink {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return typeof o.uri === "string" && typeof o.line === "number";
}

function isValidTask(value: unknown): value is ManualTask {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const okScalars =
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.done === "boolean" &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number" &&
    typeof o.order === "number";
  if (!okScalars) {
    return false;
  }
  // If `links` is present but malformed (e.g. a string), reject — defensive
  // against a hand-edited or corrupted todos.json.
  if (o.links !== undefined && (!Array.isArray(o.links) || !o.links.every(isValidLink))) {
    return false;
  }
  return true;
}

/**
 * Normalize a raw task into the current shape. Folds the legacy v0.0.3
 * `link: TaskLink` field into `links: [link]`; this runs at read time rather
 * than via a one-shot install migration so the adapter also catches workspaces
 * opened later with legacy `todos.json` files (git stashes, fresh clones,
 * colleagues' commits). Returns a fresh object — does not mutate `raw`.
 */
function rehydrateTask(raw: ManualTask): ManualTask {
  const withLegacy = raw as ManualTask & { link?: TaskLink };
  if (withLegacy.link && !withLegacy.links) {
    const { link, ...rest } = withLegacy;
    return { ...rest, links: [link] };
  }
  if (withLegacy.link) {
    const { link: _legacy, ...rest } = withLegacy;
    return rest;
  }
  return raw;
}

/** Emit keys in a stable order and drop empty optionals to keep diffs small. */
export function normalizeTask(t: ManualTask): ManualTask {
  const links = t.links?.filter(Boolean) ?? [];
  return {
    id: t.id,
    title: t.title,
    done: t.done,
    ...(t.priority ? { priority: t.priority } : {}),
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    ...(t.note ? { note: t.note } : {}),
    ...(links.length > 0 ? { links } : {}),
    ...(t.parentId ? { parentId: t.parentId } : {}),
    ...(t.snoozedUntil ? { snoozedUntil: t.snoozedUntil } : {}),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    order: t.order,
  };
}

/** Throws if `uri` exists and is a symbolic link. A missing path is fine. */
async function assertNotSymlink(uri: vscode.Uri): Promise<void> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type & vscode.FileType.SymbolicLink) {
      throw new Error(`Refusing to write through symbolic link: ${uri.fsPath}`);
    }
  } catch (err) {
    if (isFileNotFound(err)) {
      return;
    }
    throw err;
  }
}

/** Persists tasks to a JSON file relative to a workspace folder. */
export class FileTaskStorage implements TaskStorage {
  constructor(
    protected readonly relPath: string,
    protected readonly logger: Logger,
  ) {}

  protected fileUri(folder: vscode.WorkspaceFolder): vscode.Uri {
    return vscode.Uri.joinPath(folder.uri, this.relPath);
  }

  /** Folders whose on-disk file was unreadable or lossy to load; it is backed up before the first overwrite. */
  private readonly needsBackup = new Set<string>();

  async load(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const uri = this.fileUri(folder);
    const key = folder.uri.toString();
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<TaskFile>;
      if (parsed?.schemaVersion !== TASKS_SCHEMA_VERSION || !Array.isArray(parsed.tasks)) {
        this.logger.warn(`Ignoring malformed ${this.relPath} in "${folder.name}".`);
        this.needsBackup.add(key);
        return [];
      }
      const valid = parsed.tasks.filter(isValidTask);
      if (valid.length !== parsed.tasks.length) {
        this.logger.warn(
          `Dropped ${parsed.tasks.length - valid.length} invalid task(s) from ${this.relPath} in "${folder.name}".`,
        );
        this.needsBackup.add(key);
      } else {
        this.needsBackup.delete(key);
      }
      return valid.map(rehydrateTask);
    } catch (err) {
      if (isFileNotFound(err)) {
        this.needsBackup.delete(key);
        return [];
      }
      this.logger.error(`Failed to read ${this.relPath} in "${folder.name}"`, err);
      this.needsBackup.add(key);
      return [];
    }
  }

  async save(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    const dir = vscode.Uri.joinPath(folder.uri, ".vscode");
    // Refuse to write through symlinks (a hostile repo could redirect the write
    // to an arbitrary file outside the workspace).
    await assertNotSymlink(dir);
    await assertNotSymlink(this.fileUri(folder));
    await vscode.workspace.fs.createDirectory(dir);
    const key = folder.uri.toString();
    if (this.needsBackup.has(key)) {
      // The existing file could not be fully understood; keep a copy before replacing it.
      const target = this.fileUri(folder);
      const backup = vscode.Uri.joinPath(folder.uri, `${this.relPath}.bak-${Date.now()}`);
      try {
        await vscode.workspace.fs.copy(target, backup, { overwrite: false });
        this.logger.warn(`Backed up unreadable ${this.relPath} to ${backup.fsPath}.`);
      } catch (err) {
        if (!isFileNotFound(err)) {
          throw new Error(`Refusing to overwrite unreadable ${this.relPath}: backup failed.`);
        }
      }
      this.needsBackup.delete(key);
    }
    const file: TaskFile = { schemaVersion: TASKS_SCHEMA_VERSION, tasks: tasks.map(normalizeTask) };
    const text = `${JSON.stringify(file, null, 2)}\n`;
    await vscode.workspace.fs.writeFile(this.fileUri(folder), new TextEncoder().encode(text));
  }
}

/** Like {@link FileTaskStorage} but stores in a gitignored file and ensures the ignore entry. */
export class GitignoredFileTaskStorage extends FileTaskStorage {
  private readonly ensured = new Set<string>();

  constructor(logger: Logger) {
    super(TASKS_FILE_LOCAL, logger);
  }

  override async save(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    await this.ensureGitignore(folder);
    await super.save(folder, tasks);
  }

  private async ensureGitignore(folder: vscode.WorkspaceFolder): Promise<void> {
    const key = folder.uri.toString();
    if (this.ensured.has(key)) {
      return;
    }
    this.ensured.add(key);
    const giUri = vscode.Uri.joinPath(folder.uri, ".gitignore");
    try {
      await assertNotSymlink(giUri);
      let text = "";
      try {
        text = new TextDecoder().decode(await vscode.workspace.fs.readFile(giUri));
      } catch (err) {
        if (!isFileNotFound(err)) {
          throw err;
        }
      }
      if (text.split(/\r?\n/).some((line) => line.trim() === TASKS_FILE_LOCAL)) {
        return;
      }
      const prefix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
      await vscode.workspace.fs.writeFile(
        giUri,
        new TextEncoder().encode(`${text}${prefix}${TASKS_FILE_LOCAL}\n`),
      );
    } catch (err) {
      this.logger.error("Failed to update .gitignore", err);
    }
  }
}

/** Stores tasks in VS Code's machine-local workspace state (never a file). */
export class WorkspaceStateTaskStorage implements TaskStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private key(folder: vscode.WorkspaceFolder): string {
    return `todoIt.tasks.${folder.uri.toString()}`;
  }

  load(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const tasks = this.context.workspaceState.get<ManualTask[]>(this.key(folder), []);
    return Promise.resolve(tasks.map(rehydrateTask));
  }

  async save(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    // Normalize so workspaceState matches the on-disk shape — no `link: undefined`
    // entries leaking through and no stable-order surprises across upgrades.
    await this.context.workspaceState.update(this.key(folder), tasks.map(normalizeTask));
  }
}

export function createTaskStorage(
  mode: TasksStorageMode,
  context: vscode.ExtensionContext,
  logger: Logger,
): TaskStorage {
  switch (mode) {
    case "workspaceState":
      return new WorkspaceStateTaskStorage(context);
    case "gitignoredFile":
      return new GitignoredFileTaskStorage(logger);
    case "file":
    default:
      return new FileTaskStorage(TASKS_FILE, logger);
  }
}
