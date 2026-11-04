import * as assert from "node:assert";
import * as vscode from "vscode";

suite("extension", () => {
  test("activates and registers its commands", async () => {
    const ext = vscode.extensions.getExtension("KiSchnelle.todo-it");
    assert.ok(ext, "extension KiSchnelle.todo-it should be installed");
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    const expected = [
      "todoIt.refresh",
      "todoIt.addTask",
      "todoIt.editTask",
      "todoIt.deleteTask",
      "todoIt.openMatch",
      "todoIt.toggleDecorations",
      "todoIt.setGrouping",
      "todoIt.setTaskSort",
      "todoIt.setFilter",
      "todoIt.clearFilter",
      "todoIt.trackAsTask",
      "todoIt.openTaskLink",
      "todoIt.addTaskLink",
      "todoIt.removeTaskLink",
      "todoIt.goToTodo",
      "todoIt.addSubtask",
      "todoIt.moveTask",
      "todoIt.ai.summarizeTodos",
      "todoIt.ai.suggestPriority",
      "todoIt.ai.trackAsTask",
      "todoIt.ai.explainMatch",
      "todoIt.exportTasks",
      "todoIt.setTaskPriority",
      "todoIt.snoozeTask",
    ];
    for (const id of expected) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });

  test("contributes language model tools instead of a chat participant", () => {
    const ext = vscode.extensions.getExtension("KiSchnelle.todo-it");
    assert.ok(ext);
    const contributes = ext.packageJSON.contributes as Record<string, unknown>;
    assert.strictEqual(contributes.chatParticipants, undefined, "chat participants are deprecated");
    const tools = (contributes.languageModelTools as { name: string }[]).map((t) => t.name);
    assert.deepStrictEqual(tools, ["todoIt_listTodos", "todoIt_listTasks", "todoIt_addTask", "todoIt_setTaskDone"]);
  });

  test("registers its language model tools", async () => {
    const ext = vscode.extensions.getExtension("KiSchnelle.todo-it");
    await ext?.activate();
    const names = vscode.lm.tools.map((t) => t.name);
    for (const name of ["todoIt_listTodos", "todoIt_listTasks", "todoIt_addTask", "todoIt_setTaskDone"]) {
      assert.ok(names.includes(name), `missing tool ${name}`);
    }
  });

  test("todoIt_listTasks tool returns text", async () => {
    const ext = vscode.extensions.getExtension("KiSchnelle.todo-it");
    await ext?.activate();
    const result = await vscode.lm.invokeTool(
      "todoIt_listTasks",
      { input: { status: "all" }, toolInvocationToken: undefined },
      new vscode.CancellationTokenSource().token,
    );
    const text = result.content
      .filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart)
      .map((p) => p.value)
      .join("");
    assert.ok(text.length > 0);
  });
});
