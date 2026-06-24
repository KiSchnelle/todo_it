// Markdown checkbox lines treated as a third "scanned" source:
//   - [ ] task
//   * [ ] task
//   1. [ ] task
// Only unchecked boxes are surfaced — checked boxes are already "done".
const MD_TASK = /^[\t ]*(?:[-*+]|\d+\.)\s+\[ \]\s+(\S.*?)\s*$/;
/** Matches the "[ ]" position on a markdown task line (capture 1 = the prefix before it). */
export const MD_TASK_CHECKBOX = /^([\t ]*(?:[-*+]|\d+\.)\s+)\[ \]/;

export const MD_TASK_TAG = "MD-TASK";

/** Pattern shared with the ripgrep `-e` alternation; intentionally lighter than the JS regex. */
export const MD_TASK_RG_PATTERN = "^[\\t ]*(?:[-*+]|\\d+\\.)\\s+\\[ \\]\\s+\\S";

const MD_EXTENSIONS = [".md", ".markdown", ".mdx"];

export function isMarkdownUri(uri: string): boolean {
  const lower = uri.toLowerCase();
  return MD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface MarkdownTaskMatch {
  text: string;
  startCol: number;
  endCol: number;
}

/** Returns the task text (without the checkbox prefix) and its column span, or `null`. */
export function matchMarkdownTask(line: string): MarkdownTaskMatch | null {
  const m = MD_TASK.exec(line);
  if (!m) {
    return null;
  }
  const text = m[1];
  // `m[1]` is captured after `\[ \]\s+`, so its start in the original line is
  // (full match length minus captured length minus any trailing whitespace
  // we already trimmed). Use indexOf as a robust fallback within the match.
  const startCol = m.index + m[0].lastIndexOf(text);
  const endCol = startCol + text.length;
  return { text, startCol, endCol };
}
