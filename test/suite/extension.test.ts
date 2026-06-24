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
});
