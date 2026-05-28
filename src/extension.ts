import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { Configuration } from "./config/configuration";
import { DecorationManager } from "./decorations/decorationManager";
import { RipgrepScanner } from "./scanner/ripgrepScanner";
import { ScanController } from "./scanner/scanController";
import { ScanStore } from "./scanner/scanStore";
import { FileWatcher } from "./watcher/fileWatcher";
import { createTaskStorage } from "./tasks/taskStorage";
import { TaskStore } from "./tasks/taskStore";
import { registerCheckboxHandler } from "./tree/checkbox";
import { TodoTreeProvider } from "./tree/treeProvider";
import { Logger } from "./util/logger";

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  const config = new Configuration(context);

  const taskStore = new TaskStore(createTaskStorage(config.tasksStorage, context, logger), logger);
  const scanStore = new ScanStore();
  const scanner = new RipgrepScanner(logger);
  const scanController = new ScanController(scanner, scanStore, config, logger);

  const treeProvider = new TodoTreeProvider(taskStore, scanStore, config);
  const decorationManager = new DecorationManager(scanStore, config);
  const fileWatcher = new FileWatcher(scanController, scanStore, config);

  const treeView = vscode.window.createTreeView("todoIt.view", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const syncGroupingContext = (): void => {
    void vscode.commands.executeCommand("setContext", "todoIt.grouping", config.all.grouping);
  };
  const updateMessage = (): void => {
    treeView.message = scanStore.truncated
      ? `Result limit (${config.all.maxResults}) reached. Refine todoIt.exclude or raise todoIt.maxResults.`
      : undefined;
  };
  syncGroupingContext();

  registerCommands(context, { taskStore, scanController, config });

  context.subscriptions.push(
    logger,
    taskStore,
    treeView,
    scanController,
    decorationManager,
    fileWatcher,
    registerCheckboxHandler(treeView, taskStore),
    taskStore.onDidChange(() => treeProvider.refresh()),
    scanStore.onDidChange(() => {
      treeProvider.refresh();
      updateMessage();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      fileWatcher.syncFolders();
      for (const removed of e.removed) {
        scanStore.removeFolder(removed.uri.toString());
      }
      for (const added of e.added) {
        void scanController.scanFolder(added);
      }
      treeProvider.refresh();
    }),
    config.onDidChange((e) => {
      if (e.affectsConfiguration("todoIt.tasks.storage")) {
        taskStore.setStorage(createTaskStorage(config.tasksStorage, context, logger));
      }
      if (
        e.affectsConfiguration("todoIt.tags") ||
        e.affectsConfiguration("todoIt.include") ||
        e.affectsConfiguration("todoIt.exclude") ||
        e.affectsConfiguration("todoIt.caseSensitive") ||
        e.affectsConfiguration("todoIt.respectGitignore") ||
        e.affectsConfiguration("todoIt.maxResults")
      ) {
        void scanController.scanAll();
      }
      if (e.affectsConfiguration("todoIt.scan.grouping")) {
        syncGroupingContext();
        treeProvider.refresh();
      }
      if (e.affectsConfiguration("todoIt.tasks.sortBy")) {
        treeProvider.refresh();
      }
    }),
  );

  // Initial scan once startup has settled.
  void scanController.scanAll();
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions.
}
