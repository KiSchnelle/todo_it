import { TagDefinition } from "../models/types";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagAlternation(tags: TagDefinition[]): string | undefined {
  const names = tags.map((t) => t.tag).filter((t) => t.length > 0);
  if (names.length === 0) {
    return undefined;
  }
  const escaped = [...names].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return `\\b(${escaped.join("|")})\\b`;
}

function markerGroup(markers: string[]): string {
  return `(?:${markers.map(escapeRegExp).join("|")})`;
}

/**
 * Regex source for ripgrep. When `commentsOnly` is set, a tag only counts if a
 * comment marker appears before it on the line. `\b` works in both JS and Rust
 * regex; the fallback `\b\B` never matches (also valid in both engines).
 */
export function tagPatternSource(
  tags: TagDefinition[],
  commentsOnly: boolean,
  markers: string[],
): string {
  const alternation = tagAlternation(tags);
  if (!alternation) {
    return "\\b\\B";
  }
  return commentsOnly ? `${markerGroup(markers)}.*?${alternation}` : alternation;
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
      const text = line.slice(endCol).replace(/^[\s:)\]\-–—]+/, "").trimEnd();
      out.push({ tag, startCol, endCol, text });
      if (this.tagRegex.lastIndex === m.index) {
        this.tagRegex.lastIndex++;
      }
    }
    return out;
  }
}
