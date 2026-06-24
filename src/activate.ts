import * as vscode from "vscode";
import { registerChatParticipant } from "./ai/chatParticipant";
import { TodoCodeLensProvider } from "./codelens/todoCodeLensProvider";
import { registerCommands } from "./commands";
import { Configuration } from "./config/configuration";
import { DecorationManager } from "./decorations/decorationManager";
import { ScanController } from "./scanner/scanController";
import { Scanner } from "./scanner/scanner";
import { ScanStore } from "./scanner/scanStore";
import { StatusBar } from "./statusBar/statusBar";
import { FileWatcher } from "./watcher/fileWatcher";
import { DueNotifier } from "./tasks/dueNotifier";
import { planLinkRenames } from "./tasks/linkFollow";
import { createTaskStorage } from "./tasks/taskStorage";
import { TaskStore } from "./tasks/taskStore";
import { getFolders } from "./workspace/folders";
import { registerCheckboxHandler } from "./tree/checkbox";
import { TaskDnDController } from "./tree/dnd";
import { TodoTreeProvider } from "./tree/treeProvider";
import { Logger } from "./util/logger";

/** Common composition used by both the Node and web extension entry points. */
export function activateCommon(
  context: vscode.ExtensionContext,
  createScanner: (logger: Logger) => Scanner,
): void {
  const logger = new Logger();
  const config = new Configuration(context);

  const taskStore = new TaskStore(createTaskStorage(config.tasksStorage, context, logger), logger);
  const scanStore = new ScanStore();
  const scanner = createScanner(logger);
  const scanController = new ScanController(scanner, scanStore, config, logger);

  const treeProvider = new TodoTreeProvider(taskStore, scanStore, config);
  const decorationManager = new DecorationManager(scanStore, config);
  const fileWatcher = new FileWatcher(scanController, scanStore, config);
  const statusBar = new StatusBar(scanStore, taskStore, config);
  const codeLensProvider = new TodoCodeLensProvider(scanStore, config);
  const dueNotifier = new DueNotifier(taskStore, config, logger);

  const treeView = vscode.window.createTreeView("todoIt.view", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    canSelectMany: true, // enables multi-select for bulk task operations
    dragAndDropController: new TaskDnDController(taskStore),
  });

  const syncGroupingContext = (): void => {
    void vscode.commands.executeCommand("setContext", "todoIt.grouping", config.all.grouping);
  };
  const updateMessage = (): void => {
    treeView.message = treeProvider.getMessage();
  };
  syncGroupingContext();
  // Filter starts cleared; this also clears any stale context from a previous session.
  void vscode.commands.executeCommand("setContext", "todoIt.hasFilter", false);

  registerCommands(context, { taskStore, scanController, scanStore, config, treeProvider });

  context.subscriptions.push(
    logger,
    taskStore,
    treeView,
    scanController,
    decorationManager,
    fileWatcher,
    statusBar,
    codeLensProvider,
    dueNotifier,
    registerChatParticipant(scanStore, taskStore, config),
    registerCheckboxHandler(treeView, taskStore, treeProvider),
    taskStore.onDidChange(() => treeProvider.refresh()),
    scanStore.onDidChange(() => {
      treeProvider.refresh();
      updateMessage();
    }),
    // Keep the tree's message in sync with the filter state too.
    treeProvider.onDidChangeTreeData(() => updateMessage()),
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
    // Follow file renames/moves into task links — so a "Track as Task" link
    // doesn't go stale just because the user renamed the file in the explorer
    // or via a refactor. (Terminal `mv` / git operations don't fire this.)
    vscode.workspace.onDidRenameFiles(async (event) => {
      const renames = event.files.map((f) => ({
        oldUri: f.oldUri.toString(),
        newUri: f.newUri.toString(),
      }));
      for (const folder of getFolders()) {
        const tasks = await taskStore.getTasks(folder);
        for (const { taskId, newLinks } of planLinkRenames(tasks, renames)) {
          await taskStore.updateTask(folder, taskId, { links: newLinks });
        }
      }
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
        e.affectsConfiguration("todoIt.commentsOnly") ||
        e.affectsConfiguration("todoIt.commentMarkers") ||
        e.affectsConfiguration("todoIt.markdownTasks.enabled") ||
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
