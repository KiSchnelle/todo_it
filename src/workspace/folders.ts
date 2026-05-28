import * as vscode from "vscode";

export function getFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
}

export function isMultiRoot(): boolean {
  return getFolders().length > 1;
}

export function folderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

export function folderByKey(key: string): vscode.WorkspaceFolder | undefined {
  return getFolders().find((f) => f.uri.toString() === key);
}

/**
 * Pick a target folder for a folder-scoped action. Returns the only folder when
 * single-root, prompts when multi-root, and `undefined` when no folder is open
 * or the user cancels.
 */
export async function pickFolder(placeHolder: string): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = getFolders();
  if (folders.length === 0) {
    void vscode.window.showWarningMessage("Todo It: open a folder to use tasks.");
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder },
  );
  return picked?.folder;
}
