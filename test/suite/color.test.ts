import * as assert from "node:assert";
import { sanitizeColor } from "../../src/util/color";

suite("sanitizeColor", () => {
  test("accepts valid color literals", () => {
    for (const c of [
      "#fff",
      "#ffbd2e",
      "#ffbd2eaa",
      "red",
      "rgb(255, 0, 0)",
      "rgba(0, 0, 0, .5)",
      "hsl(120, 50%, 50%)",
    ]) {
      assert.strictEqual(sanitizeColor(c), c, `should accept ${c}`);
    }
  });

  test("rejects SVG/attribute injection attempts", () => {
    for (const c of [
      '#fff"/><script>alert(1)</script>',
      'red" onload="x',
      '"><circle onload=x />',
      "a&b",
      "<svg>",
      "rgb(0,0,0);}</style>",
    ]) {
      assert.strictEqual(sanitizeColor(c), undefined, `should reject ${c}`);
    }
  });

  test("rejects empty and overly long input", () => {
    assert.strictEqual(sanitizeColor(undefined), undefined);
    assert.strictEqual(sanitizeColor(""), undefined);
    assert.strictEqual(sanitizeColor(`#${"a".repeat(100)}`), undefined);
  });
});
