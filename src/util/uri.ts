import * as vscode from "vscode";

/** "path/relative/to/workspace:line" for a string URI and 0-based line. */
export function relPathLine(uri: string, line: number): string {
  return `${vscode.workspace.asRelativePath(vscode.Uri.parse(uri))}:${line + 1}`;
}

/** Just the relative-to-workspace path for a string URI. */
export function relPath(uri: string): string {
  return vscode.workspace.asRelativePath(vscode.Uri.parse(uri));
}
