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
    ];
    for (const id of expected) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });
});
