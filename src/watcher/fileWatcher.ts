import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ScanController } from "../scanner/scanController";
import { ScanStore } from "../scanner/scanStore";
import { folderForUri } from "../workspace/folders";
import { PathFilter, createPathFilter } from "./pathFilter";

const ALWAYS_EXCLUDE = ["**/.vscode/todos.json", "**/.vscode/todos.local.json"];
/** Above this many dirty paths in one folder, a single folder scan is cheaper than per-path scans. */
const FOLDER_RESCAN_THRESHOLD = 500;

interface Pending {
  folder: vscode.WorkspaceFolder;
  uris: Map<string, vscode.Uri>;
}

/**
 * Watches each workspace folder and re-scans changed paths. Changes are collected into one dirty
 * set and flushed after a single debounce window, so bulk changes (git checkout, codegen) cost
 * bounded work. ripgrep does not apply ignore/glob rules to explicitly-passed files, so exclude
 * and include globs are applied here (with ripgrep-compatible semantics).
 */
export class FileWatcher {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pending = new Map<string, Pending>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private filter: PathFilter | undefined;

  constructor(
    private readonly scanController: ScanController,
    private readonly scanStore: ScanStore,
    private readonly config: Configuration,
  ) {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSaved(doc)),
      config.onDidChange((e) => {
        if (e.affectsConfiguration("todoIt.include") || e.affectsConfiguration("todoIt.exclude")) {
          this.filter = undefined;
        }
      }),
    );
    this.syncFolders();
  }

  /** Add watchers for new folders and drop watchers (and pending work) for removed ones. */
  syncFolders(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const current = new Set(folders.map((f) => f.uri.toString()));

    for (const [key, watcher] of this.watchers) {
      if (!current.has(key)) {
        watcher.dispose();
        this.watchers.delete(key);
      }
    }
    for (const key of [...this.pending.keys()]) {
      if (!current.has(key)) {
        this.pending.delete(key);
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

  private getFilter(): PathFilter {
    if (!this.filter) {
      const all = this.config.all;
      this.filter = createPathFilter(all.includeGlobs, [...all.excludeGlobs, ...ALWAYS_EXCLUDE]);
    }
    return this.filter;
  }

  private isExcluded(uri: vscode.Uri): boolean {
    return this.getFilter().isExcluded(vscode.workspace.asRelativePath(uri, false));
  }

  private isIncludedFile(uri: vscode.Uri): boolean {
    return this.getFilter().isIncluded(vscode.workspace.asRelativePath(uri, false));
  }

  private onChanged(folder: vscode.WorkspaceFolder, uri: vscode.Uri): void {
    if (this.isExcluded(uri)) {
      return;
    }
    this.schedule(folder, uri);
  }

  private onDeleted(uri: vscode.Uri): void {
    const id = uri.toString();
    for (const p of this.pending.values()) {
      for (const key of [...p.uris.keys()]) {
        if (key === id || key.startsWith(`${id}/`)) {
          p.uris.delete(key);
        }
      }
    }
    // A deleted directory is reported as a single event: drop everything beneath it.
    this.scanController.cancelUnder(id);
    this.scanStore.removeUnder(id, folderForUri(uri)?.uri.toString());
  }

  private onSaved(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== "file" || this.isExcluded(doc.uri)) {
      return;
    }
    const folder = folderForUri(doc.uri);
    if (folder) {
      this.schedule(folder, doc.uri);
    }
  }

  private schedule(folder: vscode.WorkspaceFolder, uri: vscode.Uri): void {
    const key = folder.uri.toString();
    let p = this.pending.get(key);
    if (!p) {
      p = { folder, uris: new Map() };
      this.pending.set(key, p);
    }
    p.uris.set(uri.toString(), uri);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // Read the delay at schedule time so a changed setting applies without dropping queued work.
    this.timer = setTimeout(() => this.flush(), Math.max(0, this.config.all.debounceMs));
  }

  private flush(): void {
    this.timer = undefined;
    const batches = [...this.pending.values()];
    this.pending.clear();
    for (const { folder, uris } of batches) {
      if (uris.size === 0) {
        continue;
      }
      if (uris.size > FOLDER_RESCAN_THRESHOLD) {
        void this.scanController.scanFolder(folder);
      } else {
        void this.scanController.scanPaths(folder, [...uris.values()], (u) =>
          this.isIncludedFile(u),
        );
      }
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pending.clear();
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
