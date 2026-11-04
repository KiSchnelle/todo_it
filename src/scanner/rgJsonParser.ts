export interface RgMatch {
  /** Path as reported by ripgrep (may be relative to the search cwd). */
  path: string;
  /** 1-based line number, as ripgrep reports it. */
  lineNumber: number;
  /** Matched line text with any trailing EOL removed. */
  lineText: string;
}

interface RgJsonEvent {
  type?: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string; bytes?: string };
    line_number?: number;
  };
}

function stripEol(text: string): string {
  return text.replace(/\r?\n$/, "");
}

/**
 * ripgrep emits `lines.bytes` (base64) instead of `lines.text` when a line is not valid UTF-8.
 * Decode it leniently (replacement chars) like the JS scanner does, instead of dropping the match.
 */
function decodeLines(lines: { text?: string; bytes?: string } | undefined): string | undefined {
  if (!lines) {
    return undefined;
  }
  if (typeof lines.text === "string") {
    return lines.text;
  }
  if (typeof lines.bytes === "string") {
    return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.from(lines.bytes, "base64"));
  }
  return undefined;
}

/** Parses a single ripgrep `--json` NDJSON line, returning a match event or `undefined`. */
export function parseRgMatch(jsonLine: string): RgMatch | undefined {
  const trimmed = jsonLine.trim();
  if (!trimmed) {
    return undefined;
  }
  let event: RgJsonEvent;
  try {
    event = JSON.parse(trimmed) as RgJsonEvent;
  } catch {
    return undefined;
  }
  if (event.type !== "match" || !event.data) {
    return undefined;
  }
  const path = event.data.path?.text;
  const lineText = decodeLines(event.data.lines);
  const lineNumber = event.data.line_number;
  if (typeof path !== "string" || typeof lineText !== "string" || typeof lineNumber !== "number") {
    return undefined;
  }
  return { path, lineNumber, lineText: stripEol(lineText) };
}

/** Buffers ripgrep stdout (NDJSON can split across chunks) and emits match events. */
export class RgJsonStream {
  private buffer = "";

  constructor(private readonly onMatch: (match: RgMatch) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      const match = parseRgMatch(line);
      if (match) {
        this.onMatch(match);
      }
    }
  }

  flush(): void {
    if (this.buffer) {
      const match = parseRgMatch(this.buffer);
      if (match) {
        this.onMatch(match);
      }
      this.buffer = "";
    }
  }
}
