import * as assert from "node:assert";
import * as vscode from "vscode";
import { TodoCodeLensProvider } from "../../src/codelens/todoCodeLensProvider";
import { Configuration } from "../../src/config/configuration";
import { ScannedFileResult } from "../../src/models/types";
import { ScanStore } from "../../src/scanner/scanStore";

function fakeDocument(lineCount: number, uriString: string): vscode.TextDocument {
  return { uri: vscode.Uri.parse(uriString), lineCount } as unknown as vscode.TextDocument;
}

function result(uri: string, lines: number[]): ScannedFileResult {
  return {
    uri,
    folderUri: "f1",
    scannedAt: 0,
    matches: lines.map((line, i) => ({
      matchId: `${uri}|${line}|0|TODO`,
      uri,
      folderUri: "f1",
      tag: i % 2 === 0 ? "TODO" : "FIXME",
      line,
      startCol: 0,
      endCol: 4,
      lineText: `// TODO line ${line}`,
      text: `line ${line}`,
    })),
  };
}

suite("TodoCodeLensProvider", () => {
  function setup(): { provider: TodoCodeLensProvider; store: ScanStore } {
    const store = new ScanStore();
    // The provider only uses Configuration for its onDidChange event; the activation
    // checks `getConfiguration().get(CONFIG_KEY)` directly, which returns the default
    // (false) in this test host — that's fine, provideCodeLenses runs regardless.
    const fakeConfig = {
      onDidChange: (_: unknown) => ({ dispose: () => {} }),
    } as unknown as Configuration;
    const provider = new TodoCodeLensProvider(store, fakeConfig);
    return { provider, store };
  }

  test("returns empty array when no matches are known for the document", () => {
    const { provider } = setup();
    const lenses = provider.provideCodeLenses(fakeDocument(10, "file:///empty.ts"));
    assert.strictEqual(lenses.length, 0);
    provider.dispose();
  });

  test("emits three lenses per match (Track / AI Track / Explain)", () => {
    const { provider, store } = setup();
    const uri = "file:///foo.ts";
    store.replaceFile(result(uri, [3, 7]));
    const lenses = provider.provideCodeLenses(fakeDocument(20, uri));
    assert.strictEqual(lenses.length, 6); // 2 matches × 3 lenses
    const cmds = lenses.map((l) => l.command?.command);
    assert.deepStrictEqual(
      cmds.sort(),
      [
        "todoIt.ai.explainMatch",
        "todoIt.ai.explainMatch",
        "todoIt.ai.trackAsTask",
        "todoIt.ai.trackAsTask",
        "todoIt.trackAsTask",
        "todoIt.trackAsTask",
      ].sort(),
    );
    provider.dispose();
  });

  test("anchors lenses to the match line, clamped to the document's last line", () => {
    const { provider, store } = setup();
    const uri = "file:///foo.ts";
    // Match line 50 in a 10-line document — should clamp to line 9.
    store.replaceFile(result(uri, [50]));
    const lenses = provider.provideCodeLenses(fakeDocument(10, uri));
    for (const lens of lenses) {
      assert.strictEqual(lens.range.start.line, 9);
    }
    provider.dispose();
  });

  test("each lens carries a {kind:'match', match} argument", () => {
    const { provider, store } = setup();
    const uri = "file:///foo.ts";
    store.replaceFile(result(uri, [2]));
    const lenses = provider.provideCodeLenses(fakeDocument(20, uri));
    for (const lens of lenses) {
      const arg = lens.command?.arguments?.[0] as { kind?: string; match?: { line: number } };
      assert.strictEqual(arg.kind, "match");
      assert.strictEqual(arg.match?.line, 2);
    }
    provider.dispose();
  });
});
