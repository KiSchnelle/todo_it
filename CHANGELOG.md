# Changelog

All notable changes to the Todo It extension are documented here.

## [Unreleased]

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
