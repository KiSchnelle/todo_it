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
    lines?: { text?: string };
    line_number?: number;
  };
}

function stripEol(text: string): string {
  return text.replace(/\r?\n$/, "");
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
  const lineText = event.data.lines?.text;
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
