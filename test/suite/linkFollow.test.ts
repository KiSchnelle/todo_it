import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { planLinkRenames } from "../../src/tasks/linkFollow";

function task(id: string, ...linkUris: string[]): ManualTask {
  return {
    id,
    title: id,
    done: false,
    createdAt: 0,
    updatedAt: 0,
    order: 1,
    ...(linkUris.length > 0
      ? { links: linkUris.map((uri) => ({ uri, line: 0 })) }
      : {}),
  };
}

suite("planLinkRenames", () => {
  test("matches the affected link by old uri and rewrites only that link", () => {
    const tasks = [task("a", "file:///old.ts"), task("b", "file:///other.ts")];
    const updates = planLinkRenames(tasks, [
      { oldUri: "file:///old.ts", newUri: "file:///new.ts" },
    ]);
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].taskId, "a");
    assert.deepStrictEqual(updates[0].newLinks.map((l) => l.uri), ["file:///new.ts"]);
  });

  test("preserves untouched links inside a multi-link task", () => {
    const tasks = [task("multi", "file:///a-old.ts", "file:///b-stable.ts", "file:///c-stable.ts")];
    const updates = planLinkRenames(tasks, [
      { oldUri: "file:///a-old.ts", newUri: "file:///a-new.ts" },
    ]);
    assert.strictEqual(updates.length, 1);
    assert.deepStrictEqual(
      updates[0].newLinks.map((l) => l.uri),
      ["file:///a-new.ts", "file:///b-stable.ts", "file:///c-stable.ts"],
    );
  });

  test("ignores tasks without any links", () => {
    const tasks = [task("a"), task("b", "file:///old.ts")];
    const updates = planLinkRenames(tasks, [
      { oldUri: "file:///old.ts", newUri: "file:///new.ts" },
    ]);
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0].taskId, "b");
  });

  test("empty renames or empty tasks → empty result", () => {
    assert.deepStrictEqual(planLinkRenames([], [{ oldUri: "a", newUri: "b" }]), []);
    assert.deepStrictEqual(planLinkRenames([task("a", "x")], []), []);
  });
});
