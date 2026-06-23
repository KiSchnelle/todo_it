import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ScanStore } from "../scanner/scanStore";
import { TaskStore } from "../tasks/taskStore";

const FOCUS_COMMAND = "todoIt.view.focus";

/**
 * Status-bar item showing open task and scanned-todo counts. Click reveals the view.
 * Reacts to task/scan store changes and to the `todoIt.statusBar.enabled` setting.
 */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly scanStore: ScanStore,
    private readonly taskStore: TaskStore,
    private readonly config: Configuration,
  ) {
    this.item = vscode.window.createStatusBarItem(
      "todoIt.status",
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.name = "Todo It";
    this.item.command = FOCUS_COMMAND;
    this.disposables.push(this.item);
    this.disposables.push(this.scanStore.onDidChange(() => this.refresh()));
    this.disposables.push(this.taskStore.onDidChange(() => this.refresh()));
    this.disposables.push(
      this.config.onDidChange((e) => {
        if (e.affectsConfiguration("todoIt.statusBar.enabled")) {
          this.refresh();
        }
      }),
    );
    this.refresh();
  }

  private refresh(): void {
    if (!this.config.all.statusBarEnabled) {
      this.item.hide();
      return;
    }
    const openTasks = this.taskStore.all().filter((t) => !t.done).length;
    const todos = this.scanStore.allMatches().length;
    this.item.text = `$(checklist) ${openTasks}  $(comment) ${todos}`;
    this.item.tooltip = new vscode.MarkdownString(
      `**Todo It**\n\n` +
        `- ${openTasks} open task${openTasks === 1 ? "" : "s"}\n` +
        `- ${todos} todo${todos === 1 ? "" : "s"} in code\n\n` +
        `Click to open the view.`,
    );
    this.item.show();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
