// Markdown checkbox lines treated as a third "scanned" source:
//   - [ ] task
//   * [ ] task
//   1. [ ] task
// Only unchecked boxes are surfaced — checked boxes are already "done".
const MD_TASK = /^[\t ]*(?:[-*+]|\d+\.)\s+\[ \]\s+(\S.*)$/;
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
  // The capture is greedy (a lazy `.*?` + `\s*$` is quadratic on long space runs),
  // so trim trailing whitespace here. It starts at the end of the match minus its length.
  const text = m[1].trimEnd();
  const startCol = m.index + m[0].length - m[1].length;
  const endCol = startCol + text.length;
  return { text, startCol, endCol };
}
