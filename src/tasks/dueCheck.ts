import { ManualTask } from "../models/types";

/** YYYY-MM-DD for any Date. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns a new Date `n` days after `d`. */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Returns tasks that should trigger a due-soon notification: not done, due today
 * or earlier, and not snoozed past today. Pure; takes the date as input so callers
 * can decide whether to use the user's local clock.
 */
export function tasksDueBy(tasks: readonly ManualTask[], todayIso: string): ManualTask[] {
  return tasks.filter((t) => {
    if (t.done || !t.dueDate) {
      return false;
    }
    if (t.snoozedUntil && t.snoozedUntil > todayIso) {
      return false;
    }
    return t.dueDate <= todayIso;
  });
}
