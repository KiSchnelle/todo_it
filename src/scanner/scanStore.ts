import { ScannedFileResult, TagMatch } from "../models/types";

export interface Unsubscribe {
  dispose(): void;
}

/** In-memory store of scanned results, keyed by file URI. No `vscode` dependency. */
export class ScanStore {
  private readonly byUri = new Map<string, ScannedFileResult>();
  private readonly listeners = new Set<() => void>();
  private _truncated = false;
  // Caches invalidated on emit() — rebuilding both takes O(N matches) per render
  // and grew noticeable on 5k-match workspaces. Cleared every time data changes.
  private allCache: readonly ScannedFileResult[] | undefined;
  private allMatchesCache: readonly TagMatch[] | undefined;

  onDidChange(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private emit(): void {
    this.allCache = undefined;
    this.allMatchesCache = undefined;
    for (const listener of this.listeners) {
      listener();
    }
  }

  get truncated(): boolean {
    return this._truncated;
  }

  setTruncated(value: boolean): void {
    this._truncated = value;
  }

  /** Replace a single file's results; an empty result removes the file entry. */
  replaceFile(result: ScannedFileResult): void {
    if (result.matches.length === 0) {
      this.removeFile(result.uri);
      return;
    }
    this.byUri.set(result.uri, result);
    this.emit();
  }

  /** Atomically replace every result belonging to a folder (one change event). */
  replaceFolder(folderUri: string, results: ScannedFileResult[]): void {
    for (const [uri, res] of this.byUri) {
      if (res.folderUri === folderUri) {
        this.byUri.delete(uri);
      }
    }
    for (const result of results) {
      if (result.matches.length > 0) {
        this.byUri.set(result.uri, result);
      }
    }
    this.emit();
  }

  removeFile(uri: string): void {
    if (this.byUri.delete(uri)) {
      this.emit();
    }
  }

  removeFolder(folderUri: string): void {
    let changed = false;
    for (const [uri, res] of this.byUri) {
      if (res.folderUri === folderUri) {
        this.byUri.delete(uri);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  }

  clear(): void {
    if (this.byUri.size > 0) {
      this.byUri.clear();
      this.emit();
    }
  }

  // The cached arrays are frozen — callers must clone before any in-place
  // sort/push. `Object.freeze` turns silent mutations into hard errors in strict
  // mode, which is what runs in extension code.
  all(): readonly ScannedFileResult[] {
    if (!this.allCache) {
      this.allCache = Object.freeze([...this.byUri.values()]);
    }
    return this.allCache;
  }

  allMatches(): readonly TagMatch[] {
    if (!this.allMatchesCache) {
      this.allMatchesCache = Object.freeze(this.all().flatMap((r) => r.matches));
    }
    return this.allMatchesCache;
  }

  matchesForUri(uri: string): TagMatch[] {
    return this.byUri.get(uri)?.matches ?? [];
  }

  hasFolder(folderUri: string): boolean {
    for (const res of this.byUri.values()) {
      if (res.folderUri === folderUri) {
        return true;
      }
    }
    return false;
  }
}
