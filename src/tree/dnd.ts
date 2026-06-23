import * as vscode from "vscode";
import { TreeNode } from "../models/types";
import { ReorderTarget } from "../tasks/reorder";
import { TaskStore } from "../tasks/taskStore";
import { folderByKey } from "../workspace/folders";

// VS Code reserves the prefix `application/vnd.code.tree.<viewId>` for in-tree DnD.
const MIME = "application/vnd.code.tree.todoit.view";

/**
 * Drag-and-drop for manual tasks. Drops are clamped to the source task's own
 * folder — moving a task between workspace folders isn't supported (and would
 * be confusing because folders are independent stores).
 */
export class TaskDnDController implements vscode.TreeDragAndDropController<TreeNode> {
  readonly dropMimeTypes = [MIME];
  readonly dragMimeTypes = [MIME];

  constructor(private readonly taskStore: TaskStore) {}

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const tasks = source.filter((n) => n.kind === "task");
    if (tasks.length === 0) {
      return;
    }
    dataTransfer.set(MIME, new vscode.DataTransferItem(tasks));
  }

  async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const item = dataTransfer.get(MIME);
    if (!item) {
      return;
    }
    const dragged = item.value as TreeNode[];
    // Group dragged tasks by folder (defensive — usually all in one folder).
    const byFolder = new Map<string, string[]>();
    for (const node of dragged) {
      if (node.kind !== "task") {
        continue;
      }
      const list = byFolder.get(node.folderUri) ?? [];
      list.push(node.task.id);
      byFolder.set(node.folderUri, list);
    }
    for (const [folderUri, ids] of byFolder) {
      const folder = folderByKey(folderUri);
      if (!folder) {
        continue;
      }
      const where = resolveTarget(folderUri, target);
      if (where === null) {
        continue;
      }
      await this.taskStore.reorder(folder, ids, where);
    }
  }
}

function resolveTarget(folderUri: string, target: TreeNode | undefined): ReorderTarget | null {
  if (!target) {
    return "END";
  }
  if (target.kind === "task") {
    return target.folderUri === folderUri ? target.task.id : null;
  }
  if (target.kind === "quickAdd") {
    return target.folderUri === folderUri ? "TOP" : null;
  }
  if (target.kind === "taskFolder") {
    return target.folderUri === folderUri ? "END" : null;
  }
  if (target.kind === "section" && target.id === "tasks") {
    return "END";
  }
  return null;
}
