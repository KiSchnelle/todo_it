import * as vscode from "vscode";
import { ManualTask, TagMatch, TaskPriority, TreeNode } from "../models/types";
import { MD_TASK_TAG } from "../scanner/markdownTasks";
import { relPathLine } from "../util/uri";

function priorityIcon(priority: TaskPriority): vscode.ThemeIcon {
  switch (priority) {
    case "high":
      return new vscode.ThemeIcon("chevron-up", new vscode.ThemeColor("charts.red"));
    case "medium":
      return new vscode.ThemeIcon("dash", new vscode.ThemeColor("charts.yellow"));
    case "low":
      return new vscode.ThemeIcon("chevron-down", new vscode.ThemeColor("charts.blue"));
  }
}

function sectionItem(node: Extract<TreeNode, { kind: "section" }>): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
  item.id = `section:${node.id}`;
  item.contextValue = `section.${node.id}`;
  item.iconPath = new vscode.ThemeIcon(node.id === "tasks" ? "checklist" : "search");
  return item;
}

function folderItem(folderUri: string, label: string, contextValue: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
  item.id = `${contextValue}:${folderUri}`;
  item.contextValue = contextValue;
  item.iconPath = new vscode.ThemeIcon("folder");
  return item;
}

function taskItem(task: ManualTask, folderUri: string, hasChildren: boolean): vscode.TreeItem {
  const hasNote = !!task.note?.trim();
  const links = task.links ?? [];
  const item = new vscode.TreeItem(
    task.title,
    hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
  );
  item.id = `task:${folderUri}:${task.id}`;
  // Space-separated "tokens" so `viewItem =~ /\\btask\\b/` matches both forms,
  // `viewItem =~ /\\blinked\\b/` matches linked tasks, and
  // `viewItem =~ /\\bchild\\b/` matches subtasks (have a parentId).
  const tokens = ["task"];
  if (links.length > 0) {
    tokens.push("linked");
  }
  if (task.parentId) {
    tokens.push("child");
  }
  item.contextValue = tokens.join(" ");
  item.checkboxState = task.done
    ? vscode.TreeItemCheckboxState.Checked
    : vscode.TreeItemCheckboxState.Unchecked;

  const bits: string[] = [];
  if (task.priority) {
    bits.push(task.priority);
  }
  if (task.dueDate) {
    bits.push(`due ${task.dueDate}`);
  }
  if (hasNote) {
    bits.push("📝");
  }
  if (links.length === 1) {
    bits.push(`🔗 ${relPathLine(links[0].uri, links[0].line)}`);
  } else if (links.length > 1) {
    bits.push(`🔗 ${relPathLine(links[0].uri, links[0].line)} +${links.length - 1} more`);
  }
  item.description = bits.length > 0 ? bits.join(" · ") : undefined;
  if (task.priority) {
    item.iconPath = priorityIcon(task.priority);
  }

  // Full details on hover. Plain string (not MarkdownString) — notes can come from a shared todos.json.
  const tooltip = [task.title];
  if (task.priority) {
    tooltip.push(`Priority: ${task.priority}`);
  }
  if (task.dueDate) {
    tooltip.push(`Due: ${task.dueDate}`);
  }
  if (links.length > 0) {
    tooltip.push("Linked sources:");
    for (const l of links) {
      tooltip.push(`  · ${relPathLine(l.uri, l.line)}`);
    }
  }
  if (hasNote) {
    tooltip.push(`\nNote:\n${task.note}`);
  }
  item.tooltip = tooltip.join("\n");

  // Click the task to open the full details panel.
  item.command = {
    command: "todoIt.editTask",
    title: "Open Task",
    arguments: [{ kind: "task", task, folderUri, hasChildren } satisfies TreeNode],
  };
  return item;
}

function quickAddItem(node: Extract<TreeNode, { kind: "quickAdd" }>): vscode.TreeItem {
  const item = new vscode.TreeItem("Add a task…", vscode.TreeItemCollapsibleState.None);
  item.id = `quickAdd:${node.folderUri}`;
  item.contextValue = "quickAdd";
  item.iconPath = new vscode.ThemeIcon("add");
  item.tooltip = "Add a new task — title only; details editable afterwards";
  item.command = {
    command: "todoIt.addTask",
    title: "Add Task",
    arguments: [node.folderUri],
  };
  return item;
}

function tagGroupItem(node: Extract<TreeNode, { kind: "tagGroup" }>): vscode.TreeItem {
  const isMd = node.tag === MD_TASK_TAG;
  const label = isMd ? "Markdown checklist" : node.tag;
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
  item.id = `tagGroup:${node.folderUri ?? ""}:${node.tag}`;
  item.contextValue = "tagGroup";
  item.iconPath = new vscode.ThemeIcon(isMd ? "checklist" : "tag");
  if (node.count !== undefined) {
    item.description = String(node.count);
  }
  return item;
}

function fileGroupItem(node: Extract<TreeNode, { kind: "fileGroup" }>): vscode.TreeItem {
  const uri = vscode.Uri.parse(node.uri);
  const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.Collapsed);
  item.id = `fileGroup:${node.uri}`;
  item.contextValue = "fileGroup";
  item.resourceUri = uri;
  if (node.count !== undefined) {
    item.description = String(node.count);
  }
  return item;
}

function matchItem(match: TagMatch): vscode.TreeItem {
  const label = match.text.length > 0 ? match.text : match.lineText.trim();
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.id = match.matchId;
  const isMd = match.tag === MD_TASK_TAG;
  // Space-separated tokens so menu `when` clauses can target markdown tasks specifically.
  item.contextValue = isMd ? "match mdTask" : "match";
  item.description = relPathLine(match.uri, match.line);
  // tooltip is set lazily by TodoTreeProvider.resolveTreeItem (with a context preview).
  if (isMd) {
    item.iconPath = new vscode.ThemeIcon("circle-large-outline");
    // The check toggles `- [ ]` → `- [x]` in the source markdown file.
    item.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
  } else {
    item.iconPath = new vscode.ThemeIcon("circle-filled");
  }
  item.command = {
    command: "todoIt.openMatch",
    title: "Open",
    arguments: [{ kind: "match", match } satisfies TreeNode],
  };
  return item;
}

function emptyHintItem(node: Extract<TreeNode, { kind: "emptyHint" }>): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
  item.id = `emptyHint:${node.id}`;
  item.contextValue = "emptyHint";
  item.iconPath = new vscode.ThemeIcon("info");
  item.tooltip = node.tooltip;
  return item;
}

export function toTreeItem(node: TreeNode): vscode.TreeItem {
  switch (node.kind) {
    case "section":
      return sectionItem(node);
    case "taskFolder":
      return folderItem(node.folderUri, node.label, "taskFolder");
    case "task":
      return taskItem(node.task, node.folderUri, node.hasChildren ?? false);
    case "quickAdd":
      return quickAddItem(node);
    case "scanFolder":
      return folderItem(node.folderUri, node.label, "scanFolder");
    case "tagGroup":
      return tagGroupItem(node);
    case "fileGroup":
      return fileGroupItem(node);
    case "match":
      return matchItem(node.match);
    case "emptyHint":
      return emptyHintItem(node);
  }
}
