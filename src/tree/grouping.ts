import { GroupingMode, TagMatch, TreeNode } from "../models/types";

export function sortMatches(matches: TagMatch[]): TagMatch[] {
  return [...matches].sort(
    (a, b) => a.uri.localeCompare(b.uri) || a.line - b.line || a.startCol - b.startCol,
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) {
      arr.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}

export function matchNodes(matches: TagMatch[]): TreeNode[] {
  return sortMatches(matches).map((match) => ({ kind: "match", match }));
}

/** Build the child nodes for a set of scanned matches according to the grouping mode. */
export function groupScanned(matches: TagMatch[], grouping: GroupingMode): TreeNode[] {
  if (matches.length === 0) {
    return [];
  }
  if (grouping === "flat") {
    return matchNodes(matches);
  }
  if (grouping === "file") {
    const byFile = groupBy(matches, (m) => m.uri);
    return [...byFile.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([uri, items]) => ({
        kind: "fileGroup",
        uri,
        folderUri: items[0].folderUri,
        count: items.length,
      }));
  }
  const folderUri = matches[0].folderUri;
  const byTag = groupBy(matches, (m) => m.tag);
  return [...byTag.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, items]) => ({ kind: "tagGroup", tag, folderUri, count: items.length }));
}
