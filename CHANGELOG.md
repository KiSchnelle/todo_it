# Changelog

All notable changes to the Todo It extension are documented here.

## [Unreleased]

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
