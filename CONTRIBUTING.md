# Contributing to Todo It

Thanks for your interest in improving Todo It! This guide gets you from clone to PR.

## Development setup

Requirements: **Node.js 22 or 24** and **npm**.

```bash
git clone https://github.com/KiSchnelle/todo_it.git
cd todo_it
npm install
npm run watch          # esbuild watch — leave running in a terminal
```

Press **F5** in VS Code to launch an Extension Development Host with Todo It loaded.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run compile` | Build `dist/extension.js` once |
| `npm run watch` | Build + watch for changes (use with F5) |
| `npm run check-types` | TypeScript type check (no emit) |
| `npm run lint` | ESLint |
| `npm test` | Build extension + tests, run the full host suite (Linux/macOS/Windows × Node 22/24 in CI) |
| `npm run vsix` | Produce `todo-it.vsix` (runs typecheck + lint + production build first) |

## Coding conventions

- TypeScript, strict mode. `npm run check-types` must pass.
- ESLint flat config (`eslint.config.mjs`); `npm run lint` must pass.
- Keep diffs focused — one logical change per PR.
- Add or update tests for behavior changes:
  - Pure logic (`src/util/`, `src/scanner/`, `src/tasks/`) → unit tests in `test/suite/*.test.ts`.
  - VS Code-API behavior → host-suite tests under the same directory.
- Comments are for non-obvious *why* — well-named identifiers cover *what*.

## Architecture cheat sheet

| Where | What |
| --- | --- |
| `src/extension.ts` | Composition root: wires config, stores, providers, commands. |
| `src/scanner/` | Ripgrep child process, NDJSON parser, tag matcher (comments-only logic). |
| `src/tree/` | `TreeDataProvider`, item rendering, grouping. |
| `src/tasks/` | Task store, persistence backends (file / gitignored / workspaceState), sorting. |
| `src/webview/taskDetailPanel.ts` | Task Details panel: HTML + nonce CSP + message handling. |
| `src/decorations/` | Editor gutter and line highlights. |
| `src/watcher/`, `src/scanner/scanController.ts` | File-watcher debouncing and in-flight scan cancellation. |
| `src/config/` | Typed configuration accessor + defaults. |
| `src/util/` | Pure helpers (`color`, `date`, `debounce`, `logger`). |

## Submitting a PR

1. Fork and create a branch from `main`.
2. Make your change and add tests.
3. Locally: `npm run check-types && npm run lint && npm test`.
4. Commit with a short, lowercase, descriptive message — `fix off-by-one in tag matcher columns`. No Conventional Commit prefix required.
5. Push and open a PR against `main`. CI runs the full matrix; please keep PRs green.

## Reporting bugs / requesting features

- **Bugs and features**: open an [issue](https://github.com/KiSchnelle/todo_it/issues).
- **Security vulnerabilities**: see [SECURITY.md](SECURITY.md) — please use private reporting.

## License

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).
