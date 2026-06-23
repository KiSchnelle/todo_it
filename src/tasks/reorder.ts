import { ManualTask } from "../models/types";

/**
 * Insert position relative to the current (manual-order) list:
 * - `"TOP"` → before everything.
 * - `"END"` → after everything.
 * - a task id → insert before that task.
 */
export type ReorderTarget = "TOP" | "END" | string;

/**
 * Mutates each task's `order` field so the dragged tasks land at `target` in
 * the manual-order list. Pure with respect to anything outside `tasks`.
 */
export function applyReorder(
  tasks: ManualTask[],
  draggedIds: string[],
  target: ReorderTarget,
): void {
  if (draggedIds.length === 0) {
    return;
  }
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const moving = new Set(draggedIds);
  const without = ordered.filter((t) => !moving.has(t.id));
  const dragged = ordered.filter((t) => moving.has(t.id));
  let at: number;
  if (target === "TOP") {
    at = 0;
  } else if (target === "END") {
    at = without.length;
  } else {
    const i = without.findIndex((t) => t.id === target);
    at = i >= 0 ? i : without.length;
  }
  without.splice(at, 0, ...dragged);
  without.forEach((t, i) => {
    t.order = i + 1;
  });
}
