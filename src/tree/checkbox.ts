import * as vscode from "vscode";
import { TreeNode } from "../models/types";
import { TaskStore } from "../tasks/taskStore";
import { folderByKey } from "../workspace/folders";

/** Routes tree checkbox toggles to the task store's done state. */
export function registerCheckboxHandler(
  treeView: vscode.TreeView<TreeNode>,
  taskStore: TaskStore,
): vscode.Disposable {
  return treeView.onDidChangeCheckboxState(async (event) => {
    for (const [node, state] of event.items) {
      if (node.kind !== "task") {
        continue;
      }
      const folder = folderByKey(node.folderUri);
      if (!folder) {
        continue;
      }
      await taskStore.setDone(folder, node.task.id, state === vscode.TreeItemCheckboxState.Checked);
    }
  });
}
