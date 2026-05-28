import * as assert from "node:assert";
import { parseDueDate } from "../../src/util/date";

const now = new Date(2026, 4, 28); // 2026-05-28

suite("parseDueDate", () => {
  test("today and tomorrow", () => {
    assert.strictEqual(parseDueDate("today", now), "2026-05-28");
    assert.strictEqual(parseDueDate("tomorrow", now), "2026-05-29");
  });

  test("exact dates pass through; invalid ones are rejected", () => {
    assert.strictEqual(parseDueDate("2026-06-01", now), "2026-06-01");
    assert.strictEqual(parseDueDate("2026-13-01", now), undefined);
    assert.strictEqual(parseDueDate("2026-02-30", now), undefined);
  });

  test("relative offsets (days/weeks/months/years)", () => {
    assert.strictEqual(parseDueDate("3 days", now), "2026-05-31");
    assert.strictEqual(parseDueDate("2w", now), "2026-06-11");
    assert.strictEqual(parseDueDate("in 2 weeks", now), "2026-06-11");
    assert.strictEqual(parseDueDate("1 month", now), "2026-06-28");
    assert.strictEqual(parseDueDate("1 year", now), "2027-05-28");
  });

  test("rejects empty and unparseable input", () => {
    assert.strictEqual(parseDueDate("", now), undefined);
    assert.strictEqual(parseDueDate("next tuesday", now), undefined);
    assert.strictEqual(parseDueDate("soon", now), undefined);
  });
});
