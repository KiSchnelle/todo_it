import * as vscode from "vscode";
import {
  explainMatch,
  suggestTaskPriority,
  summarizeTodos,
  trackAsTaskAI,
} from "../ai/aiCommands";
import { Configuration } from "../config/configuration";
import { GroupingMode, ManualTask, TaskLink, TaskSortMode, TreeNode } from "../models/types";
import { ScanController } from "../scanner/scanController";
import { ScanStore } from "../scanner/scanStore";
import { addDays, isoDate } from "../tasks/dueCheck";
import { renderTasksAsMarkdown } from "../tasks/exportMarkdown";
import { findExistingLinkedTask, hasExactLink } from "../tasks/linkedTaskLookup";
import { TaskStore } from "../tasks/taskStore";
import { TodoTreeProvider } from "../tree/treeProvider";
import { parseDueDate } from "../util/date";
import { relPath, relPathLine } from "../util/uri";
import { TaskDetailPanel } from "../webview/taskDetailPanel";
import { folderByKey, getFolders, pickFolder } from "../workspace/folders";

export interface CommandDeps {
  taskStore: TaskStore;
  scanController: ScanController;
  scanStore: ScanStore;
  config: Configuration;
  treeProvider: TodoTreeProvider;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { taskStore, scanController, scanStore, config, treeProvider } = deps;
  context.subscriptions.push(
    vscode.commands.registerCommand("todoIt.refresh", () => scanController.scanAll()),
    vscode.commands.registerCommand("todoIt.addTask", (folderUri?: string) => addTask(taskStore, folderUri)),
    vscode.commands.registerCommand("todoIt.editTask", (node?: TreeNode) => editTask(taskStore, node)),
    vscode.commands.registerCommand(
      "todoIt.deleteTask",
      (node?: TreeNode, selection?: readonly TreeNode[]) => deleteTask(taskStore, node, selection),
    ),
    vscode.commands.registerCommand(
      "todoIt.toggleTaskDone",
      (node?: TreeNode, selection?: readonly TreeNode[]) =>
        toggleTaskDone(taskStore, node, selection),
    ),
    vscode.commands.registerCommand(
      "todoIt.setTaskPriority",
      (node?: TreeNode, selection?: readonly TreeNode[]) =>
        setTaskPriority(taskStore, node, selection),
    ),
    vscode.commands.registerCommand("todoIt.openMatch", (node?: TreeNode) => openMatch(node)),
    vscode.commands.registerCommand("todoIt.trackAsTask", (node?: TreeNode) => trackAsTask(taskStore, node)),
    vscode.commands.registerCommand("todoIt.openTaskLink", (node?: TreeNode) =>
      openTaskLink(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.addTaskLink", (node?: TreeNode) =>
      addTaskLink(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.removeTaskLink", (node?: TreeNode) =>
      removeTaskLink(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.toggleDecorations", () => toggleDecorations()),
    vscode.commands.registerCommand("todoIt.setGrouping", () => setGrouping(config)),
    vscode.commands.registerCommand("todoIt.groupByTag", () => config.setGrouping("tag")),
    vscode.commands.registerCommand("todoIt.groupByFile", () => config.setGrouping("file")),
    vscode.commands.registerCommand("todoIt.groupFlat", () => config.setGrouping("flat")),
    vscode.commands.registerCommand("todoIt.setTaskSort", () => setTaskSort(config)),
    vscode.commands.registerCommand("todoIt.setFilter", () => setFilter(treeProvider)),
    vscode.commands.registerCommand("todoIt.clearFilter", () => treeProvider.setFilter(undefined)),
    vscode.commands.registerCommand("todoIt.goToTodo", () => goToTodo(scanStore)),
    vscode.commands.registerCommand("todoIt.addSubtask", (node?: TreeNode) =>
      addSubtask(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.moveTask", (node?: TreeNode) =>
      moveTask(taskStore, node),
    ),
    vscode.commands.registerCommand("todoIt.ai.summarizeTodos", () =>
      summarizeTodos(scanStore, config),
    ),
    vscode.commands.registerCommand("todoIt.ai.suggestPriority", (node?: TreeNode) =>
      suggestTaskPriority(taskStore, config, node),
    ),
    vscode.commands.registerCommand("todoIt.ai.trackAsTask", (node?: TreeNode) =>
      trackAsTaskAI(taskStore, config, node),
    ),
    vscode.commands.registerCommand("todoIt.ai.explainMatch", (node?: TreeNode) =>
      explainMatch(config, node),
    ),
    vscode.commands.registerCommand("todoIt.exportTasks", () => exportTasks(taskStore)),
    vscode.commands.registerCommand(
      "todoIt.snoozeTask",
      (node?: TreeNode, selection?: readonly TreeNode[]) =>
        snoozeTask(taskStore, node, selection),
    ),
  );
}

async function snoozeTask(
  taskStore: TaskStore,
  node?: TreeNode,
  selection?: readonly TreeNode[],
): Promise<void> {
  const targets = taskTargets(node, selection);
  if (targets.length === 0) {
    return;
  }
  const tomorrow = isoDate(addDays(new Date(), 1));
  const nextWeek = isoDate(addDays(new Date(), 7));
  const items: Array<vscode.QuickPickItem & { value: string | "custom" | "clear" }> = [
    { label: `$(clock) Tomorrow`, description: tomorrow, value: tomorrow },
    { label: `$(clock) Next week`, description: nextWeek, value: nextWeek },
    { label: `$(edit) Pick a date…`, description: "YYYY-MM-DD or '3 days', '2 weeks'…", value: "custom" },
    { label: `$(circle-slash) Clear snooze`, value: "clear" },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: targets.length === 1 ? `Snooze "${targets[0].task.title}" until…` : `Snooze ${targets.length} tasks until…`,
  });
  if (!picked) {
    return;
  }
  let snoozedUntil: string | undefined;
  if (picked.value === "clear") {
    snoozedUntil = undefined;
  } else if (picked.value === "custom") {
    const input = await vscode.window.showInputBox({
      prompt: "Snooze until",
      placeHolder: "2026-06-15 or 3 days, 2 weeks…",
    });
    if (!input?.trim()) {
      return;
    }
    const parsed = parseDueDate(input);
    if (!parsed) {
      void vscode.window.showErrorMessage(`Todo It: couldn't parse "${input}" as a date.`);
      return;
    }
    snoozedUntil = parsed;
  } else {
    snoozedUntil = picked.value;
  }
  for (const t of targets) {
    const folder = folderByKey(t.folderUri);
    if (folder) {
      await taskStore.updateTask(folder, t.task.id, { snoozedUntil });
    }
  }
}

async function exportTasks(taskStore: TaskStore): Promise<void> {
  const folders = getFolders();
  if (folders.length === 0) {
    void vscode.window.showWarningMessage("Todo It: open a folder to export tasks from.");
    return;
  }
  const folder = folders.length === 1
    ? folders[0]
    : await pickFolder("Export tasks from which folder?");
  if (!folder) {
    return;
  }
  const tasks = await taskStore.getTasks(folder);
  const markdown = renderTasksAsMarkdown(tasks, {
    heading: `# Tasks — ${folder.name}`,
    subheading: `_Exported ${isoDate(new Date())}_`,
    pathRenderer: (uri) => vscode.workspace.asRelativePath(vscode.Uri.parse(uri)),
  });
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(folder.uri, "TODO.md"),
    filters: { Markdown: ["md"] },
    title: "Export Todo It tasks",
  });
  if (!target) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(markdown));
  const open = await vscode.window.showInformationMessage(
    `Todo It: wrote ${tasks.length} task${tasks.length === 1 ? "" : "s"} to ${vscode.workspace.asRelativePath(target)}.`,
    "Open",
  );
  if (open === "Open") {
    await vscode.window.showTextDocument(target);
  }
}

async function addSubtask(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "task") {
    return;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return;
  }
  const title = await vscode.window.showInputBox({
    prompt: `New subtask under "${node.task.title}"`,
    placeHolder: "What needs doing?",
  });
  if (!title?.trim()) {
    return;
  }
  await taskStore.addTask(folder, { title: title.trim(), parentId: node.task.id });
}

