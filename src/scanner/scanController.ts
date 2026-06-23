import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { Logger } from "../util/logger";
import { getFolders } from "../workspace/folders";
import { Scanner } from "./scanner";
import { ScanStore } from "./scanStore";

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
    this.store.setTruncated(false);
    await Promise.all(getFolders().map((folder) => this.scanFolder(folder)));
  }

  async scanFolder(folder: vscode.WorkspaceFolder): Promise<void> {
    const key = `folder:${folder.uri.toString()}`;
    const token = this.begin(key);
    try {
      const { results, truncated } = await this.scanner.scanFolder(folder, this.config.all, token);
      if (token.isCancellationRequested) {
        return;
      }
      this.store.replaceFolder(folder.uri.toString(), results);
      if (truncated) {
        this.store.setTruncated(true);
      }
    } catch (err) {
      this.logger.error(`Scan failed for "${folder.name}"`, err);
    } finally {
      this.end(key);
    }
  }

  async scanFile(folder: vscode.WorkspaceFolder, fileUri: vscode.Uri): Promise<void> {
    const key = `file:${fileUri.toString()}`;
    const token = this.begin(key);
    try {
      const { results } = await this.scanner.scanFile(folder, fileUri, this.config.all, token);
      if (token.isCancellationRequested) {
        return;
      }
      this.store.replaceFile(
        results[0] ?? { uri: fileUri.toString(), folderUri: folder.uri.toString(), matches: [], scannedAt: Date.now() },
      );
    } catch (err) {
      this.logger.error(`Scan failed for ${fileUri.fsPath}`, err);
    } finally {
      this.end(key);
    }
  }

  private begin(key: string): vscode.CancellationToken {
    this.inFlight.get(key)?.cancel();
    const cts = new vscode.CancellationTokenSource();
    this.inFlight.set(key, cts);
    return cts.token;
  }

  private end(key: string): void {
    const cts = this.inFlight.get(key);
    if (cts) {
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
