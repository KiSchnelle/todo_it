import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { FileTaskStorage } from "../../src/tasks/taskStorage";
import { TaskStore } from "../../src/tasks/taskStore";
import { Logger } from "../../src/util/logger";

function tempFolder(): vscode.WorkspaceFolder {
  const dir = path.join(os.tmpdir(), `todoit-test-${randomUUID()}`);
  return { uri: vscode.Uri.file(dir), name: "temp", index: 0 };
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
});
