import { ManualTask, TagMatch, TaskLink } from "../models/types";

/**
 * Finds an existing manual task already linked to the same scanned position
 * (any `links[]` entry with the same uri + line). Used to dedupe "Track as Task"
 * clicks so repeated taps — from the CodeLens, the right-click menu, or both —
 * open the existing task instead of stacking duplicates.
 */
export function findExistingLinkedTask(
  tasks: readonly ManualTask[],
  match: TagMatch,
): ManualTask | undefined {
  return tasks.find(
    (t) => t.links?.some((l) => l.uri === match.uri && l.line === match.line),
  );
}

/** True when `candidate` exactly matches an entry already in `existing` (uri + line). */
export function hasExactLink(
  existing: readonly TaskLink[],
  candidate: { uri: string; line: number },
): boolean {
  return existing.some((l) => l.uri === candidate.uri && l.line === candidate.line);
}
