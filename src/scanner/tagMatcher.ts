import { TagDefinition } from "../models/types";
import { MD_TASK_RG_PATTERN } from "./markdownTasks";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Rust's `\\b` is Unicode-aware; `(?-u:\\b)` is ASCII-only like JS.
const RG_BOUNDARY = "(?-u:\\b)";
const WORD_CHAR = /\w/;

/**
 * Builds `(alt1|alt2…)` (single capture group). Each alternative gets a `\b`
 * only on a side whose edge character is a word character, so tags like `@todo`
 * or `TODO!` still match. `boundary` lets ripgrep use an ASCII-only `\b` so it
 * agrees with the JS engine.
 */
function tagAlternation(tags: TagDefinition[], boundary = "\\b"): string | undefined {
  const names = tags.map((t) => t.tag).filter((t) => t.length > 0);
  if (names.length === 0) {
    return undefined;
  }
  const alts = [...names]
    .sort((a, b) => b.length - a.length)
    .map((t) => {
      const pre = WORD_CHAR.test(t[0]) ? boundary : "";
      const post = WORD_CHAR.test(t[t.length - 1]) ? boundary : "";
      return `${pre}${escapeRegExp(t)}${post}`;
    });
  return `(${alts.join("|")})`;
}

// Markers that are *only* line-comment starts (not code that can appear mid-line):
//   `*` (JSDoc continuation), `--` (SQL/Haskell), `;` (asm/lisp/ini), `%` (LaTeX/Erlang).
// We require these at line-start AND followed by whitespace so that markdown
// bold (`**…**`), decrement (`--var`), statement-end (`x;`) and modulo (`5 % 3`)
// don't masquerade as comments.
const LINE_START_ONLY = new Set(["*", "--", ";", "%"]);

function markerGroup(markers: string[]): string {
  const anchored: string[] = [];
  const anywhere: string[] = [];
  for (const m of markers) {
    if (!m) {
      continue;
    }
    (LINE_START_ONLY.has(m) ? anchored : anywhere).push(escapeRegExp(m));
  }
  const alts: string[] = [];
  if (anchored.length > 0) {
    alts.push(`^[\\t ]*(?:${anchored.join("|")})\\s`);
  }
  if (anywhere.length > 0) {
    alts.push(`(?:${anywhere.join("|")})`);
  }
  if (alts.length === 0) {
    return "\\b\\B"; // never matches
  }
  return `(?:${alts.join("|")})`;
}

/**
 * Regex source for ripgrep. Combines:
 *  - the configured comment-tag pattern (optionally requiring a comment marker), and
 *  - the markdown-task pattern (when `markdownTasksEnabled`).
 * `\b\B` never matches; word boundaries are ASCII-only (`(?-u:\b)`) to match the JS scanner.
 */
export function tagPatternSource(
  tags: TagDefinition[],
  commentsOnly: boolean,
  markers: string[],
  markdownTasksEnabled = false,
): string {
  const alternation = tagAlternation(tags, RG_BOUNDARY);
  const alternatives: string[] = [];
  if (alternation) {
    alternatives.push(commentsOnly ? `${markerGroup(markers)}.*?${alternation}` : alternation);
  }
  if (markdownTasksEnabled) {
    alternatives.push(MD_TASK_RG_PATTERN);
  }
  if (alternatives.length === 0) {
    return "\\b\\B";
  }
  return alternatives.length === 1 ? alternatives[0] : `(?:${alternatives.join("|")})`;
}

export interface LineMatch {
  tag: string;
  startCol: number;
  endCol: number;
  text: string;
}

/**
 * Finds configured tags on a line. In comments-only mode it locates the first
 * comment marker and only matches tags at or after it, so prose and code before
 * a comment are ignored (and multiple tags inside one comment are all found).
 */
export class TagMatcher {
  private readonly tagRegex: RegExp | undefined;
  private readonly markerRegex: RegExp | undefined;
  private readonly canonical = new Map<string, string>();

  constructor(
    tags: TagDefinition[],
    private readonly caseSensitive: boolean,
    private readonly commentsOnly: boolean,
    markers: string[],
  ) {
    const alternation = tagAlternation(tags);
    this.tagRegex = alternation ? new RegExp(alternation, caseSensitive ? "g" : "gi") : undefined;
    this.markerRegex = commentsOnly ? new RegExp(markerGroup(markers)) : undefined;
    for (const t of tags) {
      if (t.tag) {
        this.canonical.set(caseSensitive ? t.tag : t.tag.toUpperCase(), t.tag);
      }
    }
  }

  match(line: string): LineMatch[] {
    if (!this.tagRegex) {
      return [];
    }
    let from = 0;
    if (this.commentsOnly) {
      const marker = this.markerRegex?.exec(line);
      if (!marker) {
        return [];
      }
      from = marker.index;
    }

    const out: LineMatch[] = [];
    this.tagRegex.lastIndex = from;
    let m: RegExpExecArray | null;
    while ((m = this.tagRegex.exec(line)) !== null) {
      const matched = m[1];
      const startCol = m.index;
      const endCol = m.index + matched.length;
      const key = this.caseSensitive ? matched : matched.toUpperCase();
      const tag = this.canonical.get(key) ?? matched;
      const text = line
        .slice(endCol)
        .replace(/^[\s:)\]\-–—]+/, "")
        .trimEnd();
      out.push({ tag, startCol, endCol, text });
      if (this.tagRegex.lastIndex === m.index) {
        this.tagRegex.lastIndex++;
      }
    }
    return out;
  }
}
