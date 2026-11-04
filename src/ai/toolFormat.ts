// Pure filtering/formatting helpers for the Language Model tools. No `vscode`
// import so they're unit-testable and reusable from any host.
import { ManualTask, TagMatch, TaskPriority } from "../models/types";
import { tasksDueBy } from "../tasks/dueCheck";

export const MAX_TEXT = 200;
export const DEFAULT_TODO_LIMIT = 200;

export const TASK_STATUSES = ["open", "done", "all", "due"] as const;
export type TaskStatusFilter = (typeof TASK_STATUSES)[number];

export const MAX_TITLE_LEN = 500;
export const MAX_NOTE_LEN = 5000;

/** Escapes Markdown metacharacters and flattens newlines so model-supplied text renders literally. */
export function escapeMarkdown(s: string): string {
  return String(s)
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/[\\`*_{}[\]()<>#+!|~&-]/g, "\\$&");
}

export interface ListTodosInput {
  tag?: string;
  query?: string;
  limit?: number;
}

export interface ListTasksInput {
  status?: TaskStatusFilter;
  query?: string;
}

export interface AddTaskInput {
  title: string;
  priority?: TaskPriority;
  dueDate?: string;
  note?: string;
  parentId?: string;
  folder?: string;
}

export interface SetTaskDoneInput {
  taskId: string;
  done?: boolean;
}

export function truncate(s: string, max: number = MAX_TEXT): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high"];

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) {
    return false;
  }
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Validates model-supplied `addTask` input. Returns an error message, or `undefined` when valid. */
export function validateAddTask(input: AddTaskInput): string | undefined {
  if (typeof input.title !== "string" || input.title.trim() === "") {
    return "`title` is required and must be a non-empty string.";
  }
  if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) {
    return "`priority` must be one of: low, medium, high.";
  }
  if (input.dueDate !== undefined && !isIsoDate(input.dueDate)) {
    return "`dueDate` must be an ISO date (YYYY-MM-DD).";
  }
  if (input.title.length > MAX_TITLE_LEN) {
    return `\`title\` must be at most ${MAX_TITLE_LEN} characters.`;
  }
  for (const key of ["note", "parentId", "folder"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      return `\`${key}\` must be a string.`;
    }
  }
  if (input.note !== undefined && input.note.length > MAX_NOTE_LEN) {
    return `\`note\` must be at most ${MAX_NOTE_LEN} characters.`;
  }
  return undefined;
}

/** Filters scanned matches by tag (case-insensitive) and substring query over text + path. */
export function filterMatches(
  matches: readonly TagMatch[],
  input: ListTodosInput,
  pathOf: (m: TagMatch) => string,
): TagMatch[] {
  const tag = typeof input.tag === "string" ? input.tag.trim().toLowerCase() : undefined;
  const q = typeof input.query === "string" ? input.query.trim().toLowerCase() : undefined;
  return matches.filter((m) => {
    if (tag && m.tag.toLowerCase() !== tag) {
      return false;
    }
    if (q) {
      const hay = `${m.text} ${m.lineText} ${pathOf(m)}`.toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

export function clampLimit(limit: number | undefined, max: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return Math.min(DEFAULT_TODO_LIMIT, max);
  }
  return Math.min(Math.floor(limit), max);
}

export function renderMatches(
  matches: readonly TagMatch[],
  total: number,
  pathLineOf: (m: TagMatch) => string,
): string {
  if (total === 0) {
    return "No matching TODO comments found in the workspace.";
  }
  const header =
    matches.length < total
      ? `${total} matching TODO comments (showing the first ${matches.length}):`
      : `${total} matching TODO comment${total === 1 ? "" : "s"}:`;
  const lines = matches.map(
    (m) => `- [${m.tag}] ${pathLineOf(m)} — ${truncate(m.text || m.lineText.trim())}`,
  );
  return [header, ...lines].join("\n");
}

/** Filters manual tasks by status and substring query over title + note. */
export function filterTasks(
  tasks: readonly ManualTask[],
  input: ListTasksInput,
  todayIso: string,
): ManualTask[] {
  const status = input.status ?? "open";
  let out: ManualTask[];
  switch (status) {
    case "done":
      out = tasks.filter((t) => t.done);
      break;
    case "all":
      out = [...tasks];
      break;
    case "due":
      out = tasksDueBy(tasks, todayIso);
      break;
    default:
      out = tasks.filter((t) => !t.done);
  }
  const q = typeof input.query === "string" ? input.query.trim().toLowerCase() : undefined;
  if (q) {
    out = out.filter((t) =>
      `${t.title} ${typeof t.note === "string" ? t.note : ""}`.toLowerCase().includes(q),
    );
  }
  return out;
}

export function renderTask(t: ManualTask, todayIso: string): string {
  const bits: string[] = [`id: ${t.id}`];
  if (t.done) {
    bits.push("done");
  }
  if (t.priority) {
    bits.push(`priority: ${t.priority}`);
  }
  if (t.dueDate) {
    bits.push(!t.done && t.dueDate < todayIso ? `OVERDUE (due ${t.dueDate})` : `due ${t.dueDate}`);
  }
  if (t.snoozedUntil && t.snoozedUntil > todayIso) {
    bits.push(`snoozed until ${t.snoozedUntil}`);
  }
  if (t.parentId) {
    bits.push(`subtask of ${t.parentId}`);
  }
  const note =
    typeof t.note === "string" && t.note
      ? `\n  note: ${truncate(t.note.replace(/\s+/g, " "))}`
      : "";
  return `- ${t.title} (${bits.join(", ")})${note}`;
}

export function renderTaskGroups(
  groups: readonly { folder: string; tasks: readonly ManualTask[] }[],
  todayIso: string,
  multiRoot: boolean,
): string {
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  if (total === 0) {
    return "No matching tasks.";
  }
  const out: string[] = [`${total} matching task${total === 1 ? "" : "s"} (today is ${todayIso}):`];
  for (const g of groups) {
    if (g.tasks.length === 0) {
      continue;
    }
    if (multiRoot) {
      out.push(`\n## ${g.folder}`);
    }
    out.push(...g.tasks.map((t) => renderTask(t, todayIso)));
  }
  return out.join("\n");
}
