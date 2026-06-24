import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { isoDate, tasksDueBy } from "../../src/tasks/dueCheck";

function task(id: string, props: Partial<ManualTask>): ManualTask {
  return {
    id,
    title: id,
    done: false,
    createdAt: 0,
    updatedAt: 0,
    order: 1,
    ...props,
  };
}

suite("isoDate", () => {
  test("returns YYYY-MM-DD from a Date", () => {
    const d = new Date("2026-06-24T15:30:00Z");
    assert.strictEqual(isoDate(d), "2026-06-24");
  });
});

suite("tasksDueBy", () => {
  const today = "2026-06-24";

  test("returns tasks due today", () => {
    const tasks = [task("a", { dueDate: today }), task("b", { dueDate: "2026-12-01" })];
    const due = tasksDueBy(tasks, today);
    assert.deepStrictEqual(due.map((t) => t.id), ["a"]);
  });

  test("returns overdue tasks", () => {
    const tasks = [task("late", { dueDate: "2026-06-20" })];
    const due = tasksDueBy(tasks, today);
    assert.deepStrictEqual(due.map((t) => t.id), ["late"]);
  });

  test("skips tasks without a due date", () => {
    const tasks = [task("plain", {})];
    assert.deepStrictEqual(tasksDueBy(tasks, today), []);
  });

  test("skips done tasks", () => {
    const tasks = [task("done", { dueDate: today, done: true })];
    assert.deepStrictEqual(tasksDueBy(tasks, today), []);
  });

  test("respects snoozedUntil — only suppresses if it's past today", () => {
    const tomorrow = "2026-06-25";
    const yesterday = "2026-06-23";
    const future = task("future", { dueDate: yesterday, snoozedUntil: tomorrow });
    const expired = task("expired", { dueDate: yesterday, snoozedUntil: yesterday });
    const due = tasksDueBy([future, expired], today);
    // The expired-snooze task should fire; the still-snoozed task shouldn't.
    assert.deepStrictEqual(due.map((t) => t.id), ["expired"]);
  });
});