async function moveTask(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "task") {
    return;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return;
  }
  const tasks = await taskStore.getTasks(folder);
  // Tasks that would create a cycle if chosen as the new parent (self + descendants).
  const blocked = new Set<string>([node.task.id]);
  for (const d of await taskStore.descendantsOf(folder, node.task.id)) {
    blocked.add(d.id);
  }
  const candidates = tasks.filter((t) => !blocked.has(t.id));
  const items: Array<vscode.QuickPickItem & { parentId: string | undefined }> = [
    { label: "$(home) Top level", description: "No parent", parentId: undefined },
    ...candidates.map((t) => ({
      label: `$(checklist) ${t.title}`,
      description: t.parentId ? "subtask" : "top level",
      parentId: t.id,
    })),
  ];
  const placeHolder = node.task.parentId
    ? `Move "${node.task.title}" — currently a subtask`
    : `Move "${node.task.title}" — currently top-level`;
  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  if (!picked) {
    return;
  }
  await taskStore.moveTask(folder, node.task.id, picked.parentId);
}

async function goToTodo(scanStore: ScanStore): Promise<void> {
  const matches = scanStore.allMatches();
  if (matches.length === 0) {
    void vscode.window.showInformationMessage("Todo It: no scanned todos to jump to.");
    return;
  }
  // Clone before sort — the store hands back a cached array by reference.
  const items = [...matches]
    .sort((a, b) => a.uri.localeCompare(b.uri) || a.line - b.line || a.startCol - b.startCol)
    .map((match) => ({
      label: `$(tag) ${match.tag}`,
      description: match.text || match.lineText.trim(),
      detail: relPathLine(match.uri, match.line),
      match,
    }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Search ${matches.length} todo${matches.length === 1 ? "" : "s"} by tag, text, or path…`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked) {
    const ok = await revealAt(picked.match.uri, picked.match.line, picked.match.startCol);
    if (!ok) {
      void vscode.window.showWarningMessage(
        `Todo It: couldn't open ${relPath(picked.match.uri)} — the file may have been moved or deleted.`,
      );
    }
  }
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
  const ok = await revealAt(node.match.uri, node.match.line, node.match.startCol);
  if (!ok) {
    void vscode.window.showWarningMessage(
      `Todo It: couldn't open ${relPath(node.match.uri)} — the file may have been moved or deleted.`,
    );
  }
}

