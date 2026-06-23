import * as vscode from "vscode";
import { ManualTask, TaskPriority } from "../models/types";
import { TaskStore } from "../tasks/taskStore";
import { parseDueDate } from "../util/date";

type PanelMessage =
  | { type: "save"; title: string; priority: string; dueDate: string; note: string }
  | { type: "openLink" };

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

/** A single, reusable "Task Details" webview for viewing and editing a task (incl. a large note field). */
export class TaskDetailPanel {
  private static current: TaskDetailPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private folder: vscode.WorkspaceFolder | undefined;
  private taskId = "";

  static show(taskStore: TaskStore, folder: vscode.WorkspaceFolder, task: ManualTask): void {
    if (TaskDetailPanel.current) {
      TaskDetailPanel.current.load(folder, task);
      TaskDetailPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "todoIt.taskDetail",
      "Task Details",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    TaskDetailPanel.current = new TaskDetailPanel(panel, taskStore);
    TaskDetailPanel.current.load(folder, task);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly taskStore: TaskStore,
  ) {
    this.panel.webview.html = this.render();
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: PanelMessage) => void this.onMessage(message),
      undefined,
      this.disposables,
    );
  }

  private load(folder: vscode.WorkspaceFolder, task: ManualTask): void {
    this.folder = folder;
    this.taskId = task.id;
    this.panel.title = task.title || "Task Details";
    const link = task.link
      ? {
          path: `${vscode.workspace.asRelativePath(vscode.Uri.parse(task.link.uri))}:${task.link.line + 1}`,
        }
      : null;
    void this.panel.webview.postMessage({
      type: "load",
      task: {
        title: task.title,
        priority: task.priority ?? "",
        dueDate: task.dueDate ?? "",
        note: task.note ?? "",
        link,
      },
    });
  }

  private async onMessage(message: PanelMessage): Promise<void> {
    if (!this.folder) {
      return;
    }
    if (message.type === "openLink") {
      await this.openLink();
      return;
    }
    if (message.type !== "save") {
      return;
    }
    const title = message.title.trim();
    if (!title) {
      void this.panel.webview.postMessage({ type: "status", error: "Title cannot be empty." });
      return;
    }
    let dueDate: string | undefined;
    if (message.dueDate.trim()) {
      dueDate = parseDueDate(message.dueDate);
      if (!dueDate) {
        void this.panel.webview.postMessage({
          type: "status",
          error: "Invalid due date — try 2026-06-01, 3 days, 2 weeks…",
        });
        return;
      }
    }
    const priority = (["low", "medium", "high"].includes(message.priority)
      ? message.priority
      : undefined) as TaskPriority | undefined;
    const note = message.note.trim() ? message.note : undefined;

    await this.taskStore.updateTask(this.folder, this.taskId, { title, priority, dueDate, note });
    this.panel.title = title;
    void this.panel.webview.postMessage({ type: "status", saved: true, dueDate: dueDate ?? "" });
  }

  private async openLink(): Promise<void> {
    if (!this.folder) {
      return;
    }
    const tasks = await this.taskStore.getTasks(this.folder);
    const task = tasks.find((t) => t.id === this.taskId);
    if (!task?.link) {
      return;
    }
    const uri = vscode.Uri.parse(task.link.uri);
    const pos = new vscode.Position(task.link.line, task.link.column ?? 0);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }

  private dispose(): void {
    TaskDetailPanel.current = undefined;
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private render(): string {
    const nonce = makeNonce();
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
  label { display: block; margin: 14px 0 4px; color: var(--vscode-descriptionForeground); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  input, select, textarea {
    width: 100%; box-sizing: border-box; padding: 6px 8px; font-family: inherit; font-size: 13px;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px;
  }
  textarea { resize: vertical; min-height: 220px; line-height: 1.5; }
  input:focus, select:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  .row { display: flex; gap: 12px; }
  .row > div { flex: 1; }
  .actions { margin-top: 16px; display: flex; align-items: center; gap: 12px; }
  button {
    padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-family: inherit;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #status { font-size: 12px; }
  #status.ok { color: var(--vscode-charts-green, #89d185); }
  #status.err { color: var(--vscode-errorForeground); }
  .hint { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 4px; }
  .link-row { display: flex; align-items: center; gap: 8px; }
  .link-row code {
    flex: 1; padding: 6px 8px; border-radius: 4px; font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textBlockQuote-background); color: var(--vscode-textPreformat-foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .link-row button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .link-row button:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>
  <label for="title">Title</label>
  <input id="title" type="text" />
  <div class="row">
    <div>
      <label for="priority">Priority</label>
      <select id="priority">
        <option value="">None</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
    <div>
      <label for="due">Due date</label>
      <input id="due" type="text" placeholder="2026-06-01 or 2 weeks" />
    </div>
  </div>
  <div id="linkRow" style="display:none">
    <label>Linked source</label>
    <div class="link-row">
      <code id="linkPath" title=""></code>
      <button id="openLink" type="button">Open</button>
    </div>
  </div>
  <label for="note">Note</label>
  <textarea id="note" placeholder="Add details…"></textarea>
  <div class="hint">Due date accepts an exact date (YYYY-MM-DD) or a relative one (tomorrow, 3 days, 2 weeks, 1 month).</div>
  <div class="actions">
    <button id="save">Save</button>
    <span id="status"></span>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const byId = (id) => document.getElementById(id);
    function setStatus(text, isError) {
      const el = byId('status');
      el.textContent = text;
      el.className = isError ? 'err' : 'ok';
    }
    function save() {
      vscode.postMessage({
        type: 'save',
        title: byId('title').value,
        priority: byId('priority').value,
        dueDate: byId('due').value,
        note: byId('note').value,
      });
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'load') {
        byId('title').value = msg.task.title;
        byId('priority').value = msg.task.priority;
        byId('due').value = msg.task.dueDate;
        byId('note').value = msg.task.note;
        const row = byId('linkRow');
        if (msg.task.link) {
          // textContent is XSS-safe — the path never reaches innerHTML.
          byId('linkPath').textContent = msg.task.link.path;
          byId('linkPath').title = msg.task.link.path;
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
        setStatus('', false);
      } else if (msg.type === 'status') {
        if (msg.error) {
          setStatus(msg.error, true);
        } else if (msg.saved) {
          if (msg.dueDate) { byId('due').value = msg.dueDate; }
          setStatus('Saved ✓', false);
        }
      }
    });
    byId('save').addEventListener('click', save);
    byId('openLink').addEventListener('click', () => vscode.postMessage({ type: 'openLink' }));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    });
  </script>
</body>
</html>`;
  }
}
