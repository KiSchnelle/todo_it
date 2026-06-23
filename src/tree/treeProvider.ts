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
  private filter: string | undefined;

  constructor(
    private readonly taskStore: TaskStore,
    private readonly scanStore: ScanStore,
    private readonly config: Configuration,
  ) {}

  refresh(node?: TreeNode): void {
    this._onDidChangeTreeData.fire(node);
  }

  /** Set or clear the visibility filter. Empty/undefined clears it. */
  setFilter(value: string | undefined): void {
    const next = value?.trim() ? value.trim() : undefined;
    if (this.filter === next) {
      return;
    }
    this.filter = next;
    void vscode.commands.executeCommand("setContext", "todoIt.hasFilter", !!next);
    this.refresh();
  }

  getFilter(): string | undefined {
    return this.filter;
  }

  /** Message rendered above the tree (truncation, active filter). */
  getMessage(): string | undefined {
    if (this.filter) {
      return `Filtering by “${this.filter}” — clear the filter to see everything.`;
    }
    if (this.scanStore.truncated) {
      return `Result limit (${this.config.all.maxResults}) reached. Refine todoIt.exclude or raise todoIt.maxResults.`;
    }
    return undefined;
  }

  private taskMatchesFilter(title: string, note: string | undefined): boolean {
    if (!this.filter) {
      return true;
    }
    const f = this.filter.toLowerCase();
    return title.toLowerCase().includes(f) || (note?.toLowerCase().includes(f) ?? false);
  }

  private scanMatchesFilter(m: TagMatch): boolean {
    if (!this.filter) {
      return true;
    }
    const f = this.filter.toLowerCase();
    return (
      m.text.toLowerCase().includes(f) ||
      m.lineText.toLowerCase().includes(f) ||
      m.tag.toLowerCase().includes(f) ||
      m.uri.toLowerCase().includes(f)
    );
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
    const all = sortTasks(await this.taskStore.getTasks(folder), this.config.all.taskSort);
    const tasks = all.filter((t) => this.taskMatchesFilter(t.title, t.note));
    const folderUri = folder.uri.toString();
    const nodes: TreeNode[] = tasks.map((task) => ({ kind: "task" as const, task, folderUri }));
    // The quick-add row is hidden while a filter is active — filtering is for finding existing
    // things, and a "+ Add task…" row that always matches would be misleading.
    if (!this.filter) {
      nodes.unshift({ kind: "quickAdd", folderUri });
    }
    return nodes;
  }

  // ----- Scanned section -----

  private scannedSectionChildren(): TreeNode[] {
    const folders = getFolders();
    if (folders.length === 0) {
      return this.groupedChildren(this.matchesForFolder(undefined));
    }
    if (isMultiRoot()) {
      return folders
        .filter((folder) => this.matchesForFolder(folder.uri.toString()).length > 0)
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
    const byFolder = folderUri ? all.filter((m) => m.folderUri === folderUri) : all;
    return byFolder.filter((m) => this.scanMatchesFilter(m));
  }

  private groupedChildren(matches: TagMatch[]): TreeNode[] {
    return groupScanned(matches, this.config.all.grouping);
  }
}
