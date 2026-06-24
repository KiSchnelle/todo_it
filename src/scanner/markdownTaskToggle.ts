import * as vscode from "vscode";
import { TagMatch } from "../models/types";
import { MD_TASK_CHECKBOX, MD_TASK_TAG } from "./markdownTasks";

export function isMarkdownTaskMatch(match: TagMatch): boolean {
  return match.tag === MD_TASK_TAG;
}

/**
 * Toggles a markdown checklist line in source from `[ ]` to `[x]`. Returns true
 * when the file was modified — the scanner watcher will then remove the now-checked
 * task from the tree on its next pass. Returns false (without throwing) when the
 * file is missing, the line no longer matches `[ ]`, or the line number is past
 * EOF. The checkbox handler refreshes the tree on `false` so the optimistic
 * Checked UI snaps back to Unchecked.
 */
export async function markMarkdownTaskDone(match: TagMatch): Promise<boolean> {
  const uri = vscode.Uri.parse(match.uri);
  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(uri);
  } catch {
    return false;
  }
  if (match.line >= doc.lineCount) {
    return false;
  }
  const text = doc.lineAt(match.line).text;
  const m = MD_TASK_CHECKBOX.exec(text);
  if (!m) {
    return false;
  }
  const start = m[1].length;
  const range = new vscode.Range(
    new vscode.Position(match.line, start),
    new vscode.Position(match.line, start + 3),
  );
  const wasDirty = doc.isDirty;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, "[x]");
  const applied = await vscode.workspace.applyEdit(edit);
  if (applied && !wasDirty) {
    // The file had no unsaved changes before this toggle, so save right away
    // so the scanner watcher drops the now-checked task. If the user already
    // had unsaved changes, leave them in charge of saving.
    await doc.save();
  }
  return applied;
}
