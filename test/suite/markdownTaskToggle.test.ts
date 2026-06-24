import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { TagMatch } from "../../src/models/types";
import { MD_TASK_TAG } from "../../src/scanner/markdownTasks";
import { markMarkdownTaskDone } from "../../src/scanner/markdownTaskToggle";

function tempFile(): vscode.Uri {
  return vscode.Uri.file(path.join(os.tmpdir(), `todoit-md-${randomUUID()}.md`));
}

function match(uri: string, line: number): TagMatch {
  return {
    matchId: `${uri}|${line}|0|${MD_TASK_TAG}`,
    uri,
    folderUri: "f1",
    tag: MD_TASK_TAG,
    line,
    startCol: 0,
    endCol: 4,
    lineText: "- [ ] task",
    text: "task",
  };
}

async function readText(uri: vscode.Uri): Promise<string> {
  return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
}

suite("markMarkdownTaskDone", () => {
  test("flips `- [ ]` to `- [x]` and saves the file", async () => {
    const uri = tempFile();
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode("- [ ] task\n- [ ] another\n"),
    );

    const ok = await markMarkdownTaskDone(match(uri.toString(), 0));
    assert.strictEqual(ok, true);

    const text = await readText(uri);
    assert.match(text, /^- \[x\] task\n- \[ \] another\n$/);

    await vscode.workspace.fs.delete(uri);
  });

  test("no-ops when the line no longer matches `[ ]`", async () => {
    const uri = tempFile();
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode("- [x] already done\n"),
    );
    const ok = await markMarkdownTaskDone(match(uri.toString(), 0));
    assert.strictEqual(ok, false);
    const text = await readText(uri);
    assert.strictEqual(text, "- [x] already done\n");
    await vscode.workspace.fs.delete(uri);
  });

  test("returns false (no throw) when the file is missing", async () => {
    const uri = tempFile();
    const ok = await markMarkdownTaskDone(match(uri.toString(), 0));
    assert.strictEqual(ok, false);
  });

  test("returns false when the line number is past EOF", async () => {
    const uri = tempFile();
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode("only one line\n"));
    const ok = await markMarkdownTaskDone(match(uri.toString(), 99));
    assert.strictEqual(ok, false);
    await vscode.workspace.fs.delete(uri);
  });
});
