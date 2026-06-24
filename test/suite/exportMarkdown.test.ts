import * as assert from "node:assert";
import { ManualTask } from "../../src/models/types";
import { renderTasksAsMarkdown } from "../../src/tasks/exportMarkdown";

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

suite("renderTasksAsMarkdown", () => {
  test("empty input renders the heading and a no-tasks line", () => {
    const md = renderTasksAsMarkdown([], { heading: "# Tasks" });
    assert.match(md, /# Tasks/);
    assert.match(md, /\(no tasks\)/);
  });

  test("groups open tasks by priority high → medium → low → none", () => {
    const md = renderTasksAsMarkdown(
      [
        task("a", { title: "lowtask", priority: "low" }),
        task("b", { title: "hightask", priority: "high" }),
        task("c", { title: "untyped" }),
        task("d", { title: "medtask", priority: "medium" }),
      ],
      { heading: "# Tasks" },
    );
    const high = md.indexOf("hightask");
    const med = md.indexOf("medtask");
    const low = md.indexOf("lowtask");
    const none = md.indexOf("untyped");
    assert.ok(high < med && med < low && low < none, "priority order should be high, medium, low, none");
  });

  test("renders subtasks as indented children under their parent", () => {
    const parent = task("p", { title: "Parent", priority: "high" });
    const child = task("c", { title: "Child", parentId: "p" });
    const grand = task("g", { title: "Grand", parentId: "c" });
    const md = renderTasksAsMarkdown([parent, child, grand], { heading: "# Tasks" });
    // Parent line is depth 0; child is depth 1 (2 spaces); grand is depth 2 (4 spaces).
    assert.match(md, /^- \[ \] Parent/m);
    assert.match(md, /^ {2}- \[ \] Child/m);
    assert.match(md, /^ {4}- \[ \] Grand/m);
  });

  test("done tasks render in a separate Done section, not by priority", () => {
    const md = renderTasksAsMarkdown(
      [
        task("a", { title: "openhigh", priority: "high" }),
        task("b", { title: "doneone", done: true }),
      ],
      { heading: "# Tasks" },
    );
    assert.match(md, /## High priority[\s\S]*openhigh/);
    assert.match(md, /## Done[\s\S]*doneone/);
  });

  test("renders linked sources via the pathRenderer hook", () => {
    const md = renderTasksAsMarkdown(
      [task("a", { title: "linked", links: [{ uri: "file:///abs/path.ts", line: 41 }] })],
      {
        heading: "# Tasks",
        pathRenderer: (uri) => uri.replace("file:///abs/", "rel/"),
      },
    );
    assert.match(md, /🔗 rel\/path\.ts:42/);
  });

  test("includes due-date metadata on subtasks (top-level dates show via the priority grouping context)", () => {
    const md = renderTasksAsMarkdown(
      [
        task("p", { title: "Parent", priority: "high" }),
        task("c", { title: "Child", parentId: "p", dueDate: "2026-06-30", priority: "low" }),
      ],
      { heading: "# Tasks" },
    );
    assert.match(md, /Child _\(low, due 2026-06-30\)_/);
  });
});
