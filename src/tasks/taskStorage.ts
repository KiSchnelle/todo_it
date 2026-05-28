import * as vscode from "vscode";
import { ManualTask, TaskFile, TasksStorageMode } from "../models/types";
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

function isValidTask(value: unknown): value is ManualTask {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.done === "boolean" &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number" &&
    typeof o.order === "number"
  );
}

/** Emit keys in a stable order and drop empty optionals to keep diffs small. */
function normalizeTask(t: ManualTask): ManualTask {
  return {
    id: t.id,
    title: t.title,
    done: t.done,
    ...(t.priority ? { priority: t.priority } : {}),
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    ...(t.note ? { note: t.note } : {}),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    order: t.order,
  };
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

  async load(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const uri = this.fileUri(folder);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<TaskFile>;
      if (parsed?.schemaVersion !== TASKS_SCHEMA_VERSION || !Array.isArray(parsed.tasks)) {
        this.logger.warn(`Ignoring malformed ${this.relPath} in "${folder.name}".`);
        return [];
      }
      return parsed.tasks.filter(isValidTask);
    } catch (err) {
      if (isFileNotFound(err)) {
        return [];
      }
      this.logger.error(`Failed to read ${this.relPath} in "${folder.name}"`, err);
      return [];
    }
  }

  async save(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, ".vscode"));
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

  async load(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    return this.context.workspaceState.get<ManualTask[]>(this.key(folder), []);
  }

  async save(folder: vscode.WorkspaceFolder, tasks: ManualTask[]): Promise<void> {
    await this.context.workspaceState.update(this.key(folder), tasks);
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
