import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { GroupingMode, TaskSortMode, TreeNode } from "../models/types";
import { ScanController } from "../scanner/scanController";
import { TaskStore } from "../tasks/taskStore";
import { TodoTreeProvider } from "../tree/treeProvider";
import { TaskDetailPanel } from "../webview/taskDetailPanel";
import { folderByKey, pickFolder } from "../workspace/folders";

export interface CommandDeps {
  taskStore: TaskStore;
  scanController: ScanController;
  config: Configuration;
  treeProvider: TodoTreeProvider;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { taskStore, scanController, config, treeProvider } = deps;
  context.subscriptions.push(
    vscode.commands.registerCommand("todoIt.refresh", () => scanController.scanAll()),
    vscode.commands.registerCommand("todoIt.addTask", (folderUri?: string) => addTask(taskStore, folderUri)),
    vscode.commands.registerCommand("todoIt.editTask", (node?: TreeNode) => editTask(taskStore, node)),
    vscode.commands.registerCommand("todoIt.deleteTask", (node?: TreeNode) => deleteTask(taskStore, node)),
    vscode.commands.registerCommand("todoIt.toggleTaskDone", (node?: TreeNode) =>
      toggleTaskDone(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.openMatch", (node?: TreeNode) => openMatch(node)),
    vscode.commands.registerCommand("todoIt.trackAsTask", (node?: TreeNode) => trackAsTask(taskStore, node)),
    vscode.commands.registerCommand("todoIt.openTaskLink", (node?: TreeNode) => openTaskLink(node)),
    vscode.commands.registerCommand("todoIt.toggleDecorations", () => toggleDecorations()),
    vscode.commands.registerCommand("todoIt.setGrouping", () => setGrouping(config)),
    vscode.commands.registerCommand("todoIt.groupByTag", () => config.setGrouping("tag")),
    vscode.commands.registerCommand("todoIt.groupByFile", () => config.setGrouping("file")),
    vscode.commands.registerCommand("todoIt.groupFlat", () => config.setGrouping("flat")),
    vscode.commands.registerCommand("todoIt.setTaskSort", () => setTaskSort(config)),
    vscode.commands.registerCommand("todoIt.setFilter", () => setFilter(treeProvider)),
    vscode.commands.registerCommand("todoIt.clearFilter", () => treeProvider.setFilter(undefined)),
  );
}

async function setFilter(treeProvider: TodoTreeProvider): Promise<void> {
  const current = treeProvider.getFilter();
  const value = await vscode.window.showInputBox({
    prompt: "Filter Todo It by substring (matches task titles/notes and scanned tag text, line, path)",
    placeHolder: "auth, refactor, FIXME…",
    value: current ?? "",
  });
  if (value === undefined) {
    return; // cancelled, leave filter alone
  }
  treeProvider.setFilter(value);
}

async function setTaskSort(config: Configuration): Promise<void> {
  const current = config.all.taskSort;
  const options: Array<{ label: string; mode: TaskSortMode }> = [
    { label: "Manual order", mode: "manual" },
    { label: "Priority", mode: "priority" },
    { label: "Due date", mode: "dueDate" },
  ];
  const picked = await vscode.window.showQuickPick(
    options.map((o) => ({ ...o, description: o.mode === current ? "$(check) current" : undefined })),
    { placeHolder: "Sort tasks by…" },
  );
  if (picked) {
    await config.setTaskSort(picked.mode);
  }
}

async function setGrouping(config: Configuration): Promise<void> {
  const current = config.all.grouping;
  const options: Array<{ label: string; mode: GroupingMode }> = [
    { label: "Group by Tag", mode: "tag" },
    { label: "Group by File", mode: "file" },
    { label: "Flat List", mode: "flat" },
  ];
  const picked = await vscode.window.showQuickPick(
    options.map((o) => ({
      label: o.label,
      description: o.mode === current ? "$(check) current" : undefined,
      mode: o.mode,
    })),
    { placeHolder: "Group scanned todos by…" },
  );
  if (picked) {
    await config.setGrouping(picked.mode);
  }
}

async function toggleDecorations(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("todoIt");
  const enabled = cfg.get<boolean>("decorations.enabled", true);
  await cfg.update("decorations.enabled", !enabled, vscode.ConfigurationTarget.Global);
}

async function openMatch(node?: TreeNode): Promise<void> {
  if (node?.kind !== "match") {
    return;
  }
  await revealAt(node.match.uri, node.match.line, node.match.startCol);
}

async function openTaskLink(node?: TreeNode): Promise<void> {
  if (node?.kind !== "task" || !node.task.link) {
    return;
  }
  const { uri, line, column } = node.task.link;
  await revealAt(uri, line, column ?? 0);
}

async function revealAt(uri: string, line: number, column: number): Promise<void> {
  const position = new vscode.Position(line, column);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

/** Create a manual task linked to a scanned comment-tag, then open the Task Details panel to refine it. */
async function trackAsTask(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "match") {
    return;
  }
  const match = node.match;
  const folder = folderByKey(match.folderUri);
  if (!folder) {
    return;
  }
  const title = match.text.trim() || `${match.tag}: ${match.lineText.trim()}`;
  const task = await taskStore.addTask(folder, {
    title,
    link: {
      uri: match.uri,
      line: match.line,
      column: match.startCol,
      tag: match.tag,
      preview: match.lineText.trim(),
    },
  });
  TaskDetailPanel.show(taskStore, folder, task);
}

async function addTask(taskStore: TaskStore, folderUri?: string): Promise<void> {
  // If a folderUri was passed (e.g. from the inline "Add a task…" row), use it
  // directly so multi-root users don't get an extra folder picker.
  const folder = (folderUri && folderByKey(folderUri)) || (await pickFolder("Add task to which folder?"));
  if (!folder) {
    return;
  }
  const title = await vscode.window.showInputBox({
    prompt: "New task",
    placeHolder: "What needs doing?",
  });
  if (!title?.trim()) {
    return;
  }
  await taskStore.addTask(folder, { title: title.trim() });
  // Priority/due/note are set later via the Task Details panel (click the task).
}

async function editTask(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "task") {
    return;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return;
  }
  // Use the freshest copy of the task (the tree node may be a slightly stale snapshot).
  const tasks = await taskStore.getTasks(folder);
  const task = tasks.find((t) => t.id === node.task.id) ?? node.task;
  TaskDetailPanel.show(taskStore, folder, task);
}

async function deleteTask(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "task") {
    return;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `Delete task "${node.task.title}"?`,
    { modal: true },
    "Delete",
  );
  if (choice !== "Delete") {
    return;
  }
  await taskStore.removeTask(folder, node.task.id);
}

async function toggleTaskDone(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "task") {
    return;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return;
  }
  await taskStore.setDone(folder, node.task.id, !node.task.done);
}
