import * as assert from "node:assert";
import { escapeRegExp, TagMatcher, tagPatternSource } from "../../src/scanner/tagMatcher";

const tags = [{ tag: "TODO" }, { tag: "FIXME" }, { tag: "HACK" }];

suite("tagMatcher", () => {
  test("matches a simple TODO and extracts trailing text + columns", () => {
    const matches = new TagMatcher(tags, false).match("// TODO: refactor this loop");
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].tag, "TODO");
    assert.strictEqual(matches[0].text, "refactor this loop");
    assert.strictEqual(matches[0].startCol, 3);
    assert.strictEqual(matches[0].endCol, 7);
  });

  test("is case-insensitive by default and canonicalizes the tag", () => {
    const matches = new TagMatcher(tags, false).match("# todo lower case");
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].tag, "TODO");
  });

  test("respects case-sensitivity when enabled", () => {
    assert.strictEqual(new TagMatcher(tags, true).match("# todo lower").length, 0);
    assert.strictEqual(new TagMatcher(tags, true).match("# TODO upper").length, 1);
  });

  test("does not match tags embedded in words", () => {
    assert.strictEqual(new TagMatcher(tags, false).match("MASTODON and todos").length, 0);
  });

  test("finds multiple tags on one line", () => {
    const matches = new TagMatcher(tags, false).match("// TODO and FIXME both");
    assert.deepStrictEqual(
      matches.map((m) => m.tag),
      ["TODO", "FIXME"],
    );
  });

  test("tagPatternSource falls back to a never-matching pattern when empty", () => {
    assert.strictEqual(tagPatternSource([]), "\\b\\B");
    assert.ok(tagPatternSource(tags).includes("TODO"));
  });

  test("escapeRegExp escapes regex metacharacters", () => {
    assert.strictEqual(escapeRegExp("a.b*c"), "a\\.b\\*c");
  });
});
