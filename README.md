# Todo It

**A modern, maintained alternative to Todo Tree for Visual Studio Code.** Find `TODO`, `FIXME`, `HACK`, `BUG`, and `NOTE` comment tags across your workspace, highlight them in the editor, and manage your own checkable **tasks** — with priority, due dates, notes, subtasks, and multiple linked source files — all in one sidebar.

[![CI](https://img.shields.io/github/actions/workflow/status/KiSchnelle/todo_it/ci.yml?branch=main&label=CI&logo=github)](https://github.com/KiSchnelle/todo_it/actions/workflows/ci.yml)
[![Version](https://vsmarketplacebadges.dev/version-short/KiSchnelle.todo-it.svg)](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it)
[![Installs](https://vsmarketplacebadges.dev/installs-short/KiSchnelle.todo-it.svg)](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it)
[![Rating](https://vsmarketplacebadges.dev/rating-star/KiSchnelle.todo-it.svg)](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it&ssr=false#review-details)
[![Open VSX Version](https://img.shields.io/open-vsx/v/KiSchnelle/todo-it?label=Open%20VSX)](https://open-vsx.org/extension/KiSchnelle/todo-it)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/KiSchnelle/todo-it?label=downloads)](https://open-vsx.org/extension/KiSchnelle/todo-it)
[![Open VSX Rating](https://img.shields.io/open-vsx/rating/KiSchnelle/todo-it?label=rating)](https://open-vsx.org/extension/KiSchnelle/todo-it/reviews)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> _Yes, of course it has AI — it's 2026. It's opt-in, uses your installed Language Model provider (e.g. GitHub Copilot Chat), and we don't ship a model. The rest of the extension works perfectly fine without it._ 🤖

Todo It is a fresh, MIT-licensed take on the much-loved (but unmaintained) _Todo Tree_ — rebuilt from scratch on the current VS Code APIs, with fast ripgrep scanning and a built-in task list.

```text
TODO IT
├─ 📌 My Tasks                       (click a task → Task Details panel)
│   ☐ Ship release                   high · due 2026-06-01 · 🔗 src/release.ts:12 +2 more
│   │  ☐ Cut RC tag
│   │  ☐ Run smoke tests
│   ☑ Set up CI
│   ☐ Review PR #42                  low
└─ 🔍 Found in Code
    ├─ TODO (12)
    │   ├─ refactor this loop        src/app.ts:42
    │   └─ handle the empty case     src/api.ts:8
    ├─ FIXME (3)
    │   └─ race condition here       src/db.ts:91
    └─ HACK (1)
```

## Features

### 🔍 Found in Code — comment-tag scanner
- Scans your whole workspace for tags like `TODO`, `FIXME`, `HACK`, `BUG`, `NOTE`, `XXX` inside comments — fully configurable.
- **Powered by [ripgrep](https://github.com/BurntSushi/ripgrep)** (bundled), so it stays fast even on large repos.
- **Group by tag, by file, or as a flat list** — switch any time from the view toolbar.
- **Jump to code**: click any result to open the file at the exact line and column.
- Respects `.gitignore` and your own include/exclude globs.

### ✅ Editor highlights
- Per-tag **gutter icons**, tag **coloring**, and **overview-ruler** marks so todos are visible while you code.
- Colors and icons are configurable per tag; toggle all highlighting with one command.

### 📌 My Tasks — built-in task list
- **Quick-add** at the top of *My Tasks* — single-prompt capture, plus a **drag-and-drop** to reorder.
- Add, check off (real tree **checkboxes**), and delete tasks without leaving the editor.
- **Click a task to open the Task Details panel** — a dedicated editor with title, priority, due date, and a **large multi-line note** field (save with `⌘/Ctrl+S`).
- **Flexible due dates**: an exact date (`2026-06-01`) or a relative one (`tomorrow`, `3 days`, `2 weeks`, `1 month`).
- **Sort** tasks by priority, due date, or manual order (completed tasks always sink to the bottom).
- Tasks are **persisted with your project** in `.vscode/todos.json` by default — commit them to share with your team, or switch to a private/local store.

### 🔗 Cross-link scanned ↔ task
- Right-click any scanned tag → **Track as Task** to create a manual task pre-populated with the tag text and a back-link to `file:line`.
- Linked tasks show a 🔗 indicator and an **Open Linked Source** action (inline icon, context menu, or *Open* button in the Task Details panel) to jump straight back to the code.
- **Multiple links per task** — *Add Linked Source…* on a task (right-click or the *+ Add link…* button in Task Details) pins any file:line to the task. Useful for work that spans several files. The tree shows `🔗 path:42 +2 more`; *Open Linked Source* prompts a QuickPick when more than one is attached. *Remove Linked Source…* drops any individual link.
- **Renames follow** — moving or renaming a linked file via the VS Code explorer / refactor automatically updates every affected link.

### 🪜 Subtasks
- Right-click any task → **Add Subtask** to nest tasks under a parent.
- Checking off a parent **cascades** to all descendants; deleting a parent **cascades** too (with a confirmation that names how many subtasks will go with it).
- Reorder siblings via drag-and-drop; **Move Task Under…** moves a task to a new parent (or back to the top level).

### ✋ Bulk operations
- Cmd/Ctrl-click or Shift-click to **multi-select** tasks in the tree.
- Right-click the selection to *Delete*, *Mark Done*, *Set Priority…*, or *Snooze…* all of them at once. Confirmations and prompts adapt to the count ("Delete 5 tasks (and 2 subtasks)?").

### ⏰ Snooze + due-soon notifications
- **Snooze a task** until tomorrow, next week, or any custom date — useful when a due date hasn't moved but you want to stop thinking about the task today. The 🔗 indicator persists; only the notification is silenced.
- **Opt-in notifications** (`todoIt.notifications.dueSoon`, off by default) — VS Code surfaces a notification when a task's due date arrives, with *Open* and *Snooze 1 day* actions. Each task notifies at most once per session.

### 📤 Export tasks to Markdown
- `Todo It: Export Tasks to Markdown…` writes a `TODO.md` with sections per priority, subtasks indented, and linked sources listed. Pick any save path — useful for sharing or end-of-week summaries.

### 🔎 Filter and visibility
- **Filter** by substring (matches task titles, notes, scanned tag text, line, and path) — click the funnel icon in the view title.
- **Go to Todo…** (`todoIt.goToTodo`) — a Command Palette quick-pick of every scanned todo with fuzzy search across tag, text, and path.
- **Status bar** badge shows `open tasks · todos in code` and focuses the view on click.
- **Hover preview**: hovering a scanned result shows ±2 lines of source context with the matched line highlighted.
- **CodeLens** (`todoIt.codeLens.enabled`, off by default) renders three clickable actions above each scanned tag in the editor: **Track as Task** · **AI Track** · **Explain**.

### ☑️ Markdown checklists
- Unchecked `- [ ]` lines in `.md` / `.markdown` / `.mdx` files appear under *Found in Code* under the **Markdown checklist** group.
- **Tick the checkbox right in the tree** to flip `[ ]` → `[x]` in the source file (the now-checked line drops off the tree on the next scan).
- Toggle the feature with `todoIt.markdownTasks.enabled`.

### 🪄 AI assist
AI features run through VS Code's standard [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model) — **no API key required**, and we don't ship one. You need an LM provider installed (e.g. GitHub Copilot Chat); without one, AI commands show a one-shot install hint and the rest of the extension keeps working unchanged.

- **AI: Summarize Found in Code** — themed Markdown summary of every scanned todo, plus an *Urgent* section.
- **AI: Suggest Priority** — for any task; uses title + note + linked code context, then offers a one-click *Apply*.
- **AI: Track as Task (Expanded)** — turns a cryptic `// TODO: fix it` into a real task with title, description, and a suggested priority.
- **AI: Explain Todo** — explains what a cryptic TODO is asking for, using surrounding code.
- **Chat participant** — type `@todo-it` in the Copilot Chat panel to ask free-form questions ("which TODOs touch authentication?"), or use the slash commands `@todo-it /summarize` and `@todo-it /overdue`. The `/overdue` command is pure JS (no model call) so it's instant.

### ⚡ Live, multi-root, and on the web
- **Live updates**: files are re-scanned automatically as you edit and save (debounced); deletions disappear on their own.
- **Monorepo-ready**: results and tasks are scoped per workspace folder.
- **Works in the browser** (github.dev / vscode.dev / Codespaces / Gitpod): a JavaScript fallback scanner kicks in when ripgrep isn't available.

## Getting started

1. Install **Todo It** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it) or [Open VSX](https://open-vsx.org/extension/KiSchnelle/todo-it) (works in VSCodium, Gitpod, code-server, Cursor…). Or run `Extensions: Install from VSIX…`.
2. Open the **Todo It** view from the Activity Bar (the checklist icon).
3. The **Found in Code** section fills in automatically from your workspace; click any item to jump to it.
4. Add your own tasks with the **`+`** button (or `Todo It: Add Task` from the Command Palette).

## Commands

All commands are available from the Command Palette under the **Todo It** category.

| Command | Title | Where |
| --- | --- | --- |
| `todoIt.addTask` | Add Task | View toolbar (`+`), the inline "Add a task…" row, Command Palette |
| `todoIt.addSubtask` | Add Subtask | Task context menu |
| `todoIt.moveTask` | Move Task Under… | Task context menu |
| `todoIt.editTask` | Open Task Details (title / priority / due / note) | Click a task, pencil icon |
| `todoIt.deleteTask` | Delete Task | Task context menu (cascades to subtasks) |
| `todoIt.setTaskSort` | Sort Tasks By… | My Tasks header |
| `todoIt.setFilter` / `todoIt.clearFilter` | Filter… / Clear Filter | View toolbar (funnel) |
| `todoIt.goToTodo` | Go to Todo… | Command Palette (fuzzy-pick any scanned todo) |
| `todoIt.trackAsTask` | Track as Task | Scanned tag context menu (creates a linked manual task) |
| `todoIt.openTaskLink` | Open Linked Source | Linked task inline icon + context menu (QuickPick when >1) |
| `todoIt.addTaskLink` | Add Linked Source… | Task context menu + Task Details panel (current editor or browse) |
| `todoIt.removeTaskLink` | Remove Linked Source… | Linked task context menu + Task Details panel |
| `todoIt.refresh` | Refresh | View toolbar |
| `todoIt.setGrouping` | Change Grouping | View toolbar |
| `todoIt.toggleDecorations` | Toggle Editor Highlights | View toolbar |
| `todoIt.openMatch` | Open Todo | Click a scanned result |
| `todoIt.ai.summarizeTodos` | AI: Summarize Found in Code | View toolbar / Command Palette |
| `todoIt.ai.suggestPriority` | AI: Suggest Priority | Task context menu |
| `todoIt.ai.trackAsTask` | AI: Track as Task (Expanded) | Scanned tag context menu |
| `todoIt.ai.explainMatch` | AI: Explain Todo | Scanned tag context menu |
| `todoIt.exportTasks` | Export Tasks to Markdown… | View toolbar / Command Palette |
| `todoIt.setTaskPriority` | Set Priority… | Task context menu (works on multi-selection) |
| `todoIt.snoozeTask` | Snooze… | Task context menu (works on multi-selection) |

## Settings

Configure everything under the **Todo It** section of Settings (`todoIt.*`).

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `todoIt.tags` | array | `TODO, FIXME, HACK, BUG, NOTE, XXX` | Tags to scan for, with optional `color`, `backgroundColor`, `iconPath`, and `rulerColor`. |
| `todoIt.markdownTasks.enabled` | boolean | `true` | Also surface unchecked Markdown checklists (`- [ ]`) from `.md`/`.markdown`/`.mdx` files. |
| `todoIt.statusBar.enabled` | boolean | `true` | Show task/todo counts in the status bar. |
| `todoIt.caseSensitive` | boolean | `true` | Match case-sensitively, so only `TODO` matches (not `Todo`/`todo`) — avoids catching words like "note". |
| `todoIt.commentsOnly` | boolean | `true` | Only match tags that follow a comment marker — ignores prose, strings, and code. |
| `todoIt.commentMarkers` | string[] | `// # <!-- /* * -- ; %` | Comment leaders used when `commentsOnly` is on. Tune to suit your languages. |
| `todoIt.include` | string[] | `["**/*"]` | Glob patterns of files to scan. |
| `todoIt.exclude` | string[] | `node_modules`, `dist`, `out`, `.git`, `*.min.*` | Glob patterns to exclude. |
| `todoIt.respectGitignore` | boolean | `true` | Skip files ignored by `.gitignore`. |
| `todoIt.maxResults` | number | `5000` | Maximum number of scanned matches. |
| `todoIt.debounceMs` | number | `400` | Delay before re-scanning a changed file. |
| `todoIt.scan.grouping` | enum | `tag` | Group scanned results by `tag`, `file`, or `flat`. |
| `todoIt.decorations.enabled` | boolean | `true` | Highlight tags in the editor. |
| `todoIt.codeLens.enabled` | boolean | `false` | Show a clickable CodeLens above each scanned tag. Off by default — some find it noisy. |
| `todoIt.ai.maxFindings` | number | `400` | Maximum scanned todos sent to *AI: Summarize Found in Code*. Bump up if your LM provider has a big context window. |
| `todoIt.ai.contextLines` | number | `6` | ±N lines of surrounding source sent as context to *AI: Suggest Priority*, *AI: Track as Task (Expanded)*, and *AI: Explain Todo*. |
| `todoIt.notifications.dueSoon` | boolean | `false` | Show a VS Code notification when a task's due date arrives. Off by default. Each task fires at most once per session, and *Snooze 1 day* on the dialog defers it. |
| `todoIt.tasks.storage` | enum | `file` | Where manual tasks live: `file` (committed `.vscode/todos.json`), `gitignoredFile`, or `workspaceState`. |
| `todoIt.tasks.sortBy` | enum | `manual` | Order tasks by `manual`, `priority`, or `dueDate` (completed always last). |

### Example: custom tags

```jsonc
"todoIt.tags": [
  { "tag": "TODO",   "color": "#ffbd2e" },
  { "tag": "FIXME",  "color": "#ff5f56" },
  { "tag": "REVIEW", "color": "#a6e22e", "backgroundColor": "#2c3327" }
]
```

## Where are my tasks stored?

`todoIt.tasks.storage` controls it:

| Mode | Location | Good for |
| --- | --- | --- |
| `file` (default) | `.vscode/todos.json` (committed) | Sharing tasks with your team |
| `gitignoredFile` | `.vscode/todos.local.json` (auto-gitignored) | File-based but private to you |
| `workspaceState` | VS Code internal storage | Fully local, never a file |

**No migration on upgrade.** v0.1.0 adds two optional fields to each task: `parentId` (for subtasks) and `links: TaskLink[]` (replacing the singular `link`). Old `.vscode/todos.json` files are read transparently — the legacy `link` is folded into `links[0]` on first load, and tasks without a `parentId` are top-level as before. Downgrading is safe too: v0.0.3 just ignores the unknown `parentId` and `links` fields — subtask nesting and the cross-link UI vanish from those tasks, but no data is removed.

## Requirements

- **VS Code 1.120.0 or newer.**
- On desktop, scanning uses the bundled ripgrep binary (very fast). In browser-based VS Code (github.dev / vscode.dev / Codespaces / Gitpod), a JavaScript fallback takes over — slower, and it doesn't honor `.gitignore` (use `todoIt.exclude`).

## Trust & privacy

Todo It is **read-only against code by default** — scanning never modifies source files. The two exceptions are explicitly user-initiated:

- Ticking a **markdown checklist** in the tree edits the source line from `[ ]` to `[x]` (and saves the file if it had no other unsaved changes).
- Storing **manual tasks** writes to `.vscode/todos.json` (or your chosen storage backend) — see the table above.

The extension itself makes **no network calls** and ships **no telemetry**. AI features call into VS Code's standard [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model), which routes through whichever LM provider _you_ have installed and signed in to; the first call shows a consent dialog. With no provider installed, AI commands gracefully no-op and nothing leaves your machine.

It supports [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust): in an **untrusted** workspace, custom tag styling from the folder's settings is ignored as a safety measure, while scanning and tasks keep working.

## Known limitations

- Scanning requires a real filesystem, so it is limited in virtual/remote-virtual workspaces.
- Tags are matched as whole words on a line; multi-line block-comment context is not parsed.

## Development

```bash
npm install        # install dependencies
npm run watch      # esbuild in watch mode — then press F5 to launch the Extension Host
npm run check-types
npm run lint
npm test           # unit + integration tests (VS Code test host)
npm run vsix       # build a .vsix package
```

Contributions and issues are welcome. The codebase is small and typed: scanning lives in `src/scanner/`, the tree in `src/tree/`, tasks in `src/tasks/`, and editor highlights in `src/decorations/`.

## License

[MIT](https://opensource.org/licenses/MIT) © Kilian Schnelle
