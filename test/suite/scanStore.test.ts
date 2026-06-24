import * as assert from "node:assert";
import { ScannedFileResult } from "../../src/models/types";
import { ScanStore } from "../../src/scanner/scanStore";

function result(uri: string, folderUri: string, count: number): ScannedFileResult {
  return {
    uri,
    folderUri,
    scannedAt: 0,
    matches: Array.from({ length: count }, (_, i) => ({
      matchId: `${uri}|${i}|0|TODO`,
      uri,
      folderUri,
      tag: "TODO",
      line: i,
      startCol: 0,
      endCol: 4,
      lineText: "// TODO",
      text: "",
    })),
  };
}

suite("scanStore", () => {
  test("replaceFile stores results and replaces by uri", () => {
    const store = new ScanStore();
    store.replaceFile(result("u1", "f1", 2));
    store.replaceFile(result("u1", "f1", 3));
    assert.strictEqual(store.matchesForUri("u1").length, 3);
    assert.strictEqual(store.all().length, 1);
  });

  test("replaceFile with no matches removes the entry", () => {
    const store = new ScanStore();
    store.replaceFile(result("u1", "f1", 2));
    store.replaceFile(result("u1", "f1", 0));
    assert.strictEqual(store.all().length, 0);
  });

  test("replaceFolder replaces only that folder's files", () => {
    const store = new ScanStore();
    store.replaceFile(result("u1", "f1", 1));
    store.replaceFile(result("u2", "f2", 1));
    store.replaceFolder("f1", [result("u3", "f1", 2)]);
    assert.deepStrictEqual(
      store.all().map((r) => r.uri).sort(),
      ["u2", "u3"],
    );
  });

  test("removeFolder clears a single folder", () => {
    const store = new ScanStore();
    store.replaceFile(result("u1", "f1", 1));
    store.replaceFile(result("u2", "f2", 1));
    store.removeFolder("f1");
    assert.strictEqual(store.hasFolder("f1"), false);
    assert.strictEqual(store.hasFolder("f2"), true);
  });

  test("notifies listeners until disposed", () => {
    const store = new ScanStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.replaceFile(result("u1", "f1", 1));
    store.removeFile("u1");
    sub.dispose();
    store.replaceFile(result("u2", "f1", 1));
    assert.strictEqual(count, 2);
  });

  test("allMatches() cache is invalidated when data changes", () => {
    const store = new ScanStore();
    store.replaceFile(result("u1", "f1", 2));
    const first = store.allMatches();
    assert.strictEqual(first.length, 2);
    // Same reference on a repeat call — the cache should stick.
    assert.strictEqual(store.allMatches(), first);
    // Mutating the store invalidates the cache.
    store.replaceFile(result("u2", "f1", 3));
    const second = store.allMatches();
    assert.notStrictEqual(second, first);
    assert.strictEqual(second.length, 5);
  });
});
