import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { TagMatch } from "../../src/models/types";
import { buildMatchTooltip } from "../../src/tree/matchTooltip";

function tempFile(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(os.tmpdir(), `todoit-tt-${randomUUID()}-${name}`));
}

function match(uri: string, line: number): TagMatch {
  return {
    matchId: `${uri}|${line}|0|TODO`,
    uri,
    folderUri: "f1",
    tag: "TODO",
    line,
    startCol: 0,
    endCol: 4,
    lineText: "// TODO: do something",
    text: "do something",
  };
}

suite("buildMatchTooltip", () => {
  test("renders header + a code block with the matched line marked", async () => {
    const uri = tempFile("ctx.ts");
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(
        ["line0", "line1", "// TODO: do something", "line3", "line4"].join("\n"),
      ),
    );
    const md = await buildMatchTooltip(match(uri.toString(), 2));
    assert.ok(md.value.includes("**TODO**"), "header should include the tag");
    assert.ok(md.value.includes("→ // TODO: do something"), "matched line should be marked");
    assert.ok(md.value.includes("  line0") || md.value.includes("  line1"), "context lines should appear");
    await vscode.workspace.fs.delete(uri);
  });

  test("falls back to lineText when the file is missing", async () => {
    const uri = tempFile("gone.ts");
    const md = await buildMatchTooltip(match(uri.toString(), 0));
    assert.ok(md.value.includes("// TODO: do something"));
  });
});
