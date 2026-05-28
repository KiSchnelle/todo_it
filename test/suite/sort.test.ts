import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { sortTasks } from "../../src/tasks/sort";

function task(partial: Partial<ManualTask> & { title: string }): ManualTask {
  return {
    id: partial.title,
    title: partial.title,
    done: partial.done ?? false,
    priority: partial.priority,
    dueDate: partial.dueDate,
    note: partial.note,
    createdAt: 0,
    updatedAt: 0,
    order: partial.order ?? 0,
  };
}

suite("sortTasks", () => {
  test("manual keeps insertion order, completed last", () => {
    const tasks = [
      task({ title: "a", order: 1, done: true }),
      task({ title: "b", order: 2 }),
      task({ title: "c", order: 0 }),
    ];
    assert.deepStrictEqual(sortTasks(tasks, "manual").map((t) => t.title), ["c", "b", "a"]);
  });

  test("priority: high > medium > low > none, completed last", () => {
    const tasks = [
      task({ title: "none", order: 0 }),
      task({ title: "low", priority: "low", order: 1 }),
      task({ title: "high", priority: "high", order: 2 }),
      task({ title: "med", priority: "medium", order: 3 }),
      task({ title: "doneHigh", priority: "high", done: true, order: 4 }),
    ];
    assert.deepStrictEqual(
      sortTasks(tasks, "priority").map((t) => t.title),
      ["high", "med", "low", "none", "doneHigh"],
    );
  });

  test("dueDate: earliest first, undated last", () => {
    const tasks = [
      task({ title: "undated", order: 0 }),
      task({ title: "jun", dueDate: "2026-06-01", order: 1 }),
      task({ title: "may", dueDate: "2026-05-30", order: 2 }),
    ];
    assert.deepStrictEqual(
      sortTasks(tasks, "dueDate").map((t) => t.title),
      ["may", "jun", "undated"],
    );
  });
});
