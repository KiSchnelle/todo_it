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
  statusBarEnabled: boolean;
  markdownTasksEnabled: boolean;
  /** Maximum scanned todos sent to `AI: Summarize Found in Code`. */
  aiMaxFindings: number;
  /** ±N lines of surrounding source for AI prompts that need code context. */
  aiContextLines: number;
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

/** A single source pointer attached to a manual task. */
export interface TaskLink {
  uri: string;
  line: number;
  column?: number;
  /** Scanned-tag name when this link came from "Track as Task". */
  tag?: string;
  /** Snapshot of the source line at scan time — purely for tooltip context. */
  preview?: string;
  /** Optional human-supplied label; falls back to the file path. */
  label?: string;
}

export interface ManualTask {
  id: string;
  title: string;
  done: boolean;
  priority?: TaskPriority;
  dueDate?: string; // ISO date YYYY-MM-DD
  note?: string;
  /** All linked source files for this task. Legacy `link` is migrated to `links[0]` at load time. */
  links?: TaskLink[];
  /** Parent task id; tasks without a parent are top-level. */
  parentId?: string;
  /** ISO date YYYY-MM-DD. Suppresses due-soon notifications until this date. */
  snoozedUntil?: string;
  createdAt: number;
  updatedAt: number;
  /** Order within the parent's sibling list. */
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
  | { kind: "task"; task: ManualTask; folderUri: string; hasChildren?: boolean }
  | { kind: "quickAdd"; folderUri: string }
  | { kind: "scanFolder"; folderUri: string; label: string }
  | { kind: "tagGroup"; tag: string; folderUri?: string; count?: number }
  | { kind: "fileGroup"; uri: string; folderUri: string; count?: number }
  | { kind: "match"; match: TagMatch }
  | { kind: "emptyHint"; id: string; label: string; tooltip?: string };
