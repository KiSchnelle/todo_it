import { ManualTask, TaskSortMode } from "../models/types";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function priorityRank(priority: string | undefined): number {
  return priority !== undefined ? (PRIORITY_RANK[priority] ?? 3) : 3;
}

/**
 * Sort tasks for display. Completed tasks always sink to the bottom; within each
 * group the chosen mode applies, falling back to manual order as a tiebreaker.
 * Undated tasks and tasks without a priority sort last in their respective modes.
 */
export function sortTasks(tasks: ManualTask[], mode: TaskSortMode): ManualTask[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) {
      return a.done ? 1 : -1;
    }
    if (mode === "priority") {
      const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
      if (byPriority !== 0) {
        return byPriority;
      }
    } else if (mode === "dueDate") {
      const da = a.dueDate ?? "9999-99-99";
      const db = b.dueDate ?? "9999-99-99";
      if (da !== db) {
        return da < db ? -1 : 1;
      }
    }
    return a.order - b.order;
  });
}
