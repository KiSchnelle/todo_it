import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ManualTask } from "../models/types";
import { TaskStore } from "./taskStore";
import { addDays, isoDate, tasksDueBy } from "./dueCheck";
import { getFolders } from "../workspace/folders";
import { Logger } from "../util/logger";

const SETTING_KEY = "todoIt.notifications.dueSoon";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Opt-in (`todoIt.notifications.dueSoon`) notifier that surfaces tasks whose
 * due date has hit. Fires at most once per task per VS Code session — the
 * in-memory dedup keeps the prompt from re-popping every hour. "Snooze 1 day"
 * pushes `snoozedUntil` to tomorrow; "Open" reveals the Todo It view.
 */
export class DueNotifier implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly notified = new Set<string>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly taskStore: TaskStore,
    private readonly config: Configuration,
    private readonly logger: Logger,
  ) {
    this.disposables.push(
      this.config.onDidChange((e) => {
        if (e.affectsConfiguration(SETTING_KEY)) {
          this.syncFromSettings();
        }
      }),
    );
    this.syncFromSettings();
  }

  private syncFromSettings(): void {
    const enabled = vscode.workspace.getConfiguration().get<boolean>(SETTING_KEY, false);
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  private start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    // Fire once shortly after activation too, so the first notification doesn't
    // wait a full hour. setTimeout avoids racing the initial scan / task load.
    this.initialTimer = setTimeout(() => {
      this.initialTimer = undefined;
      void this.check();
    }, 5_000);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = undefined;
    }
    // Don't clear `notified` — if the user re-enables in the same session we
    // don't want a stampede of repeats.
  }

  private async check(): Promise<void> {
    try {
      const today = isoDate(new Date());
      for (const folder of getFolders()) {
        const tasks = await this.taskStore.getTasks(folder);
        const due = tasksDueBy(tasks, today);
        for (const t of due) {
          const key = `${folder.uri.toString()}|${t.id}|${today}`;
          if (this.notified.has(key)) {
            continue;
          }
          this.notified.add(key);
          void this.notify(folder, t, today);
        }
      }
    } catch (err) {
      this.logger.error("DueNotifier check failed", err);
    }
  }

  private async notify(folder: vscode.WorkspaceFolder, task: ManualTask, today: string): Promise<void> {
    const overdue = task.dueDate && task.dueDate < today;
    const msg = overdue
      ? `Todo It: "${task.title}" was due ${task.dueDate}.`
      : `Todo It: "${task.title}" is due today.`;
    const action = await vscode.window.showInformationMessage(msg, "Open", "Snooze 1 day");
    if (action === "Open") {
      void vscode.commands.executeCommand("todoIt.view.focus");
    } else if (action === "Snooze 1 day") {
      const tomorrow = isoDate(addDays(new Date(), 1));
      await this.taskStore.updateTask(folder, task.id, { snoozedUntil: tomorrow });
    }
  }

  dispose(): void {
    this.stop();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
