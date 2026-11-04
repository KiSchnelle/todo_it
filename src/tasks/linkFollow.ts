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
      let newUri = byOld.get(l.uri);
      if (!newUri) {
        // A renamed/moved directory is reported as one event: rewrite links beneath it.
        for (const r of renames) {
          const prefix = r.oldUri.endsWith("/") ? r.oldUri : `${r.oldUri}/`;
          if (l.uri.startsWith(prefix)) {
            newUri =
              (r.newUri.endsWith("/") ? r.newUri : `${r.newUri}/`) + l.uri.slice(prefix.length);
            break;
          }
        }
      }
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
