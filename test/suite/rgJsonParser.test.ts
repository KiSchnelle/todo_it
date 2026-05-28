import * as assert from "node:assert";
import { parseRgMatch, RgJsonStream } from "../../src/scanner/rgJsonParser";

const matchLine = JSON.stringify({
  type: "match",
  data: {
    path: { text: "src/app.ts" },
    lines: { text: "  // TODO: x\n" },
    line_number: 42,
    submatches: [{ match: { text: "TODO" }, start: 5, end: 9 }],
  },
});

suite("rgJsonParser", () => {
  test("parses a match event and strips the EOL", () => {
    const match = parseRgMatch(matchLine);
    assert.ok(match);
    assert.strictEqual(match.path, "src/app.ts");
    assert.strictEqual(match.lineNumber, 42);
    assert.strictEqual(match.lineText, "  // TODO: x");
  });

  test("ignores non-match events", () => {
    assert.strictEqual(parseRgMatch(JSON.stringify({ type: "begin", data: {} })), undefined);
    assert.strictEqual(parseRgMatch(JSON.stringify({ type: "summary" })), undefined);
  });

  test("ignores malformed or empty lines", () => {
    assert.strictEqual(parseRgMatch("{not json"), undefined);
    assert.strictEqual(parseRgMatch(""), undefined);
  });

  test("stream reassembles a match split across chunks", () => {
    const seen: string[] = [];
    const stream = new RgJsonStream((m) => seen.push(`${m.path}:${m.lineNumber}`));
    stream.push(matchLine.slice(0, 20));
    stream.push(`${matchLine.slice(20)}\n`);
    assert.deepStrictEqual(seen, ["src/app.ts:42"]);
  });

  test("stream flush emits a trailing line without a newline", () => {
    const seen: string[] = [];
    const stream = new RgJsonStream((m) => seen.push(m.path));
    stream.push(matchLine);
    assert.deepStrictEqual(seen, []);
    stream.flush();
    assert.deepStrictEqual(seen, ["src/app.ts"]);
  });
});
