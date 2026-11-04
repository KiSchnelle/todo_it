import { ManualTask } from "../models/types";

/**
 * Collect all descendants (children, grandchildren, …) of `parentId`. Excludes
 * the parent itself. Cycle-safe: a hand-edited or merged file with a parentId
 * loop (or a self-parent) terminates instead of looping forever.
 */
export function collectDescendants(tasks: readonly ManualTask[], parentId: string): ManualTask[] {
  const byParent = new Map<string, ManualTask[]>();
  for (const t of tasks) {
    const key = t.parentId ?? "";
    const list = byParent.get(key);
    if (list) {
      list.push(t);
    } else {
      byParent.set(key, [t]);
    }
  }
  const out: ManualTask[] = [];
  const seen = new Set<string>([parentId]);
  const queue: string[] = [parentId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of byParent.get(id) ?? []) {
      if (seen.has(child.id)) {
        continue;
      }
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}
