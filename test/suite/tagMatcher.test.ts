import * as assert from "node:assert";
import { escapeRegExp, TagMatcher, tagPatternSource } from "../../src/scanner/tagMatcher";

const tags = [{ tag: "TODO" }, { tag: "FIXME" }, { tag: "HACK" }];
const markers = ["//", "#", "<!--", "/*", "*", "--", ";", "%"];

function matcher(caseSensitive = false, commentsOnly = true): TagMatcher {
  return new TagMatcher(tags, caseSensitive, commentsOnly, markers);
}

suite("tagMatcher", () => {
  test("matches a tag inside a comment and extracts trailing text + columns", () => {
    const m = matcher().match("// TODO: refactor this loop");
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].tag, "TODO");
    assert.strictEqual(m[0].text, "refactor this loop");
    assert.strictEqual(m[0].startCol, 3);
    assert.strictEqual(m[0].endCol, 7);
  });

  test("is case-insensitive (and canonicalizes the tag) when case-sensitivity is off", () => {
    const m = matcher(false).match("# todo lower case");
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].tag, "TODO");
  });

  test("respects case-sensitivity when enabled", () => {
    assert.strictEqual(matcher(true).match("# todo lower").length, 0);
    assert.strictEqual(matcher(true).match("# TODO upper").length, 1);
  });

  test("ignores tags outside a comment (prose, code, strings)", () => {
    assert.deepStrictEqual(matcher().match("update the TODO list before release"), []);
    assert.deepStrictEqual(matcher().match("const TODO = loadTasks();"), []);
  });

  test("does not match tags embedded in words even inside comments", () => {
    assert.deepStrictEqual(matcher().match("// MASTODON and todos"), []);
  });

  test("finds multiple tags within one comment", () => {
    const m = matcher().match("// TODO and FIXME both");
    assert.deepStrictEqual(m.map((x) => x.tag), ["TODO", "FIXME"]);
  });

  test("matches HTML/JSDoc style comment markers", () => {
    assert.strictEqual(matcher().match("<!-- FIXME: escape this -->")[0]?.tag, "FIXME");
    assert.strictEqual(matcher().match("   * HACK keep the star prefix")[0]?.tag, "HACK");
  });

  test("when commentsOnly is off, matches tags anywhere", () => {
    const m = matcher(false, false).match("update the TODO list");
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].tag, "TODO");
  });

  test("tagPatternSource requires a marker only in comments-only mode", () => {
    assert.ok(!tagPatternSource(tags, false, markers).includes("//"));
    assert.ok(tagPatternSource(tags, true, markers).includes("//"));
    assert.ok(tagPatternSource(tags, true, markers).includes("TODO"));
    assert.strictEqual(tagPatternSource([], true, markers), "\\b\\B");
  });

  test("escapeRegExp escapes regex metacharacters", () => {
    assert.strictEqual(escapeRegExp("a.b*c"), "a\\.b\\*c");
  });
});
