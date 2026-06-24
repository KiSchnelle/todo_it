import * as assert from "node:assert";
import {
  parseExpandedTaskResponse,
  parsePriorityResponse,
  stripJsonFences,
} from "../../src/ai/parsing";

suite("stripJsonFences", () => {
  test("returns plain JSON unchanged", () => {
    assert.strictEqual(stripJsonFences(`{"a":1}`), `{"a":1}`);
  });

  test("strips a plain triple-backtick fence", () => {
    assert.strictEqual(stripJsonFences("```\n{\"a\":1}\n```"), `{"a":1}`);
  });

  test("strips a ```json fence", () => {
    assert.strictEqual(stripJsonFences("```json\n{\"a\":1}\n```"), `{"a":1}`);
  });

  test("trims surrounding whitespace", () => {
    assert.strictEqual(stripJsonFences("\n  {\"a\":1}  \n"), `{"a":1}`);
  });
});

suite("parsePriorityResponse", () => {
  test("accepts valid {priority, reason}", () => {
    assert.deepStrictEqual(parsePriorityResponse(`{"priority":"high","reason":"crash"}`), {
      priority: "high",
      reason: "crash",
    });
  });

  test("accepts a fenced JSON response", () => {
    assert.deepStrictEqual(
      parsePriorityResponse('```json\n{"priority":"low","reason":"polish"}\n```'),
      { priority: "low", reason: "polish" },
    );
  });

  test("rejects unknown priorities", () => {
    assert.strictEqual(
      parsePriorityResponse(`{"priority":"urgent","reason":"x"}`),
      undefined,
    );
  });

  test("rejects malformed JSON", () => {
    assert.strictEqual(parsePriorityResponse(`{not json`), undefined);
  });

  test("rejects missing reason", () => {
    assert.strictEqual(parsePriorityResponse(`{"priority":"high"}`), undefined);
  });
});

suite("parseExpandedTaskResponse", () => {
  test("accepts title + note without priority", () => {
    const r = parseExpandedTaskResponse(`{"title":"Fix it","note":"because"}`);
    assert.deepStrictEqual(r, { title: "Fix it", note: "because", priority: undefined });
  });

  test("accepts title + note + priority", () => {
    const r = parseExpandedTaskResponse(
      `{"title":"Fix it","note":"because","priority":"medium"}`,
    );
    assert.deepStrictEqual(r, { title: "Fix it", note: "because", priority: "medium" });
  });

  test("drops an invalid priority but still returns title + note", () => {
    const r = parseExpandedTaskResponse(
      `{"title":"Fix it","note":"because","priority":"urgent"}`,
    );
    assert.deepStrictEqual(r, { title: "Fix it", note: "because", priority: undefined });
  });

  test("trims a whitespace-padded title", () => {
    const r = parseExpandedTaskResponse(`{"title":"  Fix it  ","note":""}`);
    assert.strictEqual(r?.title, "Fix it");
  });

  test("rejects empty title", () => {
    assert.strictEqual(parseExpandedTaskResponse(`{"title":"   ","note":""}`), undefined);
  });

  test("rejects malformed JSON", () => {
    assert.strictEqual(parseExpandedTaskResponse(`not json`), undefined);
  });
});
