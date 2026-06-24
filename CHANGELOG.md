# Changelog

All notable changes to the Todo It extension are documented here.

## [Unreleased]

## [0.1.0] - 2026-06-24

A major release that takes Todo It from "TODO scanner + simple task list" to a full task manager with subtasks, multi-file links, bulk operations, due-date reminders, markdown export, an opt-in AI suite, and a `@todo-it` chat participant. Bumping to 0.1.0 to reflect the breadth of the change.

### Added
- **Bulk task operations**: Cmd/Ctrl-click or Shift-click to select multiple tasks in the tree, then *Delete*, *Mark Done*, *Set Priority…*, or *Snooze…* act on all of them. Single-task right-clicks work exactly as before — the multi-selection only kicks in when there's actually a selection.
- **Snooze a task** (`todoIt.snoozeTask`) — pick *Tomorrow*, *Next week*, or a custom date / relative offset (`3 days`, `2 weeks`). Snoozed tasks suppress due-soon notifications until the snooze date.
- **Opt-in due-date notifications** (`todoIt.notifications.dueSoon`, off by default) — VS Code notifies you when a task's due date arrives, with *Open* and *Snooze 1 day* actions. Each task is notified at most once per session.
- **Export tasks to Markdown** (`todoIt.exportTasks`) — writes a `TODO.md` (or any path you choose) grouped by priority, with subtasks indented and linked sources listed. Available from the view title and the Command Palette.
- **Chat participant `@todo-it`** — ask questions about your TODOs and tasks directly in the Copilot Chat panel. Slash commands: `/summarize` (themed overview), `/overdue` (list overdue and due-today tasks; no LM call needed).
- **Empty-state hints** in the tree: *Found in Code* now says "No TODO comments found — add `// TODO:` to any file" when empty; *My Tasks* explains "No tasks matching …" when a filter rules everything out.
- **Subtasks / nested tasks**: right-click a task → **Add Subtask**. Checking off a parent marks all descendants done; deleting a parent removes its subtasks (with a confirmation that names the count). **Move Task Under…** re-parents a task with cycle protection (no re-parenting under yourself or a descendant). Drag-and-drop reorders within a single parent — cross-parent moves go through *Move Task Under…*.
- **Multiple linked sources per task**: a task can hold any number of file:line links — useful for work that spans several files (e.g. "implement feature X — touches `auth.ts`, `api.ts`, `tests/auth.test.ts`"). **Add Linked Source…** picks the current editor (with cursor line) or browses for any file; **Remove Linked Source…** drops any individual link. The tree shows `🔗 path:42 +N more` for multi-link tasks and *Open Linked Source* prompts a QuickPick when more than one is attached. Inside the Task Details panel, links render as a list with per-link Open / Remove buttons.
- **Interactive markdown checklists**: ticking the checkbox of an `- [ ] …` line in the tree rewrites the source markdown file (`[ ]` → `[x]`) and saves it. The group also got a friendlier "Markdown checklist" label and a proper checkbox icon (replacing the raw `MD-TASK` string).
- **CodeLens** above scanned tags (`todoIt.codeLens.enabled`, off by default): three actions per match — `$(tag) Track as Task · $(sparkle) AI Track · $(sparkle) Explain`.
- **Code preview on hover**: hovering a scanned result shows ±2 lines of source context with the matched line marked, syntax-highlighted using the file's language.
- **`Todo It: Go to Todo…`** Command Palette quick-pick — fuzzy search across every scanned todo by tag, text, and path.
- **AI assist** (uses your installed Language Model provider via VS Code's stable [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model) — no API key required, no telemetry from us). With no provider installed, AI commands show a one-shot hint and the rest of the extension keeps working unchanged.
  - `AI: Summarize Found in Code` — themed Markdown summary of every scanned todo, plus an "Urgent" section.
  - `AI: Suggest Priority` — for a task; uses title + note + linked source context, then offers one-click apply.
  - `AI: Track as Task (Expanded)` — turns a cryptic `// TODO: fix it` into a real task with title, description **and a suggested priority**.
  - `AI: Explain Todo` — explains what a TODO probably means, using the surrounding code.
  - **Tunable**: `todoIt.ai.maxFindings` (default 400) caps the *Summarize* prompt size; `todoIt.ai.contextLines` (default 6) controls how much surrounding source is sent for *Suggest Priority / Track w/ AI / Explain*. Per-item character clamps (200 / 300 chars) stay defensive constants.

### Fixed
- **Scanner false positives** in markdown / loose code: the comment markers `*`, `--`, `;`, `%` now only match at line-start with whitespace after, so markdown bold (`**…TODO…**`), `5 * y; TODO`, decrement-style `--var`, and `%d` format specifiers no longer light up the tree. `//`, `#`, `<!--`, `/*` continue to match anywhere on a line.
- **Track as Task duplicates**: clicking *Track as Task* twice no longer stacks duplicate tasks — repeat clicks open the existing linked task instead.
- **Open Linked Source on a missing file** silently failed in v0.0.3; now shows a friendly warning with a **Remove link** action.
- **Task Details panel didn't react to external task deletion** in v0.0.3 — deleting a task with its panel open left a "ghost" form that would silently no-op on save. The panel now disposes when the underlying task disappears, and external link/priority changes reflect live.
- **Task links now follow renames**: renaming or moving a linked source file via the VS Code explorer / refactor updates the linked URI on every affected task automatically. (Terminal `mv` and git operations don't fire VS Code's rename event — use the *Remove link* warning to clean those up.)

### Changed
- **Publish workflow**: `darwin-x64` now builds on `macos-26-intel` (the current free Intel-Mac label) instead of the phased-out `macos-13` runner that queued indefinitely.
- **Task file format adds an optional `links: TaskLink[]`** (replacing the legacy `link: TaskLink`) and an optional `parentId` (for subtasks). Old `.vscode/todos.json` files are read transparently — each legacy `link` is folded into `links[0]` on first load, and tasks without a `parentId` are top-level as before. The format stays on `schemaVersion: 1` so v0.0.3 can still read v0.1.0 files (it just ignores the unknown fields, losing the cross-link and subtask UI on those tasks — no data is removed).
- **Internal**: `ScanStore.all()` / `allMatches()` now cache results between renders and return `readonly` (frozen) arrays; the caches invalidate automatically when data changes.

## [0.0.3] - 2026-06-23

### Added
- **Status bar item** showing open task and scanned-todo counts; click to focus the Todo It view (toggle with `todoIt.statusBar.enabled`).
- **Inline quick-add row** at the top of *My Tasks* — single prompt for the title, with priority/due/note editable later in the Task Details panel.
- **Filter** the tree by substring (matches task titles/notes and scanned tag text, line, and path). Toggle via the funnel icon in the view title; an active filter shows above the tree and disables the quick-add row.
- **Drag-and-drop reordering** of manual tasks (within the same workspace folder), persisted to `order`. Effective when sorting is set to *manual*.
- **Cross-link scanned ↔ task**: right-click a scanned match → **Track as Task** to create a manual task pre-populated with title and a back-link. Linked tasks show a `🔗 file:line` indicator and an *Open Linked Source* action (inline + context menu), and the Task Details panel surfaces the link with an *Open* button.
- **Markdown tasks** — unchecked `- [ ]` lines in `.md`/`.markdown`/`.mdx` files are surfaced under Found in Code as a `MD-TASK` synthetic tag (toggle with `todoIt.markdownTasks.enabled`).
- **Web extension support**: a JavaScript-based fallback scanner (using `workspace.fs`) ships alongside the ripgrep-powered native scanner, so Todo It now works in browser-based VS Code (github.dev / vscode.dev / Codespaces in the browser / Gitpod). The `capabilities.virtualWorkspaces` is now fully `true`. Note: the JS scanner is slower than ripgrep and does not honor `.gitignore` — use `todoIt.exclude` instead.
- **Also published to [Open VSX](https://open-vsx.org/extension/KiSchnelle/todo-it)** — the publish workflow packages once per platform with `vsce` and pushes the same VSIX to both the VS Marketplace and Open VSX (`--skip-duplicate`; the Open VSX step uses `continue-on-error` so a transient outage or unverified namespace can't fail the run).
- README **Open VSX badges** (version, downloads, rating).
- **`SECURITY.md`** with a GitHub private-vulnerability-reporting link, and **`CONTRIBUTING.md`** covering dev setup, npm scripts, conventions, and an architecture cheat sheet.

### Changed
- **Add Task** is now a single prompt (title only) — set priority, due date, and note afterwards via the Task Details panel.
- **Publishing is now manual via GitHub Releases** — the workflow triggers on `release: published` (draft a release in the UI, click "Publish release" to ship); `workflow_dispatch` is kept as an escape hatch.
- **All GitHub Actions pinned to commit SHAs** (with version comments) for supply-chain safety; jobs declare least-privilege `permissions` and per-workflow `concurrency`.
- **Dependabot enabled** for both `github-actions` and `npm` ecosystems, with sensible groupings and ignore rules for the deliberately-pinned `@types/node` and `@types/vscode`.
- **Marketplace discoverability tightened**: keyword-rich `description`, expanded `keywords`, dark-blue `galleryBanner`; the GitHub repo's description, homepage, and topics now mirror the same keywords.

## [0.0.2] - 2026-06-23

### Added
- **Hybrid sidebar view** with two sections: "My Tasks" (manual tasks) and "Found in Code" (scanned comment tags).
- **Comment-tag scanner** powered by ripgrep: configurable tags (TODO, FIXME, HACK, BUG, NOTE, XXX by default), include/exclude globs, `.gitignore` support, and a result cap.
- **Comments-only matching** (default on): tags are only detected after a comment marker, so prose, strings, and code are ignored. Markers are configurable via `todoIt.commentMarkers`; disable with `todoIt.commentsOnly`.
- **Case-sensitive by default** (`todoIt.caseSensitive`): only uppercase tags like `TODO`/`NOTE` match, so everyday words such as "note" or "Todo" are not flagged.
- **Grouping** of scanned results by tag, file, or as a flat list, switchable from the view toolbar.
- **Editor highlights**: per-tag gutter icons, tag coloring, and overview-ruler marks, toggleable.
- **Jump to code**: click a scanned match to open the file at the exact line.
- **Manual tasks**: add, check off (via tree checkboxes), and delete tasks.
- **Task Details panel**: click a task to edit its title, priority, due date, and a large multi-line note in a dedicated webview.
- **Flexible due dates**: presets plus exact (`YYYY-MM-DD`) or relative input (`tomorrow`, `3 days`, `2 weeks`, `1 month`).
- **Task sorting** by priority, due date, or manual order (completed tasks always last).
- **Persistence**: tasks saved to a committed `.vscode/todos.json` by default, or a gitignored file / VS Code workspace state.
- **Live updates**: files are re-scanned on change/save (debounced); deletions are removed automatically.
- **Multi-root / monorepo** support: results and tasks are scoped per workspace folder.
