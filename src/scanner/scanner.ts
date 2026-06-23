import * as vscode from "vscode";
import { ScannedFileResult, TodoItConfig } from "../models/types";

export interface ScanResult {
  results: ScannedFileResult[];
  truncated: boolean;
}

/** Strategy interface — implemented natively by `RipgrepScanner` and via VS Code APIs by `JsScanner`. */
export interface Scanner {
  scanFolder(
    folder: vscode.WorkspaceFolder,
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult>;

  scanFile(
    folder: vscode.WorkspaceFolder,
    fileUri: vscode.Uri,
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult>;
}
