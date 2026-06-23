# Todo It

**A modern, maintained alternative to Todo Tree for Visual Studio Code.** Find `TODO`, `FIXME`, `HACK`, `BUG`, and `NOTE` comment tags across your workspace, highlight them in the editor, and manage your own checkable **tasks** (with priority, due dates, and notes) — all in one sidebar.

[![CI](https://img.shields.io/github/actions/workflow/status/KiSchnelle/todo_it/ci.yml?branch=main&label=CI&logo=github)](https://github.com/KiSchnelle/todo_it/actions/workflows/ci.yml)
[![Version](https://vsmarketplacebadges.dev/version-short/KiSchnelle.todo-it.svg)](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it)
[![Installs](https://vsmarketplacebadges.dev/installs-short/KiSchnelle.todo-it.svg)](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it)
[![Rating](https://vsmarketplacebadges.dev/rating-star/KiSchnelle.todo-it.svg)](https://marketplace.visualstudio.com/items?itemName=KiSchnelle.todo-it&ssr=false#review-details)
[![Open VSX Version](https://img.shields.io/open-vsx/v/KiSchnelle/todo-it?label=Open%20VSX)](https://open-vsx.org/extension/KiSchnelle/todo-it)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/KiSchnelle/todo-it?label=downloads)](https://open-vsx.org/extension/KiSchnelle/todo-it)
[![Open VSX Rating](https://img.shields.io/open-vsx/rating/KiSchnelle/todo-it?label=rating)](https://open-vsx.org/extension/KiSchnelle/todo-it/reviews)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Todo It is a fresh, MIT-licensed take on the much-loved (but unmaintained) _Todo Tree_ — rebuilt from scratch on the current VS Code APIs, with fast ripgrep scanning and a built-in task list.

```text
TODO IT
├─ 📌 My Tasks            (click a task → Task Details panel)
│   ☐ Write parser tests           high · due 2026-06-01 · 📝
│   ☑ Set up CI
│   ☐ Review PR #42                low
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
- Add, check off (real tree **checkboxes**), and delete tasks without leaving the editor.
- **Click a task to open the Task Details panel** — a dedicated editor with title, priority, due date, and a **large multi-line note** field (save with `⌘/Ctrl+S`).
- **Flexible due dates**: an exact date (`2026-06-01`) or a relative one (`tomorrow`, `3 days`, `2 weeks`, `1 month`) — in the panel or the quick-add prompts.
- **Sort** tasks by priority, due date, or manual order (completed tasks always sink to the bottom).
- Tasks are **persisted with your project** in `.vscode/todos.json` by default — commit them to share with your team, or switch to a private/local store.

### ⚡ Live & multi-root
- **Live updates**: files are re-scanned automatically as you edit and save (debounced); deletions disappear on their own.
- **Monorepo-ready**: results and tasks are scoped per workspace folder.

## Getting started

1. Install **Todo It** from the Marketplace (or run `Extensions: Install from VSIX…`).
2. Open the **Todo It** view from the Activity Bar (the checklist icon).
3. The **Found in Code** section fills in automatically from your workspace; click any item to jump to it.
4. Add your own tasks with the **`+`** button (or `Todo It: Add Task` from the Command Palette).

## Commands

All commands are available from the Command Palette under the **Todo It** category.

| Command | Title | Where |
| --- | --- | --- |
| `todoIt.addTask` | Add Task | View toolbar (`+`), Command Palette |
| `todoIt.editTask` | Open Task Details (title / priority / due / note) | Click a task, pencil icon |
| `todoIt.deleteTask` | Delete Task | Task context menu |
| `todoIt.setTaskSort` | Sort Tasks By… | My Tasks header |
| `todoIt.refresh` | Refresh | View toolbar |
| `todoIt.setGrouping` | Change Grouping | View toolbar |
| `todoIt.toggleDecorations` | Toggle Editor Highlights | View toolbar |
| `todoIt.openMatch` | Open Todo | Click a scanned result |

## Settings

Configure everything under the **Todo It** section of Settings (`todoIt.*`).

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `todoIt.tags` | array | `TODO, FIXME, HACK, BUG, NOTE, XXX` | Tags to scan for, with optional `color`, `backgroundColor`, `iconPath`, and `rulerColor`. |
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

## Requirements

- **VS Code 1.120.0 or newer.**
- The code scanner needs local files (it runs ripgrep), so it is unavailable in virtual workspaces such as github.dev — your manual tasks still work there.

## Trust & privacy

Todo It is **read-only** against your code (it never modifies source files) and runs entirely **offline** — no telemetry, no network calls. It supports [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust): in an **untrusted** workspace, custom tag styling from the folder's settings is ignored as a safety measure, while scanning and tasks keep working.

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
