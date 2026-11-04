import { ScannedFileResult, TagMatch } from "../models/types";

/** True when `uri` equals `prefixUri` or is a descendant of it. */
export function isSameOrUnder(uri: string, prefixUri: string): boolean {
  return (
    uri === prefixUri ||
    uri.startsWith(prefixUri.endsWith("/") ? prefixUri : `${prefixUri}/`)
  );
}

export interface Unsubscribe {
  dispose(): void;
}

/** In-memory store of scanned results, keyed by file URI. No `vscode` dependency. */
export class ScanStore {
  private readonly byUri = new Map<string, ScannedFileResult>();
  private readonly listeners = new Set<() => void>();
  private _truncated = false;
  private readonly truncatedFolders = new Set<string>();
  private capped = false;
  /** Last time an incremental scan/removal touched a URI (guards against stale folder snapshots). */
  private readonly touched = new Map<
    string,
    { at: number; folderUri: string }
  >();
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
    return this._truncated || this.truncatedFolders.size > 0 || this.capped;
  }

  setTruncated(value: boolean): void {
    this._truncated = value;
  }

  private touch(uri: string, folderUri: string): void {
    this.touched.set(uri, { at: Date.now(), folderUri });
  }

  /** Live count (the allMatches cache is only rebuilt on emit, so it is stale mid-batch). */
  private totalMatches(): number {
    let n = 0;
    for (const r of this.byUri.values()) {
      n += r.matches.length;
    }
    return n;
  }

  /** Replace a single file's results; an empty result removes the file entry. */
  replaceFile(result: ScannedFileResult, maxTotal?: number): void {
    if (this.applyFile(result, maxTotal)) {
      this.emit();
    }
  }

  /** Apply many file results with a single change event. */
  replaceFiles(results: readonly ScannedFileResult[], maxTotal?: number): void {
    let changed = false;
    for (const r of results) {
      if (this.applyFile(r, maxTotal)) {
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  }

  private applyFile(result: ScannedFileResult, maxTotal?: number): boolean {
    this.touch(result.uri, result.folderUri);
    if (result.matches.length === 0) {
      return this.byUri.delete(result.uri);
    }
    if (maxTotal !== undefined) {
      const existing = this.byUri.get(result.uri)?.matches.length ?? 0;
      if (this.totalMatches() - existing + result.matches.length > maxTotal) {
        // Global cap: refuse unbounded growth from incremental rescans.
        const wasCapped = this.capped;
        this.capped = true;
        return !wasCapped;
      }
    }
    this.byUri.set(result.uri, result);
    return true;
  }

  /**
   * Atomically replace every result belonging to a folder (one change event).
   * `startedAt` is when the scan began: entries touched by an incremental scan/removal at or
   * after that moment are newer than the folder snapshot and are preserved.
   */
  replaceFolder(
    folderUri: string,
    results: ScannedFileResult[],
    opts: { startedAt?: number; truncated?: boolean } = {},
  ): void {
    const startedAt = opts.startedAt;
    const isNewer = (uri: string): boolean => {
      if (startedAt === undefined) {
        return false;
      }
      // Also honor a touch on an ancestor directory (e.g. the directory was deleted mid-scan).
      for (let u = uri; ; u = u.slice(0, u.lastIndexOf("/"))) {
        const t = this.touched.get(u);
        if (t !== undefined && t.at >= startedAt) {
          return true;
        }
        const cut = u.lastIndexOf("/");
        if (cut <= 0 || u.charAt(cut - 1) === "/") {
          return false;
        }
      }
    };
    for (const [uri, res] of this.byUri) {
      if (res.folderUri === folderUri && !isNewer(uri)) {
        this.byUri.delete(uri);
      }
    }
    for (const result of results) {
      if (result.matches.length > 0 && !isNewer(result.uri)) {
        this.byUri.set(result.uri, result);
      }
    }
    if (startedAt !== undefined) {
      for (const [uri, t] of this.touched) {
        if (t.folderUri === folderUri && t.at < startedAt) {
          this.touched.delete(uri);
        }
      }
    }
    if (opts.truncated) {
      this.truncatedFolders.add(folderUri);
    } else {
      this.truncatedFolders.delete(folderUri);
    }
    this.capped = false;
    this.emit();
  }

  /** Replace every result at or under `prefixUri` (a directory) with `results`. */
  replaceUnder(
    prefixUri: string,
    folderUri: string,
    results: ScannedFileResult[],
  ): void {
    let changed = false;
    for (const uri of [...this.byUri.keys()]) {
      if (
        isSameOrUnder(uri, prefixUri) &&
        !results.some((r) => r.uri === uri)
      ) {
        this.byUri.delete(uri);
        this.touch(uri, folderUri);
        changed = true;
      }
    }
    for (const r of results) {
      if (this.applyFile(r)) {
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  }

  removeFile(uri: string, knownFolderUri?: string): void {
    const folderUri =
      this.byUri.get(uri)?.folderUri ??
      knownFolderUri ??
      this.touched.get(uri)?.folderUri;
    if (folderUri !== undefined) {
      this.touch(uri, folderUri);
    }
    if (this.byUri.delete(uri)) {
      this.emit();
    }
  }

  /** Remove a file or every file under a directory URI (single change event). */
  removeUnder(prefixUri: string, knownFolderUri?: string): void {
    let changed = false;
    if (knownFolderUri !== undefined) {
      this.touch(prefixUri, knownFolderUri);
    }
    for (const [uri, res] of [...this.byUri]) {
      if (isSameOrUnder(uri, prefixUri)) {
        this.touch(uri, res.folderUri);
        this.byUri.delete(uri);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  }

  removeFolder(folderUri: string): void {
    let changed = this.truncatedFolders.delete(folderUri);
    for (const [uri, res] of this.byUri) {
      if (res.folderUri === folderUri) {
        this.byUri.delete(uri);
        changed = true;
      }
    }
    for (const [uri, t] of this.touched) {
      if (t.folderUri === folderUri) {
        this.touched.delete(uri);
      }
    }
    if (changed) {
      this.emit();
    }
  }

  clear(): void {
    this.touched.clear();
    this.truncatedFolders.clear();
    this.capped = false;
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
      this.allMatchesCache = Object.freeze(
        this.all().flatMap((r) => r.matches),
      );
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
