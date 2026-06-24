import * as assert from "node:assert";
import { ManualTask, TagMatch, TaskLink } from "../../src/models/types";
import {
  findExistingLinkedTask,
  hasExactLink,
} from "../../src/tasks/linkedTaskLookup";

function task(id: string, link: { uri: string; line: number } | undefined): ManualTask {
  return {
    id,
    title: id,
    done: false,
    createdAt: 0,
    updatedAt: 0,
    order: 1,
    ...(link ? { links: [link] } : {}),
  };
}

function match(uri: string, line: number): TagMatch {
  return {
    matchId: `${uri}|${line}|0|TODO`,
    uri,
    folderUri: "f1",
    tag: "TODO",
    line,
    startCol: 0,
    endCol: 4,
    lineText: "// TODO",
    text: "",
  };
}

suite("findExistingLinkedTask", () => {
  test("returns the task linked to the same uri:line", () => {
    const tasks = [task("a", undefined), task("b", { uri: "u1", line: 5 })];
    const m = match("u1", 5);
    assert.strictEqual(findExistingLinkedTask(tasks, m)?.id, "b");
  });

  test("returns undefined when no task is linked there", () => {
    const tasks = [task("a", { uri: "u1", line: 4 })];
    const m = match("u1", 5);
    assert.strictEqual(findExistingLinkedTask(tasks, m), undefined);
  });

  test("does not match unlinked tasks", () => {
    const tasks = [task("a", undefined), task("b", undefined)];
    const m = match("u1", 5);
    assert.strictEqual(findExistingLinkedTask(tasks, m), undefined);
  });

  test("returns the first match when multiple link to the same line (dedupe edge case)", () => {
    const tasks = [
      task("a", { uri: "u1", line: 5 }),
      task("b", { uri: "u1", line: 5 }),
    ];
    const m = match("u1", 5);
    assert.strictEqual(findExistingLinkedTask(tasks, m)?.id, "a");
  });

  test("works across multi-link tasks (any link entry matches)", () => {
    const t: ManualTask = {
      id: "multi",
      title: "Multi",
      done: false,
      createdAt: 0,
      updatedAt: 0,
      order: 1,
      links: [
        { uri: "u1", line: 1 },
        { uri: "u2", line: 7 },
      ],
    };
    assert.strictEqual(findExistingLinkedTask([t], match("u2", 7))?.id, "multi");
  });
});

suite("hasExactLink", () => {
  const links: TaskLink[] = [
    { uri: "file:///a.ts", line: 0 },
    { uri: "file:///b.ts", line: 4 },
  ];

  test("matches exact uri + line", () => {
    assert.strictEqual(hasExactLink(links, { uri: "file:///b.ts", line: 4 }), true);
  });

  test("rejects same uri at different line", () => {
    assert.strictEqual(hasExactLink(links, { uri: "file:///b.ts", line: 5 }), false);
  });

  test("rejects different uri at same line", () => {
    assert.strictEqual(hasExactLink(links, { uri: "file:///c.ts", line: 0 }), false);
  });

  test("empty list never matches", () => {
    assert.strictEqual(hasExactLink([], { uri: "file:///x.ts", line: 0 }), false);
  });
});