/**
 * Resolves a task tree node to (folder, freshest task, links). The tree node
 * carries a snapshot from render time; reads from the store give us the up-to-date
 * state — important when links can be edited from multiple surfaces (CodeLens,
 * tree menu, Task Details panel) in quick succession.
 */
async function resolveTaskNode(
  taskStore: TaskStore,
  node: TreeNode | undefined,
): Promise<{ folder: vscode.WorkspaceFolder; task: ManualTask } | undefined> {
  if (node?.kind !== "task") {
    return undefined;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return undefined;
  }
  const task = (await taskStore.getTasks(folder)).find((t) => t.id === node.task.id) ?? node.task;
  return { folder, task };
}

async function openTaskLink(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  const resolved = await resolveTaskNode(taskStore, node);
  if (!resolved) {
    return;
  }
  const { folder, task } = resolved;
  const links = task.links ?? [];
  if (links.length === 0) {
    return;
  }
  // 1 link → open it directly. 2+ → quick-pick.
  let chosenIndex = 0;
  if (links.length > 1) {
    const picked = await vscode.window.showQuickPick(
      links.map((l, i) => ({
        label: l.label ? `$(link) ${l.label}` : `$(link) ${relPath(l.uri)}`,
        description: relPathLine(l.uri, l.line),
        index: i,
      })),
      { placeHolder: `Open which linked source? (${links.length} attached)` },
    );
    if (!picked) {
      return;
    }
    chosenIndex = picked.index;
  }
  const link = links[chosenIndex];
  const ok = await revealAt(link.uri, link.line, link.column ?? 0);
  if (ok) {
    return;
  }
  const action = await vscode.window.showWarningMessage(
    `Todo It: couldn't open ${relPath(link.uri)} — the file may have been moved or deleted.`,
    "Remove link",
  );
  if (action === "Remove link") {
    const remaining = links.filter((_, i) => i !== chosenIndex);
    await taskStore.updateTask(folder, task.id, { links: remaining });
  }
}

