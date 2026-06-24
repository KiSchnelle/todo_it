import * as vscode from "vscode";
import { TreeNode } from "../models/types";
import { isMarkdownTaskMatch, markMarkdownTaskDone } from "../scanner/markdownTaskToggle";
import { TaskStore } from "../tasks/taskStore";
import { TodoTreeProvider } from "./treeProvider";
import { folderByKey } from "../workspace/folders";

/** Routes tree checkbox toggles to the task store (for manual tasks) or the
 *  source file (for surfaced markdown tasks). On a failed markdown toggle the
 *  tree is refreshed so the optimistic Checked state snaps back to Unchecked. */
export function registerCheckboxHandler(
  treeView: vscode.TreeView<TreeNode>,
  taskStore: TaskStore,
  treeProvider: TodoTreeProvider,
): vscode.Disposable {
  return treeView.onDidChangeCheckboxState(async (event) => {
    for (const [node, state] of event.items) {
      if (node.kind === "task") {
        const folder = folderByKey(node.folderUri);
        if (!folder) {
          continue;
        }
        await taskStore.setDone(
          folder,
          node.task.id,
          state === vscode.TreeItemCheckboxState.Checked,
        );
        continue;
      }
      if (
        node.kind === "match" &&
        isMarkdownTaskMatch(node.match) &&
        state === vscode.TreeItemCheckboxState.Checked
      ) {
        const ok = await markMarkdownTaskDone(node.match);
        if (!ok) {
          // Either the file disappeared or the line no longer has "[ ]". Refresh
          // so the tree's optimistic Checked state matches reality (Unchecked).
          treeProvider.refresh();
        }
      }
    }
  });
}
