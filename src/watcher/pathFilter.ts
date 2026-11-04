import { Minimatch } from "minimatch";

/**
 * Pure path filtering for watcher-driven rescans, mirroring what a full ripgrep scan does with
 * `--glob`: excludes are gitignore-like (a pattern without `/` matches a basename at any depth,
 * and a matched directory excludes everything beneath it), includes are a whitelist for files.
 */
export interface PathFilter {
  /** True when the workspace-relative path (or any parent directory of it) is excluded. */
  isExcluded(rel: string): boolean;
  /** True when a file path passes the include globs (always true for the default `**\/*`). */
  isIncluded(rel: string): boolean;
}

const OPTS = { dot: true, matchBase: true } as const;

function normalize(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function stripNegation(glob: string): string {
  return glob.startsWith("!") ? glob.slice(1) : glob;
}

export function createPathFilter(
  includeGlobs: readonly string[],
  excludeGlobs: readonly string[],
): PathFilter {
  const excludeSrc = excludeGlobs.map(stripNegation).filter((g) => g.length > 0);
  const includeSrc = includeGlobs.map(stripNegation).filter((g) => g.length > 0);
  const includeAll = includeSrc.length === 0 || includeSrc.includes("**/*");
  // Compile once per filter (the filter itself is rebuilt on config change), not per event.
  const excludes = excludeSrc.map((g) => new Minimatch(g, OPTS));
  const includes = includeSrc.map((g) => new Minimatch(g, OPTS));

  return {
    isExcluded(relInput: string): boolean {
      const rel = normalize(relInput);
      const parts = rel.split("/");
      const candidates: string[] = [];
      for (let i = 1; i <= parts.length; i++) {
        candidates.push(parts.slice(0, i).join("/"));
      }
      return excludes.some((m) => candidates.some((c) => m.match(c)));
    },
    isIncluded(relInput: string): boolean {
      if (includeAll) {
        return true;
      }
      const rel = normalize(relInput);
      return includes.some((m) => m.match(rel));
    },
  };
}
