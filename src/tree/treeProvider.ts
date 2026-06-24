import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ManualTask, TagMatch, TreeNode } from "../models/types";
import { ScanStore } from "../scanner/scanStore";
import { expandToAncestors, taskMatchesFilter } from "../tasks/filter";
import { sortTasks } from "../tasks/sort";
import { TaskStore } from "../tasks/taskStore";
import { folderByKey, getFolders, isMultiRoot } from "../workspace/folders";
import { groupScanned, matchNodes } from "./grouping";
import { buildMatchTooltip } from "./matchTooltip";
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

  async resolveTreeItem(
    item: vscode.TreeItem,
    node: TreeNode,
    token: vscode.CancellationToken,
  ): Promise<vscode.TreeItem> {
    if (node.kind === "match") {
      const tooltip = await buildMatchTooltip(node.match);
      if (!token.isCancellationRequested) {
        item.tooltip = tooltip;
      }
    }
    return item;
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
      case "task": {
        const folder = folderByKey(node.folderUri);
        return folder ? this.taskChildrenOf(folder, node.task.id) : [];
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
    const visible = await this.visibleTasks(folder);
    const folderUri = folder.uri.toString();
    const ids = new Set(visible.map((t) => t.id));
    // Tasks whose parent isn't in this folder's visible set (deleted or filtered out)
    // are surfaced at top level so they remain reachable.
    const isTopLevel = (t: ManualTask): boolean => !t.parentId || !ids.has(t.parentId);
    const childrenOf = (parentId: string): ManualTask[] =>
      visible.filter((t) => t.parentId === parentId);
    const nodes: TreeNode[] = visible.filter(isTopLevel).map((task) => ({
      kind: "task" as const,
      task,
      folderUri,
      hasChildren: childrenOf(task.id).length > 0,
    }));
    // The quick-add row is hidden while a filter is active — filtering is for finding existing
    // things, and a "+ Add task…" row that always matches would be misleading.
    if (!this.filter) {
      nodes.unshift({ kind: "quickAdd", folderUri });
    } else if (nodes.length === 0) {
      nodes.push({
        kind: "emptyHint",
        id: `noTasks:${folderUri}`,
        label: `No tasks matching “${this.filter}”`,
        tooltip: "Clear the filter from the view title to see all your tasks.",
      });
    }
    return nodes;
  }

  private async taskChildrenOf(
    folder: vscode.WorkspaceFolder,
    parentId: string,
  ): Promise<TreeNode[]> {
    const visible = await this.visibleTasks(folder);
    const folderUri = folder.uri.toString();
    const childrenOf = (id: string): ManualTask[] => visible.filter((t) => t.parentId === id);
    return childrenOf(parentId).map((task) => ({
      kind: "task" as const,
      task,
      folderUri,
      hasChildren: childrenOf(task.id).length > 0,
    }));
  }

  /**
   * Loaded + sorted tasks for the folder, with the filter applied. Filtered-out
   * tasks whose descendants match are still included, so a hit deep in the tree
   * stays reachable through its parents.
   */
  private async visibleTasks(folder: vscode.WorkspaceFolder): Promise<ManualTask[]> {
    const all = sortTasks(await this.taskStore.getTasks(folder), this.config.all.taskSort);
    if (!this.filter) {
      return all;
    }
    const lower = this.filter.toLowerCase();
    const direct = all.filter((t) => taskMatchesFilter(t, lower)).map((t) => t.id);
    const visible = expandToAncestors(all, direct);
    return all.filter((t) => visible.has(t.id));
  }

  // ----- Scanned section -----

  private scannedSectionChildren(): TreeNode[] {
    const folders = getFolders();
    if (folders.length === 0) {
      return this.groupedChildren(this.matchesForFolder(undefined));
    }
    if (isMultiRoot()) {
      const populated = folders
        .filter((folder) => this.matchesForFolder(folder.uri.toString()).length > 0)
        .map(
          (folder) =>
            ({
              kind: "scanFolder",
              folderUri: folder.uri.toString(),
              label: folder.name,
            }) as TreeNode,
        );
      return populated.length > 0 ? populated : [this.emptyScanHint()];
    }
    const children = this.groupedChildren(this.matchesForFolder(folders[0].uri.toString()));
    return children.length > 0 ? children : [this.emptyScanHint()];
  }

  /** Hint shown under "Found in Code" when the scan has produced zero matches. */
  private emptyScanHint(): TreeNode {
    return {
      kind: "emptyHint",
      id: "noScannedMatches",
      label: this.filter
        ? `No matches for “${this.filter}”`
        : "No TODO comments found — add // TODO:, # FIXME:, etc. to any file",
      tooltip: this.filter
        ? "Clear the filter from the view title to see all results."
        : "The scanner ignores prose and strings — only comments are checked. Configure tags in settings.",
    };
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
