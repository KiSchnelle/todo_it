import * as assert from "node:assert";
import { ManualTask, TagMatch } from "../../src/models/types";
import {
  clampLimit,
  filterMatches,
  filterTasks,
  isIsoDate,
  renderMatches,
  renderTask,
  renderTaskGroups,
  validateAddTask,
} from "../../src/ai/toolFormat";

function task(id: string, props: Partial<ManualTask> = {}): ManualTask {
  return { id, title: id, done: false, createdAt: 0, updatedAt: 0, order: 1, ...props };
}

function match(tag: string, text: string, uri = "file:///w/a.ts", line = 0): TagMatch {
  return {
    matchId: `${uri}|${line}|0|${tag}`,
    uri,
    folderUri: "file:///w",
    tag,
    line,
    startCol: 0,
    endCol: tag.length,
    lineText: `// ${tag}: ${text}`,
    text,
  };
}

const pathOf = (m: TagMatch): string => m.uri.replace("file:///w/", "");
const today = "2026-06-24";

suite("toolFormat: todos", () => {
  const matches = [
    match("TODO", "refactor auth", "file:///w/auth.ts", 4),
    match("FIXME", "null check", "file:///w/api.ts", 9),
    match("TODO", "add tests", "file:///w/api.ts", 1),
  ];

  test("filters by tag case-insensitively", () => {
    assert.deepStrictEqual(
      filterMatches(matches, { tag: "fixme" }, pathOf).map((m) => m.text),
      ["null check"],
    );
  });

  test("filters by query over text and path", () => {
    assert.deepStrictEqual(
      filterMatches(matches, { query: "API" }, pathOf).map((m) => m.text),
      ["null check", "add tests"],
    );
    assert.strictEqual(filterMatches(matches, { tag: "TODO", query: "auth" }, pathOf).length, 1);
  });

  test("clampLimit defaults and caps", () => {
    assert.strictEqual(clampLimit(undefined, 400), 200);
    assert.strictEqual(clampLimit(undefined, 50), 50);
    assert.strictEqual(clampLimit(-1, 400), 200);
    assert.strictEqual(clampLimit(1000, 400), 400);
    assert.strictEqual(clampLimit(7.9, 400), 7);
  });

  test("renderMatches reports truncation and empty state", () => {
    const out = renderMatches(matches.slice(0, 1), 3, (m) => `${pathOf(m)}:${m.line + 1}`);
    assert.ok(out.startsWith("3 matching TODO comments (showing the first 1):"));
    assert.ok(out.includes("- [TODO] auth.ts:5 — refactor auth"));
    assert.strictEqual(renderMatches([], 0, () => ""), "No matching TODO comments found in the workspace.");
  });
});

suite("toolFormat: tasks", () => {
  const tasks = [
    task("open", { title: "Write docs", note: "README section" }),
    task("done", { title: "Ship it", done: true }),
    task("late", { title: "Pay invoice", dueDate: "2026-06-01", priority: "high" }),
    task("today", { title: "Standup", dueDate: today }),
    task("snoozed", { title: "Later", dueDate: "2026-06-01", snoozedUntil: "2026-07-01" }),
  ];

  test("defaults to open tasks", () => {
    assert.deepStrictEqual(
      filterTasks(tasks, {}, today).map((t) => t.id),
      ["open", "late", "today", "snoozed"],
    );
  });

  test("status done / all / due", () => {
    assert.deepStrictEqual(filterTasks(tasks, { status: "done" }, today).map((t) => t.id), ["done"]);
    assert.strictEqual(filterTasks(tasks, { status: "all" }, today).length, 5);
    assert.deepStrictEqual(filterTasks(tasks, { status: "due" }, today).map((t) => t.id), ["late", "today"]);
  });

  test("query matches title and note", () => {
    assert.deepStrictEqual(filterTasks(tasks, { query: "readme" }, today).map((t) => t.id), ["open"]);
  });

  test("renderTask includes id, priority, overdue marker, and snooze", () => {
    assert.strictEqual(renderTask(tasks[2], today), "- Pay invoice (id: late, priority: high, OVERDUE (due 2026-06-01))");
    assert.ok(renderTask(tasks[4], today).includes("snoozed until 2026-07-01"));
    assert.ok(renderTask(tasks[0], today).includes("\n  note: README section"));
  });

  test("renderTaskGroups headers only for multi-root", () => {
    const groups = [
      { folder: "a", tasks: [tasks[0]] },
      { folder: "b", tasks: [] },
    ];
    assert.ok(!renderTaskGroups(groups, today, false).includes("## a"));
    const multi = renderTaskGroups(groups, today, true);
    assert.ok(multi.includes("## a"));
    assert.ok(!multi.includes("## b"));
    assert.strictEqual(renderTaskGroups([{ folder: "a", tasks: [] }], today, false), "No matching tasks.");
  });
});

suite("toolFormat: validation", () => {
  test("isIsoDate", () => {
    assert.ok(isIsoDate("2026-02-28"));
    assert.ok(!isIsoDate("2026-02-30"));
    assert.ok(!isIsoDate("tomorrow"));
  });

  test("validateAddTask", () => {
    assert.strictEqual(validateAddTask({ title: "x" }), undefined);
    assert.ok(validateAddTask({ title: "  " }));
    assert.ok(validateAddTask({ title: "x", priority: "urgent" as never }));
    assert.ok(validateAddTask({ title: "x", dueDate: "next week" }));
    assert.strictEqual(validateAddTask({ title: "x", priority: "high", dueDate: "2026-12-31" }), undefined);
  });
});
