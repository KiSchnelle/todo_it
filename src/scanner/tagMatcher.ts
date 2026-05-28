import { TagDefinition } from "../models/types";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex source matching any configured tag as a whole word. `\b` is supported by
 * both JavaScript and ripgrep's Rust regex engine, so the same source works for
 * the rg child process and for in-process re-scanning. Falls back to a
 * never-matching pattern (also valid in both engines) when no tags are defined.
 */
export function tagPatternSource(tags: TagDefinition[]): string {
  const names = tags.map((t) => t.tag).filter((t) => t.length > 0);
  if (names.length === 0) {
    return "\\b\\B";
  }
  const escaped = [...names].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return `\\b(${escaped.join("|")})\\b`;
}

export interface LineMatch {
  tag: string;
  startCol: number;
  endCol: number;
  text: string;
}

/** Finds configured tags within a single line and the todo text that follows each. */
export class TagMatcher {
  private readonly regex: RegExp;
  private readonly canonical: Map<string, string>;

  constructor(
    tags: TagDefinition[],
    private readonly caseSensitive: boolean,
  ) {
    this.regex = new RegExp(tagPatternSource(tags), caseSensitive ? "g" : "gi");
    this.canonical = new Map();
    for (const t of tags) {
      if (t.tag) {
        this.canonical.set(caseSensitive ? t.tag : t.tag.toUpperCase(), t.tag);
      }
    }
  }

  match(line: string): LineMatch[] {
    const out: LineMatch[] = [];
    this.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = this.regex.exec(line)) !== null) {
      const matched = m[1] ?? m[0];
      const startCol = m.index;
      const endCol = m.index + matched.length;
      const key = this.caseSensitive ? matched : matched.toUpperCase();
      const tag = this.canonical.get(key) ?? matched;
      const text = line.slice(endCol).replace(/^[\s:)\]\-–—]+/, "").trimEnd();
      out.push({ tag, startCol, endCol, text });
      if (this.regex.lastIndex === m.index) {
        this.regex.lastIndex++;
      }
    }
    return out;
  }
}
