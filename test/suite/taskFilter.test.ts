import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { expandToAncestors, taskMatchesFilter } from "../../src/tasks/filter";

function t(id: string, title: string, parentId?: string, note?: string): ManualTask {
  return {
    id,
    title,
    done: false,
    createdAt: 0,
    updatedAt: 0,
    order: 1,
    ...(parentId ? { parentId } : {}),
    ...(note ? { note } : {}),
  };
}

suite("taskMatchesFilter", () => {
  test("matches in title", () => {
    assert.strictEqual(taskMatchesFilter(t("a", "Fix the bug"), "bug"), true);
  });

  test("matches in note (case-insensitive)", () => {
    assert.strictEqual(
      taskMatchesFilter(t("a", "Other", undefined, "Fix Auth flow"), "auth"),
      true,
    );
  });

  test("non-match", () => {
    assert.strictEqual(taskMatchesFilter(t("a", "Hello"), "world"), false);
  });
});

suite("expandToAncestors", () => {
  test("returns just the direct matches when nothing has a parent", () => {
    const tasks = [t("a", "A"), t("b", "B")];
    const visible = expandToAncestors(tasks, ["a"]);
    assert.deepStrictEqual([...visible].sort(), ["a"]);
  });

  test("walks up through every ancestor", () => {
    const tasks = [
      t("root", "Root"),
      t("mid", "Mid", "root"),
      t("leaf", "Leaf", "mid"),
      t("other", "Unrelated"),
    ];
    const visible = expandToAncestors(tasks, ["leaf"]);
    assert.deepStrictEqual([...visible].sort(), ["leaf", "mid", "root"]);
  });

  test("merges ancestors for multiple matches", () => {
    const tasks = [
      t("root", "Root"),
      t("mid", "Mid", "root"),
      t("leaf1", "Leaf1", "mid"),
      t("leaf2", "Leaf2", "root"),
    ];
    const visible = expandToAncestors(tasks, ["leaf1", "leaf2"]);
    assert.deepStrictEqual(
      [...visible].sort(),
      ["leaf1", "leaf2", "mid", "root"],
    );
  });

  test("stops the walk at an unknown parentId (orphan)", () => {
    const tasks = [t("orphan", "Orphan", "missing")];
    const visible = expandToAncestors(tasks, ["orphan"]);
    // The orphan itself is included; "missing" is not because it doesn't exist.
    assert.deepStrictEqual([...visible].sort(), ["orphan"]);
  });

  test("empty input yields an empty set", () => {
    assert.strictEqual(expandToAncestors([t("a", "A")], []).size, 0);
  });
});
