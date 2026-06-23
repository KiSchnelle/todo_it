import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { applyReorder } from "../../src/tasks/reorder";

function tasks(specs: Array<[string, number]>): ManualTask[] {
  return specs.map(([id, order]) => ({
    id,
    title: id,
    done: false,
    createdAt: 0,
    updatedAt: 0,
    order,
  }));
}

function ids(arr: ManualTask[]): string[] {
  return [...arr].sort((a, b) => a.order - b.order).map((t) => t.id);
}

suite("applyReorder", () => {
  test("moves one task before another", () => {
    const t = tasks([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    applyReorder(t, ["c"], "a");
    assert.deepStrictEqual(ids(t), ["c", "a", "b"]);
  });

  test("moves to the top", () => {
    const t = tasks([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    applyReorder(t, ["b"], "TOP");
    assert.deepStrictEqual(ids(t), ["b", "a", "c"]);
  });

  test("moves to the end", () => {
    const t = tasks([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    applyReorder(t, ["a"], "END");
    assert.deepStrictEqual(ids(t), ["b", "c", "a"]);
  });

  test("supports moving multiple tasks together, preserving their internal order", () => {
    const t = tasks([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ]);
    applyReorder(t, ["c", "d"], "a");
    assert.deepStrictEqual(ids(t), ["c", "d", "a", "b"]);
  });

  test("renumbers order sequentially 1..N after a move", () => {
    const t = tasks([
      ["a", 10],
      ["b", 20],
      ["c", 30],
    ]);
    applyReorder(t, ["c"], "TOP");
    const sorted = [...t].sort((x, y) => x.order - y.order);
    assert.deepStrictEqual(
      sorted.map((s) => s.order),
      [1, 2, 3],
    );
  });

  test("no-op for empty drag list", () => {
    const t = tasks([
      ["a", 1],
      ["b", 2],
    ]);
    applyReorder(t, [], "TOP");
    assert.deepStrictEqual(ids(t), ["a", "b"]);
  });

  test("unknown target id falls back to end", () => {
    const t = tasks([
      ["a", 1],
      ["b", 2],
    ]);
    applyReorder(t, ["a"], "does-not-exist");
    assert.deepStrictEqual(ids(t), ["b", "a"]);
  });
});