/**
 * Adds a linked source to a task. Picks from: the active editor (with its cursor
 * line), or a file picker. Same task can hold multiple links — useful for tasks
 * that span several files.
 */
async function addTaskLink(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  const resolved = await resolveTaskNode(taskStore, node);
  if (!resolved) {
    return;
  }
  const { folder, task } = resolved;
  const newLink = await pickLink();
  if (!newLink) {
    return;
  }
  // Skip exact duplicates (same uri+line) so repeat "Add Link" from the same
  // cursor position is a no-op.
  const existing = task.links ?? [];
  if (hasExactLink(existing, newLink)) {
    void vscode.window.showInformationMessage(
      `Todo It: ${relPathLine(newLink.uri, newLink.line)} is already linked.`,
    );
    return;
  }
  await taskStore.updateTask(folder, task.id, {
    links: [...existing, newLink],
  });
}

interface AddLinkOption extends vscode.QuickPickItem {
  // Renamed from `kind` because vscode.QuickPickItem reserves that field.
  source: "editor" | "browse";
}

async function pickLink(): Promise<TaskLink | undefined> {
  const editor = vscode.window.activeTextEditor;
  const items: AddLinkOption[] = [];
  if (editor) {
    items.push({
      label: `$(file) Current file`,
      detail: relPathLine(editor.document.uri.toString(), editor.selection.active.line),
      source: "editor",
    });
  }
  items.push({
    label: `$(folder-opened) Choose a file…`,
    detail: "Browse the workspace for any file",
    source: "browse",
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Link a source file to this task",
  });
  if (!picked) {
    return undefined;
  }
  if (picked.source === "editor" && editor) {
    return {
      uri: editor.document.uri.toString(),
      line: editor.selection.active.line,
      column: editor.selection.active.character,
    };
  }
  const choices = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: false,
    openLabel: "Link",
    title: "Pick a source file to link",
  });
  if (!choices || choices.length === 0) {
    return undefined;
  }
  return { uri: choices[0].toString(), line: 0 };
}

/** Removes one of the task's linked sources via a QuickPick. No-op if there are none. */
async function removeTaskLink(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  const resolved = await resolveTaskNode(taskStore, node);
  if (!resolved) {
    return;
  }
  const { folder, task } = resolved;
  const links = task.links ?? [];
  if (links.length === 0) {
    void vscode.window.showInformationMessage("Todo It: this task has no linked sources.");
    return;
  }
  const picked = await vscode.window.showQuickPick(
    links.map((l, i) => ({
      label: l.label ? `$(link) ${l.label}` : `$(link) ${relPath(l.uri)}`,
      description: relPathLine(l.uri, l.line),
      index: i,
    })),
    { placeHolder: "Remove which linked source?" },
  );
  if (!picked) {
    return;
  }
  const remaining = links.filter((_, i) => i !== picked.index);
  await taskStore.updateTask(folder, task.id, { links: remaining });
}

