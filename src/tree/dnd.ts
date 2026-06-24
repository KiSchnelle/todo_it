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
    // Group dragged tasks by folder + parentId. Reorder only operates within a
    // single sibling list; cross-parent drags are no-ops here.
    type Bucket = { folderUri: string; parentId: string | undefined; ids: string[] };
    const byBucket = new Map<string, Bucket>();
    for (const node of dragged) {
      if (node.kind !== "task") {
        continue;
      }
      const key = `${node.folderUri}|${node.task.parentId ?? ""}`;
      const bucket = byBucket.get(key) ?? { folderUri: node.folderUri, parentId: node.task.parentId, ids: [] };
      bucket.ids.push(node.task.id);
      byBucket.set(key, bucket);
    }
    for (const { folderUri, parentId, ids } of byBucket.values()) {
      const folder = folderByKey(folderUri);
      if (!folder) {
        continue;
      }
      const where = resolveTarget(folderUri, parentId, target);
      if (where === null) {
        continue;
      }
      await this.taskStore.reorder(folder, ids, where);
    }
  }
}

function sameParent(target: TreeNode, parentId: string | undefined): boolean {
  return target.kind === "task" && target.task.parentId === parentId;
}

function resolveTarget(
  folderUri: string,
  parentId: string | undefined,
  target: TreeNode | undefined,
): ReorderTarget | null {
  if (!target) {
    return "END";
  }
  if (target.kind === "task") {
    if (target.folderUri !== folderUri) {
      return null;
    }
    return sameParent(target, parentId) ? target.task.id : null;
  }
  if (target.kind === "quickAdd") {
    // The quick-add row only sits above the top-level list.
    return target.folderUri === folderUri && parentId === undefined ? "TOP" : null;
  }
  if (target.kind === "taskFolder") {
    return target.folderUri === folderUri && parentId === undefined ? "END" : null;
  }
  if (target.kind === "section" && target.id === "tasks") {
    return parentId === undefined ? "END" : null;
  }
  return null;
}
