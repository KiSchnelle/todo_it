import { minimatch } from "minimatch";
import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ScanController } from "../scanner/scanController";
import { ScanStore } from "../scanner/scanStore";
import { KeyedDebouncer } from "../util/debounce";
import { folderForUri } from "../workspace/folders";

const ALWAYS_EXCLUDE = ["**/.vscode/todos.json", "**/.vscode/todos.local.json"];

/**
 * Watches each workspace folder and re-scans changed files (debounced). ripgrep does not
 * apply ignore rules to explicitly-passed files, so excludes are filtered here instead.
 */
export class FileWatcher {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly disposables: vscode.Disposable[] = [];
  private debouncer: KeyedDebouncer;

  constructor(
    private readonly scanController: ScanController,
    private readonly scanStore: ScanStore,
    private readonly config: Configuration,
  ) {
    this.debouncer = new KeyedDebouncer(Math.max(0, config.all.debounceMs));
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSaved(doc)),
      config.onDidChange((e) => {
        if (e.affectsConfiguration("todoIt.debounceMs")) {
          this.debouncer.dispose();
          this.debouncer = new KeyedDebouncer(Math.max(0, this.config.all.debounceMs));
        }
      }),
    );
    this.syncFolders();
  }

  /** Add watchers for new folders and drop watchers for removed ones. */
  syncFolders(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const current = new Set(folders.map((f) => f.uri.toString()));

    for (const [key, watcher] of this.watchers) {
      if (!current.has(key)) {
        watcher.dispose();
        this.watchers.delete(key);
      }
    }

    for (const folder of folders) {
      const key = folder.uri.toString();
      if (this.watchers.has(key)) {
        continue;
      }
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, "**/*"),
      );
      watcher.onDidCreate((uri) => this.onChanged(folder, uri));
      watcher.onDidChange((uri) => this.onChanged(folder, uri));
      watcher.onDidDelete((uri) => this.onDeleted(uri));
      this.watchers.set(key, watcher);
    }
  }

  private isExcluded(uri: vscode.Uri): boolean {
    const rel = vscode.workspace.asRelativePath(uri, false);
    const globs = [...this.config.all.excludeGlobs, ...ALWAYS_EXCLUDE];
    return globs.some((glob) => minimatch(rel, glob, { dot: true }));
  }

  private onChanged(folder: vscode.WorkspaceFolder, uri: vscode.Uri): void {
    if (this.isExcluded(uri)) {
      return;
    }
    this.debouncer.schedule(uri.toString(), () => void this.scanController.scanFile(folder, uri));
  }

  private onDeleted(uri: vscode.Uri): void {
    this.debouncer.cancel(uri.toString());
    this.scanStore.removeFile(uri.toString());
  }

  private onSaved(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== "file" || this.isExcluded(doc.uri)) {
      return;
    }
    const folder = folderForUri(doc.uri);
    if (folder) {
      this.debouncer.schedule(doc.uri.toString(), () =>
        void this.scanController.scanFile(folder, doc.uri),
      );
    }
  }

  dispose(): void {
    this.debouncer.dispose();
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
