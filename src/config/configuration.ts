import * as vscode from "vscode";
import {
  GroupingMode,
  TagDefinition,
  TaskSortMode,
  TasksStorageMode,
  TodoItConfig,
} from "../models/types";
import {
  DEFAULT_COMMENT_MARKERS,
  DEFAULT_EXCLUDES,
  DEFAULT_INCLUDES,
  DEFAULT_TAGS,
} from "./defaults";

const SECTION = "todoIt";

/** Typed accessor over the `todoIt.*` settings, with a change event. */
export class Configuration {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
  readonly onDidChange = this._onDidChange.event;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(SECTION)) {
          this._onDidChange.fire(e);
        }
      }),
      this._onDidChange,
    );
  }

  private get cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
  }

  get all(): TodoItConfig {
    const cfg = this.cfg;
    const tags = cfg.get<TagDefinition[]>("tags", DEFAULT_TAGS);
    return {
      tags: tags.length > 0 ? tags : DEFAULT_TAGS,
      caseSensitive: cfg.get<boolean>("caseSensitive", true),
      commentsOnly: cfg.get<boolean>("commentsOnly", true),
      commentMarkers: cfg.get<string[]>("commentMarkers", DEFAULT_COMMENT_MARKERS),
      includeGlobs: cfg.get<string[]>("include", DEFAULT_INCLUDES),
      excludeGlobs: cfg.get<string[]>("exclude", DEFAULT_EXCLUDES),
      respectGitignore: cfg.get<boolean>("respectGitignore", true),
      maxResults: cfg.get<number>("maxResults", 5000),
      debounceMs: cfg.get<number>("debounceMs", 400),
      grouping: cfg.get<GroupingMode>("scan.grouping", "tag"),
      decorationsEnabled: cfg.get<boolean>("decorations.enabled", true),
      tasksStorage: cfg.get<TasksStorageMode>("tasks.storage", "file"),
      taskSort: cfg.get<TaskSortMode>("tasks.sortBy", "manual"),
      statusBarEnabled: cfg.get<boolean>("statusBar.enabled", true),
      markdownTasksEnabled: cfg.get<boolean>("markdownTasks.enabled", true),
      aiMaxFindings: cfg.get<number>("ai.maxFindings", 400),
      aiContextLines: cfg.get<number>("ai.contextLines", 6),
    };
  }

  get tasksStorage(): TasksStorageMode {
    return this.cfg.get<TasksStorageMode>("tasks.storage", "file");
  }

  async setGrouping(mode: GroupingMode): Promise<void> {
    await this.cfg.update("scan.grouping", mode, vscode.ConfigurationTarget.Global);
  }

  async setTaskSort(mode: TaskSortMode): Promise<void> {
    await this.cfg.update("tasks.sortBy", mode, vscode.ConfigurationTarget.Global);
  }
}
