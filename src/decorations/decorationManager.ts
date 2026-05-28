import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { TagDefinition } from "../models/types";
import { ScanStore } from "../scanner/scanStore";
import { sanitizeColor } from "../util/color";

const DEFAULT_COLOR = "#888888";

/** Owns per-tag editor decoration types and keeps visible editors in sync with the scan store. */
export class DecorationManager {
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();
  private enabled: boolean;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly scanStore: ScanStore,
    private readonly config: Configuration,
  ) {
    this.enabled = config.all.decorationsEnabled;
    this.rebuildTypes();

    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.applyAll()),
      this.scanStore.onDidChange(() => this.applyAll()),
      this.config.onDidChange((e) => this.onConfigChange(e)),
    );

    this.applyAll();
  }

  private onConfigChange(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration("todoIt.tags") || e.affectsConfiguration("todoIt.caseSensitive")) {
      this.rebuildTypes();
    }
    if (e.affectsConfiguration("todoIt.decorations.enabled")) {
      this.enabled = this.config.all.decorationsEnabled;
    }
    this.applyAll();
  }

  // `color` must already be sanitized (see createType) so it cannot break out of the SVG attribute.
  private gutterIcon(color: string): vscode.Uri {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="4" fill="${color}"/></svg>`;
    return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  }

  private createType(tag: TagDefinition): vscode.TextEditorDecorationType {
    const color = sanitizeColor(tag.color) ?? DEFAULT_COLOR;
    const backgroundColor = sanitizeColor(tag.backgroundColor);
    const options: vscode.DecorationRenderOptions = {
      gutterIconPath: tag.iconPath ? vscode.Uri.file(tag.iconPath) : this.gutterIcon(color),
      gutterIconSize: "contain",
      overviewRulerColor: sanitizeColor(tag.rulerColor) ?? color,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      color,
      fontWeight: "bold",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    };
    if (backgroundColor) {
      options.backgroundColor = backgroundColor;
      options.isWholeLine = true;
    }
    return vscode.window.createTextEditorDecorationType(options);
  }

  private rebuildTypes(): void {
    for (const type of this.types.values()) {
      type.dispose();
    }
    this.types.clear();
    for (const tag of this.config.all.tags) {
      if (tag.tag) {
        this.types.set(tag.tag, this.createType(tag));
      }
    }
  }

  private applyAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyToEditor(editor);
    }
  }

  private applyToEditor(editor: vscode.TextEditor): void {
    const rangesByTag = new Map<string, vscode.Range[]>();
    if (this.enabled) {
      for (const match of this.scanStore.matchesForUri(editor.document.uri.toString())) {
        const arr = rangesByTag.get(match.tag);
        const range = new vscode.Range(match.line, match.startCol, match.line, match.endCol);
        if (arr) {
          arr.push(range);
        } else {
          rangesByTag.set(match.tag, [range]);
        }
      }
    }
    for (const [tag, type] of this.types) {
      editor.setDecorations(type, rangesByTag.get(tag) ?? []);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    for (const type of this.types.values()) {
      type.dispose();
    }
    this.types.clear();
  }
}
