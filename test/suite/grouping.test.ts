import * as assert from "node:assert";
import { TagMatch } from "../../src/models/types";
import { groupScanned } from "../../src/tree/grouping";

function match(uri: string, line: number, tag: string, folderUri = "f1"): TagMatch {
  return {
    matchId: `${uri}|${line}|0|${tag}`,
    uri,
    folderUri,
    tag,
    line,
    startCol: 0,
    endCol: tag.length,
    lineText: "",
    text: "",
  };
}

const matches = [
  match("file:///b.ts", 5, "TODO"),
  match("file:///a.ts", 2, "FIXME"),
  match("file:///a.ts", 1, "TODO"),
];

suite("grouping", () => {
  test("flat lists matches sorted by uri then line", () => {
    const nodes = groupScanned(matches, "flat");
    const order = nodes.map((n) => (n.kind === "match" ? `${n.match.uri}:${n.match.line}` : ""));
    assert.deepStrictEqual(order, ["file:///a.ts:1", "file:///a.ts:2", "file:///b.ts:5"]);
  });

  test("by tag groups with counts, sorted alphabetically", () => {
    const nodes = groupScanned(matches, "tag");
    const summary = nodes.map((n) => (n.kind === "tagGroup" ? `${n.tag}=${n.count}` : ""));
    assert.deepStrictEqual(summary, ["FIXME=1", "TODO=2"]);
  });

  test("by file groups with counts, sorted by uri", () => {
    const nodes = groupScanned(matches, "file");
    const summary = nodes.map((n) => (n.kind === "fileGroup" ? `${n.uri}=${n.count}` : ""));
    assert.deepStrictEqual(summary, ["file:///a.ts=2", "file:///b.ts=1"]);
  });

  test("empty input yields no nodes", () => {
    assert.deepStrictEqual(groupScanned([], "tag"), []);
  });
});
