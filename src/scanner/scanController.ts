import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { Logger } from "../util/logger";
import { getFolders } from "../workspace/folders";
import { Scanner } from "./scanner";
import { ScannedFileResult } from "../models/types";
import { ScanStore, isSameOrUnder } from "./scanStore";

const SCAN_CONCURRENCY = 4;

/** Coordinates folder/file scans, replacing results in the store and cancelling superseded scans. */
export class ScanController {
  private readonly inFlight = new Map<string, vscode.CancellationTokenSource>();

  constructor(
    private readonly scanner: Scanner,
    private readonly store: ScanStore,
    private readonly config: Configuration,
    private readonly logger: Logger,
  ) {}

  async scanAll(): Promise<void> {
    await Promise.all(getFolders().map((folder) => this.scanFolder(folder)));
  }

  async scanFolder(folder: vscode.WorkspaceFolder): Promise<void> {
    const key = `folder:${folder.uri.toString()}`;
    const token = this.begin(key);
    const startedAt = Date.now();
    try {
      const { results, truncated } = await this.scanner.scanFolder(folder, this.config.all, token);
      if (token.isCancellationRequested || !this.isOpenFolder(folder)) {
        return;
      }
      this.store.replaceFolder(folder.uri.toString(), results, {
        startedAt,
        truncated,
      });
    } catch (err) {
      this.logger.error(`Scan failed for "${folder.name}"`, err);
    } finally {
      this.end(key, token);
    }
  }

  async scanFile(folder: vscode.WorkspaceFolder, fileUri: vscode.Uri): Promise<void> {
    await this.scanPaths(folder, [fileUri]);
  }

  /**
   * Re-scan changed paths (files or directories) with bounded concurrency, applying all results
   * to the store with a single change event. Paths that no longer exist are removed.
   */
  async scanPaths(
    folder: vscode.WorkspaceFolder,
    uris: readonly vscode.Uri[],
    fileFilter?: (uri: vscode.Uri) => boolean,
  ): Promise<void> {
    const folderUri = folder.uri.toString();
    const out: ScannedFileResult[] = [];
    const removed: string[] = [];
    const dirs: Array<{ uri: string; results: ScannedFileResult[] }> = [];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < uris.length) {
        const uri = uris[next++];
        const uriString = uri.toString();
        const key = `file:${uriString}`;
        const token = this.begin(key);
        try {
          let type: vscode.FileType | undefined;
          try {
            type = (await vscode.workspace.fs.stat(uri)).type;
          } catch {
            type = undefined;
          }
          if (token.isCancellationRequested) {
            continue;
          }
          if (type === undefined) {
            removed.push(uriString);
            continue;
          }
          if (!(type & vscode.FileType.Directory) && fileFilter && !fileFilter(uri)) {
            continue;
          }
          const { results } = await this.scanner.scanFile(folder, uri, this.config.all, token);
          if (token.isCancellationRequested) {
            continue;
          }
          if (type & vscode.FileType.Directory) {
            dirs.push({ uri: uriString, results });
          } else {
            out.push(
              results[0] ?? {
                uri: uriString,
                folderUri,
                matches: [],
                scannedAt: Date.now(),
              },
            );
          }
        } catch (err) {
          this.logger.error(`Scan failed for ${uri.fsPath}`, err);
        } finally {
          this.end(key, token);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SCAN_CONCURRENCY, Math.max(1, uris.length)) }, worker),
    );
    if (!this.isOpenFolder(folder)) {
      return;
    }
    const max = this.config.all.maxResults;
    for (const uri of removed) {
      this.store.removeUnder(uri, folderUri);
    }
    for (const d of dirs) {
      this.store.replaceUnder(d.uri, folderUri, d.results);
    }
    this.store.replaceFiles(out, max);
  }

  /** Cancel in-flight scans for a folder or file/directory (and everything beneath it). */
  cancelUnder(uri: string): void {
    for (const [key, cts] of [...this.inFlight]) {
      const scanned = key.startsWith("file:") ? key.slice(5) : key.slice(7);
      if (key === `folder:${uri}` || isSameOrUnder(scanned, uri)) {
        cts.cancel();
        this.inFlight.delete(key);
        cts.dispose();
      }
    }
  }

  cancelFolder(folderUri: string): void {
    this.cancelUnder(folderUri);
  }

  private isOpenFolder(folder: vscode.WorkspaceFolder): boolean {
    const id = folder.uri.toString();
    return getFolders().some((f) => f.uri.toString() === id);
  }

  private begin(key: string): vscode.CancellationToken {
    this.inFlight.get(key)?.cancel();
    const cts = new vscode.CancellationTokenSource();
    this.inFlight.set(key, cts);
    return cts.token;
  }

  private end(key: string, token?: vscode.CancellationToken): void {
    const cts = this.inFlight.get(key);
    if (cts && (!token || cts.token === token)) {
      this.inFlight.delete(key);
      cts.dispose();
    }
  }

  dispose(): void {
    for (const cts of this.inFlight.values()) {
      cts.cancel();
      cts.dispose();
    }
    this.inFlight.clear();
  }
}
