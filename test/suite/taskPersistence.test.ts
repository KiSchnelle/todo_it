import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { ManualTask } from "../../src/models/types";
import {
  FileTaskStorage,
  WorkspaceStateTaskStorage,
} from "../../src/tasks/taskStorage";
import { TaskStore } from "../../src/tasks/taskStore";
import { Logger } from "../../src/util/logger";

function tempFolder(): vscode.WorkspaceFolder {
  const dir = path.join(os.tmpdir(), `todoit-test-${randomUUID()}`);
  return { uri: vscode.Uri.file(dir), name: "temp", index: 0 };
}

/** Minimal stand-in for vscode.ExtensionContext used by WorkspaceStateTaskStorage. */
function fakeContext(): vscode.ExtensionContext {
  const state = new Map<string, unknown>();
  const memento: vscode.Memento = {
    keys: () => [...state.keys()],
    get: <T,>(key: string, defaultValue?: T): T | undefined =>
      (state.has(key) ? (state.get(key) as T) : defaultValue),
    update: async (key: string, value: unknown): Promise<void> => {
      if (value === undefined) {
        state.delete(key);
      } else {
        state.set(key, value);
      }
    },
  };
  return { workspaceState: memento } as unknown as vscode.ExtensionContext;
}

suite("task persistence (integration)", () => {
  test("round-trips tasks to .vscode/todos.json", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const task = await store.addTask(folder, { title: "Write tests" });
    await store.setDone(folder, task.id, true);

    const fileUri = vscode.Uri.joinPath(folder.uri, ".vscode/todos.json");
    const json = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri)));
    assert.strictEqual(json.schemaVersion, 1);
    assert.strictEqual(json.tasks.length, 1);
    assert.strictEqual(json.tasks[0].title, "Write tests");
    assert.strictEqual(json.tasks[0].done, true);

    const reopened = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);
    const loaded = await reopened.getTasks(folder);
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].title, "Write tests");

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("sets and clears priority, due date, and note", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const task = await store.addTask(folder, { title: "Ship it" });
    await store.updateTask(folder, task.id, {
      priority: "high",
      dueDate: "2026-06-01",
      note: "before the release",
    });
    let loaded = (await store.getTasks(folder))[0];
    assert.strictEqual(loaded.priority, "high");
    assert.strictEqual(loaded.dueDate, "2026-06-01");
    assert.strictEqual(loaded.note, "before the release");

    await store.updateTask(folder, task.id, {
      priority: undefined,
      dueDate: undefined,
      note: undefined,
    });
    loaded = (await store.getTasks(folder))[0];
    assert.strictEqual(loaded.priority, undefined);
    assert.strictEqual(loaded.dueDate, undefined);
    assert.strictEqual(loaded.note, undefined);

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("removeTask deletes the task from storage", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const a = await store.addTask(folder, { title: "A" });
    await store.addTask(folder, { title: "B" });
    await store.removeTask(folder, a.id);

    assert.deepStrictEqual((await store.getTasks(folder)).map((t) => t.title), ["B"]);

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("moveTask is a no-op when the new parent equals the current parent (order unchanged)", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const parent = await store.addTask(folder, { title: "Parent" });
    const a = await store.addTask(folder, { title: "A", parentId: parent.id });
    const b = await store.addTask(folder, { title: "B", parentId: parent.id });
    const aOrderBefore = (await store.getTasks(folder)).find((t) => t.id === a.id)?.order;

    // Same parent — should not change order or touch the file.
    await store.moveTask(folder, a.id, parent.id);
    const aAfter = (await store.getTasks(folder)).find((t) => t.id === a.id);
    assert.strictEqual(aAfter?.parentId, parent.id);
    assert.strictEqual(aAfter?.order, aOrderBefore);
    // B's order unchanged.
    const bAfter = (await store.getTasks(folder)).find((t) => t.id === b.id);
    assert.strictEqual(bAfter?.parentId, parent.id);

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("updateTask({ links: [] }) clears a previously set links array", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const t = await store.addTask(folder, {
      title: "Linked",
      links: [{ uri: "file:///foo.ts", line: 0 }],
    });
    assert.strictEqual((await store.getTasks(folder))[0]?.links?.length, 1);

    await store.updateTask(folder, t.id, { links: [] });
    const after = await store.getTasks(folder);
    assert.strictEqual(after[0]?.links, undefined);

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("multiple links: addTask + updateTask roundtrip", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const t = await store.addTask(folder, {
      title: "Spans files",
      links: [
        { uri: "file:///a.ts", line: 0 },
        { uri: "file:///b.ts", line: 10 },
      ],
    });
    const loaded1 = (await store.getTasks(folder)).find((x) => x.id === t.id);
    assert.strictEqual(loaded1?.links?.length, 2);

    // Add a third + remove the first.
    await store.updateTask(folder, t.id, {
      links: [
        { uri: "file:///b.ts", line: 10 },
        { uri: "file:///c.ts", line: 5 },
      ],
    });
    const loaded2 = (await store.getTasks(folder)).find((x) => x.id === t.id);
    assert.deepStrictEqual(
      loaded2?.links?.map((l) => l.uri),
      ["file:///b.ts", "file:///c.ts"],
    );

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("moveTask refuses to re-parent onto a descendant (would create a cycle)", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const grandparent = await store.addTask(folder, { title: "GP" });
    const parent = await store.addTask(folder, { title: "P", parentId: grandparent.id });
    const child = await store.addTask(folder, { title: "C", parentId: parent.id });

    // Moving GP under its own grandchild would create a cycle — must be a no-op.
    await store.moveTask(folder, grandparent.id, child.id);
    const after = await store.getTasks(folder);
    assert.strictEqual(
      after.find((t) => t.id === grandparent.id)?.parentId,
      undefined,
      "grandparent should remain top-level after a blocked cycle move",
    );

    // Moving onto self also forbidden.
    await store.moveTask(folder, parent.id, parent.id);
    assert.strictEqual(
      (await store.getTasks(folder)).find((t) => t.id === parent.id)?.parentId,
      grandparent.id,
    );

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("isValidTask rejects malformed `links` (string instead of array)", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const corrupted = {
      schemaVersion: 1,
      tasks: [
        {
          id: "good",
          title: "Valid",
          done: false,
          createdAt: 0,
          updatedAt: 0,
          order: 1,
          links: [{ uri: "file:///a.ts", line: 0 }],
        },
        {
          id: "bad",
          title: "Bad shape",
          done: false,
          createdAt: 0,
          updatedAt: 0,
          order: 2,
          links: "not an array",
        },
        {
          id: "also-bad",
          title: "Bad link entry",
          done: false,
          createdAt: 0,
          updatedAt: 0,
          order: 3,
          links: [{ uri: 42, line: 0 }],
        },
      ],
    };
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, ".vscode"));
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder.uri, ".vscode/todos.json"),
      new TextEncoder().encode(JSON.stringify(corrupted, null, 2)),
    );

    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);
    const loaded = await store.getTasks(folder);
    // Only the well-formed task survives.
    assert.deepStrictEqual(loaded.map((t) => t.id), ["good"]);

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("legacy `link` field is migrated to `links[0]` on read", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    // Write a legacy-shaped file by hand.
    const legacy = {
      schemaVersion: 1,
      tasks: [
        {
          id: "legacy",
          title: "Old shape",
          done: false,
          createdAt: 0,
          updatedAt: 0,
          order: 1,
          link: { uri: "file:///legacy.ts", line: 5 },
        },
      ],
    };
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, ".vscode"));
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folder.uri, ".vscode/todos.json"),
      new TextEncoder().encode(JSON.stringify(legacy, null, 2)),
    );

    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);
    const loaded = await store.getTasks(folder);
    assert.strictEqual(loaded.length, 1);
    assert.deepStrictEqual(loaded[0].links, [{ uri: "file:///legacy.ts", line: 5 }]);
    // The migrated task should also no longer carry a `link` field.
    assert.strictEqual((loaded[0] as { link?: unknown }).link, undefined);

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("subtasks: setDone cascades to descendants, removeTask cascades, moveTask reparents", async () => {
    const folder = tempFolder();
    const logger = new Logger();
    const store = new TaskStore(new FileTaskStorage(".vscode/todos.json", logger), logger);

    const parent = await store.addTask(folder, { title: "Ship release" });
    const childA = await store.addTask(folder, { title: "Cut RC", parentId: parent.id });
    const childB = await store.addTask(folder, { title: "Run smoke tests", parentId: parent.id });
    const grandchild = await store.addTask(folder, { title: "Auth flow", parentId: childA.id });
    const sibling = await store.addTask(folder, { title: "Unrelated" });

    // Done cascades down — not sideways.
    await store.setDone(folder, parent.id, true);
    const byId = new Map((await store.getTasks(folder)).map((t) => [t.id, t]));
    assert.strictEqual(byId.get(parent.id)?.done, true);
    assert.strictEqual(byId.get(childA.id)?.done, true);
    assert.strictEqual(byId.get(childB.id)?.done, true);
    assert.strictEqual(byId.get(grandchild.id)?.done, true);
    assert.strictEqual(byId.get(sibling.id)?.done, false);

    // moveTask: make childB a top-level task.
    await store.moveTask(folder, childB.id, undefined);
    const afterMove = await store.getTasks(folder);
    assert.strictEqual(afterMove.find((t) => t.id === childB.id)?.parentId, undefined);

    // moveTask refuses to re-parent under self or a descendant (no cycle).
    await store.moveTask(folder, parent.id, grandchild.id);
    assert.strictEqual(
      (await store.getTasks(folder)).find((t) => t.id === parent.id)?.parentId,
      undefined,
    );

    // removeTask cascades — deleting `parent` also removes childA + grandchild but not childB or sibling.
    await store.removeTask(folder, parent.id);
    const remaining = (await store.getTasks(folder)).map((t) => t.id).sort();
    assert.deepStrictEqual(remaining, [childB.id, sibling.id].sort());

    await vscode.workspace.fs.delete(folder.uri, { recursive: true });
    logger.dispose();
  });

  test("WorkspaceStateTaskStorage: roundtrip + legacy `link` migration on read", async () => {
    const folder = tempFolder();
    const ctx = fakeContext();
    const storage = new WorkspaceStateTaskStorage(ctx);

    // Seed the workspace state with a legacy task (singular `link` field).
    const legacy = [
      {
        id: "legacy",
        title: "Old shape",
        done: false,
        createdAt: 0,
        updatedAt: 0,
        order: 1,
        link: { uri: "file:///legacy.ts", line: 5 },
      },
    ];
    await ctx.workspaceState.update(`todoIt.tasks.${folder.uri.toString()}`, legacy);

    const loaded = await storage.load(folder);
    assert.strictEqual(loaded.length, 1);
    assert.deepStrictEqual(loaded[0].links, [{ uri: "file:///legacy.ts", line: 5 }]);
    assert.strictEqual((loaded[0] as { link?: unknown }).link, undefined);

    // Save with the new shape; reload should round-trip cleanly.
    const next: ManualTask[] = [
      {
        id: "fresh",
        title: "New shape",
        done: false,
        createdAt: 1,
        updatedAt: 1,
        order: 1,
        links: [
          { uri: "file:///a.ts", line: 0 },
          { uri: "file:///b.ts", line: 4 },
        ],
      },
    ];
    await storage.save(folder, next);
    const reloaded = await storage.load(folder);
    assert.strictEqual(reloaded.length, 1);
    assert.deepStrictEqual(reloaded[0].links?.map((l) => l.uri), [
      "file:///a.ts",
      "file:///b.ts",
    ]);
  });
});
