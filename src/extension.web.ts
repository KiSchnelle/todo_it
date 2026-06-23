import * as vscode from "vscode";
import { activateCommon } from "./activate";
import { JsScanner } from "./scanner/jsScanner";

/** Web-host entry point: scans via `workspace.fs` since `child_process`/ripgrep aren't available. */
export function activate(context: vscode.ExtensionContext): void {
  activateCommon(context, (logger) => new JsScanner(logger));
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions.
}
