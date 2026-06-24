import * as vscode from "vscode";
import { ManualTask, TaskLink, TaskPriority } from "../models/types";
import { TaskStore } from "../tasks/taskStore";
import { parseDueDate } from "../util/date";

type PanelMessage =
  | { type: "save"; title: string; priority: string; dueDate: string; note: string }
  | { type: "openLink"; index: number }
  | { type: "removeLink"; index: number }
  | { type: "addLink" };

interface LinkView {
  path: string;
  label?: string;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function linkViews(links: TaskLink[] | undefined): LinkView[] {
  return (links ?? []).map((l) => ({
    path: `${vscode.workspace.asRelativePath(vscode.Uri.parse(l.uri))}:${l.line + 1}`,
    label: l.label,
  }));
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
    // If the task is deleted (or its links change from elsewhere), reflect it
    // here. Saving doesn't fire a self-close because the task still exists after
    // an updateTask round-trip.
    this.disposables.push(this.taskStore.onDidChange(() => void this.onStoreChanged()));
  }

  /**
   * Reacts to external task-store changes:
   *  - task deleted → dispose the panel so the user can't keep editing a ghost.
   *  - task updated (e.g. link added/removed elsewhere, AI-set priority) → re-push
   *    the links list. Title / priority / due / note stay editable; we don't
   *    clobber the user's in-progress edits to those fields.
   */
  private async onStoreChanged(): Promise<void> {
    if (!this.folder) {
      return;
    }
    const tasks = await this.taskStore.getTasks(this.folder);
    const task = tasks.find((t) => t.id === this.taskId);
    if (!task) {
      this.panel.dispose();
      return;
    }
    void this.panel.webview.postMessage({
      type: "linksChanged",
      links: linkViews(task.links),
    });
  }

  private load(folder: vscode.WorkspaceFolder, task: ManualTask): void {
    this.folder = folder;
    this.taskId = task.id;
    this.panel.title = task.title || "Task Details";
    void this.panel.webview.postMessage({
      type: "load",
      task: {
        title: task.title,
        priority: task.priority ?? "",
        dueDate: task.dueDate ?? "",
        note: task.note ?? "",
        links: linkViews(task.links),
      },
    });
  }

  private async onMessage(message: PanelMessage): Promise<void> {
    if (!this.folder) {
      return;
    }
    if (message.type === "openLink") {
      await this.openLink(message.index);
      return;
    }
    if (message.type === "removeLink") {
      await this.removeLink(message.index);
      return;
    }
    if (message.type === "addLink") {
      // Delegate to the same command the tree menu uses so behavior stays consistent.
      const tasks = await this.taskStore.getTasks(this.folder);
      const task = tasks.find((t) => t.id === this.taskId);
      if (!task) {
        return;
      }
      const folderUri = this.folder.uri.toString();
      await vscode.commands.executeCommand("todoIt.addTaskLink", {
        kind: "task",
        task,
        folderUri,
      });
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

  private async openLink(index: number): Promise<void> {
    if (!this.folder) {
      return;
    }
    const tasks = await this.taskStore.getTasks(this.folder);
    const task = tasks.find((t) => t.id === this.taskId);
    const link = task?.links?.[index];
    if (!link) {
      return;
    }
    const uri = vscode.Uri.parse(link.uri);
    const pos = new vscode.Position(link.line, link.column ?? 0);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch {
      const action = await vscode.window.showWarningMessage(
        `Todo It: couldn't open ${vscode.workspace.asRelativePath(uri)} — the file may have been moved or deleted.`,
        "Remove link",
      );
      if (action === "Remove link") {
        await this.removeLink(index);
      }
    }
  }

  private async removeLink(index: number): Promise<void> {
    if (!this.folder) {
      return;
    }
    const tasks = await this.taskStore.getTasks(this.folder);
    const task = tasks.find((t) => t.id === this.taskId);
    if (!task?.links) {
      return;
    }
    const remaining = task.links.filter((_, i) => i !== index);
    await this.taskStore.updateTask(this.folder, this.taskId, { links: remaining });
    // The links list refresh comes through onStoreChanged → linksChanged.
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

  .link-list { display: flex; flex-direction: column; gap: 6px; }
  .link-row { display: flex; align-items: center; gap: 6px; }
  .link-row code {
    flex: 1; padding: 6px 8px; border-radius: 4px; font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textBlockQuote-background); color: var(--vscode-textPreformat-foreground);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .link-row button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 4px 10px; }
  .link-row button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .link-row button.danger { color: var(--vscode-errorForeground); }
  #addLink { background: transparent; color: var(--vscode-textLink-foreground); padding: 4px 0; }
  #addLink:hover { background: transparent; text-decoration: underline; }
  #emptyLinks { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 6px 0; font-style: italic; }
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
  <label>Linked sources</label>
  <div id="linkList" class="link-list"></div>
  <div id="emptyLinks" style="display:none">No linked files — add one to quick-open it from this task.</div>
  <button id="addLink" type="button">+ Add link…</button>
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
    function applyLinks(links) {
      const list = byId('linkList');
      const empty = byId('emptyLinks');
      // Wipe and rebuild — defensive, simple.
      while (list.firstChild) { list.removeChild(list.firstChild); }
      if (!links || links.length === 0) {
        empty.style.display = '';
        return;
      }
      empty.style.display = 'none';
      links.forEach((link, i) => {
        const row = document.createElement('div');
        row.className = 'link-row';
        const code = document.createElement('code');
        // textContent is XSS-safe — the path never reaches innerHTML.
        code.textContent = link.label ? link.label + ' — ' + link.path : link.path;
        code.title = link.path;
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', () => vscode.postMessage({ type: 'openLink', index: i }));
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'danger';
        removeBtn.addEventListener('click', () => vscode.postMessage({ type: 'removeLink', index: i }));
        row.appendChild(code);
        row.appendChild(openBtn);
        row.appendChild(removeBtn);
        list.appendChild(row);
      });
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'load') {
        byId('title').value = msg.task.title;
        byId('priority').value = msg.task.priority;
        byId('due').value = msg.task.dueDate;
        byId('note').value = msg.task.note;
        applyLinks(msg.task.links);
        setStatus('', false);
      } else if (msg.type === 'linksChanged') {
        applyLinks(msg.links);
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
    byId('addLink').addEventListener('click', () => vscode.postMessage({ type: 'addLink' }));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    });
  </script>
</body>
</html>`;
  }
}