/** Opens a document URI at `line:column` and centers it. Returns true on success. */
async function revealAt(uri: string, line: number, column: number): Promise<boolean> {
  try {
    const position = new vscode.Position(line, column);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a manual task linked to a scanned comment-tag, then open the Task
 * Details panel to refine it. If a task is already linked to the same `uri:line`,
 * just reveal it — the CodeLens and the right-click menu can both fire this
 * command, so dedup keeps repeated clicks from stacking duplicates.
 */
async function trackAsTask(taskStore: TaskStore, node?: TreeNode): Promise<void> {
  if (node?.kind !== "match") {
    return;
  }
  const match = node.match;
  const folder = folderByKey(match.folderUri);
  if (!folder) {
    return;
  }
  const existing = findExistingLinkedTask(await taskStore.getTasks(folder), match);
  if (existing) {
    TaskDetailPanel.show(taskStore, folder, existing);
    return;
  }
  const title = match.text.trim() || `${match.tag}: ${match.lineText.trim()}`;
  const task = await taskStore.addTask(folder, {
    title,
    links: [
      {
        uri: match.uri,
        line: match.line,
        column: match.startCol,
        tag: match.tag,
        preview: match.lineText.trim(),
      },
    ],
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

/** Reduces a TreeView context-menu invocation to a unique list of task nodes,
 *  honoring the multi-selection when VS Code passes one. */
function taskTargets(node?: TreeNode, selection?: readonly TreeNode[]): Array<Extract<TreeNode, { kind: "task" }>> {
  const pool: TreeNode[] = selection && selection.length > 0 ? [...selection] : node ? [node] : [];
  const seen = new Set<string>();
  const out: Array<Extract<TreeNode, { kind: "task" }>> = [];
  for (const n of pool) {
    if (n.kind !== "task") {
      continue;
    }
    const key = `${n.folderUri}|${n.task.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(n);
  }
  return out;
}

async function deleteTask(
  taskStore: TaskStore,
  node?: TreeNode,
  selection?: readonly TreeNode[],
): Promise<void> {
  const targets = taskTargets(node, selection);
  if (targets.length === 0) {
    return;
  }
  // Tally descendants across the selection so the confirmation prompt is accurate.
  let extra = 0;
  for (const t of targets) {
    const folder = folderByKey(t.folderUri);
    if (folder) {
      extra += (await taskStore.descendantsOf(folder, t.task.id)).length;
    }
  }
  const prompt =
    targets.length === 1
      ? `Delete task "${targets[0].task.title}"${extra > 0 ? ` (and ${extra} subtask${extra === 1 ? "" : "s"})` : ""}?`
      : `Delete ${targets.length} tasks${extra > 0 ? ` (and ${extra} subtask${extra === 1 ? "" : "s"})` : ""}?`;
  const choice = await vscode.window.showWarningMessage(prompt, { modal: true }, "Delete");
  if (choice !== "Delete") {
    return;
  }
  for (const t of targets) {
    const folder = folderByKey(t.folderUri);
    if (folder) {
      await taskStore.removeTask(folder, t.task.id);
    }
  }
}

async function toggleTaskDone(
  taskStore: TaskStore,
  node?: TreeNode,
  selection?: readonly TreeNode[],
): Promise<void> {
  const targets = taskTargets(node, selection);
  if (targets.length === 0) {
    return;
  }
  // If everything in the selection is already done, this acts as "mark all undone".
  // Otherwise we drive all targets to done — the common bulk action.
  const allDone = targets.every((t) => t.task.done);
  const next = !allDone;
  for (const t of targets) {
    const folder = folderByKey(t.folderUri);
    if (folder) {
      await taskStore.setDone(folder, t.task.id, next);
    }
  }
}

async function setTaskPriority(
  taskStore: TaskStore,
  node?: TreeNode,
  selection?: readonly TreeNode[],
): Promise<void> {
  const targets = taskTargets(node, selection);
  if (targets.length === 0) {
    return;
  }
  const picked = await vscode.window.showQuickPick(
    [
      { label: "$(chevron-up) High", priority: "high" as const },
      { label: "$(dash) Medium", priority: "medium" as const },
      { label: "$(chevron-down) Low", priority: "low" as const },
      { label: "$(circle-slash) Clear priority", priority: undefined },
    ],
    {
      placeHolder:
        targets.length === 1
          ? `Set priority for "${targets[0].task.title}"`
          : `Set priority for ${targets.length} selected tasks`,
    },
  );
  if (!picked) {
    return;
  }
  for (const t of targets) {
    const folder = folderByKey(t.folderUri);
    if (folder) {
      await taskStore.updateTask(folder, t.task.id, { priority: picked.priority });
    }
  }
}
