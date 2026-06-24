import { ManualTask } from "../models/types";

/** Lowercase substring match against title or note. */
export function taskMatchesFilter(task: ManualTask, lowerFilter: string): boolean {
  return (
    task.title.toLowerCase().includes(lowerFilter) ||
    (task.note?.toLowerCase().includes(lowerFilter) ?? false)
  );
}

/**
 * Expands a direct-match set to also include the ancestors of every match, so
 * a hit deep in a subtask chain stays reachable through its parents. Tasks
 * whose `parentId` is unknown (orphans) anchor the chain — they get included
 * but the walk stops there.
 */
export function expandToAncestors(
  tasks: readonly ManualTask[],
  directlyMatching: readonly string[],
): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visible = new Set(directlyMatching);
  for (const id of directlyMatching) {
    let task = byId.get(id);
    while (task?.parentId) {
      if (visible.has(task.parentId)) {
        break;
      }
      const parent = byId.get(task.parentId);
      if (!parent) {
        break;
      }
      visible.add(parent.id);
      task = parent;
    }
  }
  return visible;
}
