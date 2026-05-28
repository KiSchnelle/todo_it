// Shared data models for Todo It. No runtime logic lives here.

// ---------- Configuration ----------

export interface TagDefinition {
  tag: string;
  color?: string;
  backgroundColor?: string;
  iconPath?: string;
  rulerColor?: string;
}

export type GroupingMode = "tag" | "file" | "flat";
export type TasksStorageMode = "file" | "gitignoredFile" | "workspaceState";
export type TaskSortMode = "manual" | "priority" | "dueDate";

export interface TodoItConfig {
  tags: TagDefinition[];
  caseSensitive: boolean;
  commentsOnly: boolean;
  commentMarkers: string[];
  includeGlobs: string[];
  excludeGlobs: string[];
  respectGitignore: boolean;
  maxResults: number;
  debounceMs: number;
  grouping: GroupingMode;
  decorationsEnabled: boolean;
  tasksStorage: TasksStorageMode;
  taskSort: TaskSortMode;
}

// ---------- Scanned comment-tag results ----------

export interface TagMatch {
  /** Stable identity: `${uri}|${line}|${startCol}|${tag}`. */
  matchId: string;
  uri: string;
  folderUri: string;
  tag: string;
  /** 0-based, for vscode.Position. */
  line: number;
  startCol: number;
  endCol: number;
  lineText: string;
  /** The todo content after the tag. */
  text: string;
}

export interface ScannedFileResult {
  uri: string;
  folderUri: string;
  matches: TagMatch[];
  scannedAt: number;
}

// ---------- Manual tasks ----------

export type TaskPriority = "low" | "medium" | "high";

export interface ManualTask {
  id: string;
  title: string;
  done: boolean;
  priority?: TaskPriority;
  dueDate?: string; // ISO date YYYY-MM-DD
  note?: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface TaskFile {
  schemaVersion: 1;
  tasks: ManualTask[];
}

// ---------- Tree nodes ----------

export type TreeNode =
  | { kind: "section"; id: "tasks" | "scanned"; label: string }
  | { kind: "taskFolder"; folderUri: string; label: string }
  | { kind: "task"; task: ManualTask; folderUri: string }
  | { kind: "scanFolder"; folderUri: string; label: string }
  | { kind: "tagGroup"; tag: string; folderUri?: string; count?: number }
  | { kind: "fileGroup"; uri: string; folderUri: string; count?: number }
  | { kind: "match"; match: TagMatch };
