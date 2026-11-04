import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { collectDescendants } from "../../src/tasks/hierarchy";

function t(id: string, parentId?: string): ManualTask {
  return { id, title: id, done: false, createdAt: 0, updatedAt: 0, order: 1, parentId };
}

suite("collectDescendants", () => {
  test("collects nested descendants", () => {
    const out = collectDescendants([t("a"), t("b", "a"), t("c", "b"), t("d")], "a");
    assert.deepStrictEqual(
      out.map((x) => x.id),
      ["b", "c"],
    );
  });

  test("terminates on a parent cycle", () => {
    const out = collectDescendants([t("a", "b"), t("b", "a")], "a");
    assert.deepStrictEqual(
      out.map((x) => x.id),
      ["b"],
    );
  });

  test("terminates on a self-parent", () => {
    assert.deepStrictEqual(collectDescendants([t("a", "a")], "a"), []);
  });
});
