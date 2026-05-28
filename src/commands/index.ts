import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { GroupingMode, TaskPriority, TaskSortMode, TreeNode } from "../models/types";
import { ScanController } from "../scanner/scanController";
import { TaskStore } from "../tasks/taskStore";
import { parseDueDate } from "../util/date";
import { TaskDetailPanel } from "../webview/taskDetailPanel";
import { folderByKey, pickFolder } from "../workspace/folders";

export interface CommandDeps {
  taskStore: TaskStore;
  scanController: ScanController;
  config: Configuration;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { taskStore, scanController, config } = deps;
  context.subscriptions.push(
    vscode.commands.registerCommand("todoIt.refresh", () => scanController.scanAll()),
    vscode.commands.registerCommand("todoIt.addTask", () => addTask(taskStore)),
    vscode.commands.registerCommand("todoIt.editTask", (node?: TreeNode) => editTask(taskStore, node)),
    vscode.commands.registerCommand("todoIt.deleteTask", (node?: TreeNode) => deleteTask(taskStore, node)),
    vscode.commands.registerCommand("todoIt.toggleTaskDone", (node?: TreeNode) =>
      toggleTaskDone(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.openMatch", (node?: TreeNode) => openMatch(node)),
    vscode.commands.registerCommand("todoIt.toggleDecorations", () => toggleDecorations()),
    vscode.commands.registerCommand("todoIt.setGrouping", () => setGrouping(config)),
    vscode.commands.registerCommand("todoIt.groupByTag", () => config.setGrouping("tag")),
    vscode.commands.registerCommand("todoIt.groupByFile", () => config.setGrouping("file")),
    vscode.commands.registerCommand("todoIt.groupFlat", () => config.setGrouping("flat")),
    vscode.commands.registerCommand("todoIt.setTaskSort", () => setTaskSort(config)),
  );
}

interface PickResult<T> {
  value: T;
}

/** QuickPick for a task priority. Returns undefined when cancelled; `{ value: undefined }` clears it. */
async function pickPriority(current?: TaskPriority): Promise<PickResult<TaskPriority | undefined> | undefined> {
  const picked = await vscode.window.showQuickPick<vscode.QuickPickItem & { value?: TaskPriority }>(
    [
      { label: "$(chevron-up) High", value: "high" },
      { label: "$(dash) Medium", value: "medium" },
      { label: "$(chevron-down) Low", value: "low" },
      { label: "$(circle-slash) None", value: undefined },
    ],
    { placeHolder: current ? `Priority (current: ${current})` : "Set priority (Esc to skip)" },
  );
  return picked ? { value: picked.value } : undefined;
}

/**
 * QuickPick for a due date with presets and a custom (relative or exact) option.
 * Returns undefined when cancelled; `{ value: undefined }` clears the date.
 */
async function pickDueDate(current?: string): Promise<PickResult<string | undefined> | undefined> {
  const presets: Array<{ label: string; input: string }> = [
    { label: "$(circle-slash) No due date", input: "" },
    { label: "$(clock) Today", input: "today" },
    { label: "$(clock) Tomorrow", input: "tomorrow" },
    { label: "$(clock) In 3 days", input: "3 days" },
    { label: "$(clock) In 1 week", input: "1 week" },
    { label: "$(clock) In 2 weeks", input: "2 weeks" },
    { label: "$(clock) In 1 month", input: "1 month" },
    { label: "$(edit) Custom…", input: "__custom__" },
  ];
  const picked = await vscode.window.showQuickPick(
    presets.map((p) => ({
      label: p.label,
      description: p.input && p.input !== "__custom__" ? parseDueDate(p.input) : undefined,
      input: p.input,
    })),
    { placeHolder: current ? `Due date (current: ${current})` : "Set due date (Esc to skip)" },
  );
  if (!picked) {
    return undefined;
  }
  if (picked.input === "") {
    return { value: undefined };
  }
  if (picked.input === "__custom__") {
    const raw = await vscode.window.showInputBox({
      prompt: "Due date — exact (YYYY-MM-DD) or relative (e.g. 3 days, 2 weeks, 1 month)",
      value: current ?? "",
      validateInput: (v) =>
        v.trim() === "" || parseDueDate(v) ? undefined : "Try e.g. 2026-06-01, 3 days, 2 weeks, 1 month",
    });
    if (raw === undefined) {
      return undefined;
    }
    return { value: raw.trim() === "" ? undefined : parseDueDate(raw) };
  }
  return { value: parseDueDate(picked.input) };
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
  const uri = vscode.Uri.parse(node.match.uri);
  const position = new vscode.Position(node.match.line, node.match.startCol);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

async function addTask(taskStore: TaskStore): Promise<void> {
  const folder = await pickFolder("Add task to which folder?");
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
  // Create immediately so the task is never lost if the optional steps are skipped (Esc).
  const task = await taskStore.addTask(folder, { title: title.trim() });

  const priority = await pickPriority();
  if (priority?.value) {
    await taskStore.updateTask(folder, task.id, { priority: priority.value });
  }
  const due = await pickDueDate();
  if (due?.value) {
    await taskStore.updateTask(folder, task.id, { dueDate: due.value });
  }
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
