import { ManualTask, TaskPriority } from "../models/types";

const PRIORITY_ORDER: TaskPriority[] = ["high", "medium", "low"];
const PRIORITY_LABEL: Record<TaskPriority | "none", string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
  none: "No priority",
};

interface ExportOptions {
  /** Header line, e.g. "# Tasks — exported 2026-06-24". Pass the date in from the caller. */
  heading: string;
  /** Optional sub-heading shown right under the heading (folder name, project, …). */
  subheading?: string;
  /** Resolves a link's `uri` field to a display path. Lets the caller decide
   *  workspace-relative vs absolute. */
  pathRenderer?: (uri: string) => string;
}

/**
 * Renders tasks as Markdown. Open tasks group by priority; done tasks go last
 * in a single "Done" section. Subtasks render as indented children under their
 * parent. Empty input produces just the heading + an "_(no tasks)_" line.
 */
export function renderTasksAsMarkdown(
  tasks: readonly ManualTask[],
  opts: ExportOptions,
): string {
  const out: string[] = [opts.heading, ""];
  if (opts.subheading) {
    out.push(opts.subheading, "");
  }
  if (tasks.length === 0) {
    out.push("_(no tasks)_", "");
    return out.join("\n");
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const byParent = groupByParent(tasks);
  const renderPath = opts.pathRenderer ?? ((uri: string) => uri);

  // Group open tasks by priority.
  const buckets = new Map<TaskPriority | "none", ManualTask[]>();
  for (const t of open) {
    const key = t.priority ?? "none";
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }
  for (const key of [...PRIORITY_ORDER, "none" as const]) {
    const list = buckets.get(key) ?? [];
    // Only render top-level open tasks here; subtasks render under their parents.
    const topLevel = list.filter((t) => !t.parentId);
    if (topLevel.length === 0) {
      continue;
    }
    out.push(`## ${PRIORITY_LABEL[key]}`, "");
    for (const t of topLevel) {
      out.push(...renderTaskLines(t, byParent, renderPath, 0));
    }
    out.push("");
  }

  if (done.length > 0) {
    out.push("## Done", "");
    for (const t of done.filter((t) => !t.parentId)) {
      out.push(...renderTaskLines(t, byParent, renderPath, 0));
    }
    out.push("");
  }

  return out.join("\n");
}

function groupByParent(tasks: readonly ManualTask[]): Map<string, ManualTask[]> {
  const map = new Map<string, ManualTask[]>();
  for (const t of tasks) {
    const key = t.parentId ?? "";
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return map;
}

function renderTaskLines(
  task: ManualTask,
  byParent: Map<string, ManualTask[]>,
  renderPath: (uri: string) => string,
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const box = task.done ? "[x]" : "[ ]";
  const meta: string[] = [];
  if (task.priority && depth > 0) {
    // Show priority on subtasks (top-level tasks are already grouped by it).
    meta.push(task.priority);
  }
  if (task.dueDate) {
    meta.push(`due ${task.dueDate}`);
  }
  const head = `${indent}- ${box} ${task.title}${meta.length > 0 ? ` _(${meta.join(", ")})_` : ""}`;
  const lines: string[] = [head];
  if (task.note?.trim()) {
    for (const line of task.note.split(/\r?\n/)) {
      lines.push(`${indent}  ${line}`);
    }
  }
  for (const link of task.links ?? []) {
    lines.push(`${indent}  - 🔗 ${renderPath(link.uri)}:${link.line + 1}`);
  }
  for (const child of byParent.get(task.id) ?? []) {
    lines.push(...renderTaskLines(child, byParent, renderPath, depth + 1));
  }
  return lines;
}
