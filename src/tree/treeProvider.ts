import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { TagMatch, TreeNode } from "../models/types";
import { ScanStore } from "../scanner/scanStore";
import { sortTasks } from "../tasks/sort";
import { TaskStore } from "../tasks/taskStore";
import { folderByKey, getFolders, isMultiRoot } from "../workspace/folders";
import { groupScanned, matchNodes } from "./grouping";
import { toTreeItem } from "./nodes";

export class TodoTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly taskStore: TaskStore,
    private readonly scanStore: ScanStore,
    private readonly config: Configuration,
  ) {}

  refresh(node?: TreeNode): void {
    this._onDidChangeTreeData.fire(node);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    return toTreeItem(node);
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!node) {
      if (getFolders().length === 0) {
        return [];
      }
      return [
        { kind: "section", id: "tasks", label: "My Tasks" },
        { kind: "section", id: "scanned", label: "Found in Code" },
      ];
    }
    switch (node.kind) {
      case "section":
        return node.id === "tasks" ? this.taskSectionChildren() : this.scannedSectionChildren();
      case "taskFolder": {
        const folder = folderByKey(node.folderUri);
        return folder ? this.taskNodes(folder) : [];
      }
      case "scanFolder":
        return this.groupedChildren(this.matchesForFolder(node.folderUri));
      case "tagGroup":
        return matchNodes(
          this.matchesForFolder(node.folderUri).filter((m) => m.tag === node.tag),
        );
      case "fileGroup":
        return matchNodes(this.scanStore.matchesForUri(node.uri));
      default:
        return [];
    }
  }

  // ----- Tasks section -----

  private async taskSectionChildren(): Promise<TreeNode[]> {
    const folders = getFolders();
    if (folders.length === 0) {
      return [];
    }
    if (isMultiRoot()) {
      return folders.map((folder) => ({
        kind: "taskFolder",
        folderUri: folder.uri.toString(),
        label: folder.name,
      }));
    }
    return this.taskNodes(folders[0]);
  }

  private async taskNodes(folder: vscode.WorkspaceFolder): Promise<TreeNode[]> {
    const tasks = sortTasks(await this.taskStore.getTasks(folder), this.config.all.taskSort);
    return tasks.map((task) => ({ kind: "task", task, folderUri: folder.uri.toString() }));
  }

  // ----- Scanned section -----

  private scannedSectionChildren(): TreeNode[] {
    const folders = getFolders();
    if (folders.length === 0) {
      return this.groupedChildren(this.scanStore.allMatches());
    }
    if (isMultiRoot()) {
      return folders
        .filter((folder) => this.scanStore.hasFolder(folder.uri.toString()))
        .map((folder) => ({
          kind: "scanFolder",
          folderUri: folder.uri.toString(),
          label: folder.name,
        }));
    }
    return this.groupedChildren(this.matchesForFolder(folders[0].uri.toString()));
  }

  private matchesForFolder(folderUri: string | undefined): TagMatch[] {
    const all = this.scanStore.allMatches();
    return folderUri ? all.filter((m) => m.folderUri === folderUri) : all;
  }

  private groupedChildren(matches: TagMatch[]): TreeNode[] {
    return groupScanned(matches, this.config.all.grouping);
  }
}
