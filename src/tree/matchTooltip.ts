import * as vscode from "vscode";
import { TagMatch } from "../models/types";
import { relPathLine } from "../util/uri";

const CONTEXT_LINES = 2;

/**
 * Builds a markdown tooltip for a scanned match: header, fenced code block with
 * ±{CONTEXT_LINES} lines around the hit, and a "→" marker on the matched line.
 * The language id comes from the document VS Code already knows about, so syntax
 * highlighting in the hover works for any registered language.
 */
export async function buildMatchTooltip(match: TagMatch): Promise<vscode.MarkdownString> {
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;
  md.appendMarkdown(`**${match.tag}** — \`${relPathLine(match.uri, match.line)}\`\n\n`);

  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(match.uri));
    const start = Math.max(0, match.line - CONTEXT_LINES);
    const end = Math.min(doc.lineCount - 1, match.line + CONTEXT_LINES);
    const block: string[] = [];
    for (let i = start; i <= end; i++) {
      const prefix = i === match.line ? "→ " : "  ";
      block.push(prefix + doc.lineAt(i).text);
    }
    md.appendCodeblock(block.join("\n"), doc.languageId);
  } catch {
    // File unavailable (deleted, virtual fs failure, …). Fall back to the captured line.
    md.appendCodeblock(match.lineText.trim());
  }
  return md;
}
