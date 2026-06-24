import { ManualTask, TaskLink } from "../models/types";

export interface RenameOp {
  oldUri: string;
  newUri: string;
}

/**
 * For each task whose `links` contain any uri matched by a `RenameOp`, produces
 * the fully rewritten `links` array (only the affected URIs change; others pass
 * through). Returns one entry per task that needs to be updated — empty when
 * nothing changed. Pure; no `vscode` deps.
 */
export function planLinkRenames(
  tasks: readonly ManualTask[],
  renames: readonly RenameOp[],
): Array<{ taskId: string; newLinks: TaskLink[] }> {
  if (renames.length === 0) {
    return [];
  }
  const byOld = new Map(renames.map((r) => [r.oldUri, r.newUri]));
  const updates: Array<{ taskId: string; newLinks: TaskLink[] }> = [];
  for (const t of tasks) {
    const links = t.links;
    if (!links || links.length === 0) {
      continue;
    }
    let changed = false;
    const newLinks = links.map((l) => {
      const newUri = byOld.get(l.uri);
      if (newUri) {
        changed = true;
        return { ...l, uri: newUri };
      }
      return l;
    });
    if (changed) {
      updates.push({ taskId: t.id, newLinks });
    }
  }
  return updates;
}
