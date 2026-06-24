import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { TagMatch } from "../models/types";
import { ScanStore } from "../scanner/scanStore";

const CONFIG_KEY = "todoIt.codeLens.enabled";

/**
 * Renders a clickable lens above each scanned-tag line: `$(tag) TODO: …  ·  Track as Task`.
 * The lens is opt-in (`todoIt.codeLens.enabled`, default off) because some users find
 * floating labels above every TODO noisy.
 */
export class TodoCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;
  private readonly disposables: vscode.Disposable[] = [];
  private registration: vscode.Disposable | undefined;

  constructor(
    private readonly scanStore: ScanStore,
    private readonly config: Configuration,
  ) {
    this.disposables.push(
      this.scanStore.onDidChange(() => this._onDidChange.fire()),
      this.config.onDidChange((e) => {
        if (e.affectsConfiguration(CONFIG_KEY)) {
          this.syncRegistration();
        }
      }),
    );
    this.syncRegistration();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const uri = document.uri.toString();
    const matches = this.scanStore.matchesForUri(uri);
    if (matches.length === 0) {
      return [];
    }
    return matches.flatMap((match) => this.buildLenses(document, match));
  }

  /**
   * Three lenses per match — render side-by-side on the line above the comment:
   *   $(tag) Track as Task   $(sparkle) AI Track   $(sparkle) Explain
   * The matched line is right beneath, so we don't repeat the tag text here.
   * Track as Task dedupes inside its command handler, so clicking the same lens
   * twice opens the existing task instead of creating a duplicate.
   */
  private buildLenses(document: vscode.TextDocument, match: TagMatch): vscode.CodeLens[] {
    const safeLine = Math.min(match.line, Math.max(0, document.lineCount - 1));
    const range = new vscode.Range(safeLine, 0, safeLine, 0);
    const arg = { kind: "match", match };
    return [
      new vscode.CodeLens(range, {
        title: `$(tag) Track as Task`,
        command: "todoIt.trackAsTask",
        arguments: [arg],
      }),
      new vscode.CodeLens(range, {
        title: `$(sparkle) AI Track`,
        command: "todoIt.ai.trackAsTask",
        arguments: [arg],
      }),
      new vscode.CodeLens(range, {
        title: `$(sparkle) Explain`,
        command: "todoIt.ai.explainMatch",
        arguments: [arg],
      }),
    ];
  }

  private syncRegistration(): void {
    const enabled = vscode.workspace.getConfiguration().get<boolean>(CONFIG_KEY, false);
    if (enabled && !this.registration) {
      // Register against the universal `{ scheme: "file" }` selector so any
      // language with scanned matches gets the lens.
      this.registration = vscode.languages.registerCodeLensProvider(
        [
          { scheme: "file" },
          { scheme: "vscode-vfs" }, // github.dev / vscode.dev
          { scheme: "vscode-userdata" },
        ],
        this,
      );
    } else if (!enabled && this.registration) {
      this.registration.dispose();
      this.registration = undefined;
    }
  }

  dispose(): void {
    this.registration?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this._onDidChange.dispose();
  }
}
