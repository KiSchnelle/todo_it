import * as vscode from "vscode";
import { ScannedFileResult, TagMatch, TodoItConfig } from "../models/types";
import { Logger } from "../util/logger";
import { isMarkdownUri, matchMarkdownTask, MD_TASK_TAG } from "./markdownTasks";
import { ScanResult, Scanner } from "./scanner";
import { TagMatcher } from "./tagMatcher";

const READ_CONCURRENCY = 16;
const MAX_FILE_BYTES = 1_000_000; // skip > 1 MB files (likely binary or huge data)
const ALWAYS_EXCLUDE = ["**/.vscode/todos.json", "**/.vscode/todos.local.json"];

/**
 * Pure-VS Code-API scanner used by the web extension host (where `child_process`
 * and the bundled ripgrep binary are unavailable). Slower than `RipgrepScanner`
 * but works on virtual filesystems too. `.gitignore` is NOT honored here — only
 * the configured exclude globs apply.
 */
export class JsScanner implements Scanner {
  constructor(private readonly logger: Logger) {}

  async scanFolder(
    folder: vscode.WorkspaceFolder,
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult> {
    if (config.tags.length === 0 && !config.markdownTasksEnabled) {
      return { results: [], truncated: false };
    }
    const include = new vscode.RelativePattern(folder, combineGlobs(config.includeGlobs));
    const exclude = combineGlobs([...config.excludeGlobs, ...ALWAYS_EXCLUDE]);
    const files = await vscode.workspace.findFiles(include, exclude, config.maxResults, token);
    return this.scanFiles(folder, files, config, token);
  }

  async scanFile(
    folder: vscode.WorkspaceFolder,
    fileUri: vscode.Uri,
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult> {
    return this.scanFiles(folder, [fileUri], config, token);
  }

  private async scanFiles(
    folder: vscode.WorkspaceFolder,
    files: vscode.Uri[],
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult> {
    const matcher = new TagMatcher(
      config.tags,
      config.caseSensitive,
      config.commentsOnly,
      config.commentMarkers,
    );
    const folderUri = folder.uri.toString();
    const fileMatches = new Map<string, TagMatch[]>();
    let count = 0;
    let truncated = false;

    const processFile = async (uri: vscode.Uri): Promise<void> => {
      if (truncated || token?.isCancellationRequested) {
        return;
      }
      let bytes: Uint8Array;
      try {
        bytes = await vscode.workspace.fs.readFile(uri);
      } catch (err) {
        this.logger.warn(`Failed to read ${uri.fsPath}: ${(err as Error).message}`);
        return;
      }
      if (bytes.length > MAX_FILE_BYTES) {
        return;
      }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const uriString = uri.toString();
      const isMd = isMarkdownUri(uriString);
      const matches: TagMatch[] = [];
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (truncated) {
          break;
        }
        const line = lines[i];
        for (const lm of matcher.match(line)) {
          if (count >= config.maxResults) {
            truncated = true;
            break;
          }
          matches.push({
            matchId: `${uriString}|${i}|${lm.startCol}|${lm.tag}`,
            uri: uriString,
            folderUri,
            tag: lm.tag,
            line: i,
            startCol: lm.startCol,
            endCol: lm.endCol,
            lineText: line,
            text: lm.text,
          });
          count++;
        }
        if (truncated) {
          break;
        }
        if (config.markdownTasksEnabled && isMd) {
          const md = matchMarkdownTask(line);
          if (md) {
            if (count >= config.maxResults) {
              truncated = true;
              break;
            }
            matches.push({
              matchId: `${uriString}|${i}|${md.startCol}|${MD_TASK_TAG}`,
              uri: uriString,
              folderUri,
              tag: MD_TASK_TAG,
              line: i,
              startCol: md.startCol,
              endCol: md.endCol,
              lineText: line,
              text: md.text,
            });
            count++;
          }
        }
      }
      if (matches.length > 0) {
        fileMatches.set(uriString, matches);
      }
    };

    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < files.length && !truncated && !token?.isCancellationRequested) {
        const i = next++;
        await processFile(files[i]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(READ_CONCURRENCY, Math.max(1, files.length)) }, worker),
    );

    const scannedAt = Date.now();
    const results: ScannedFileResult[] = [];
    for (const [uri, matches] of fileMatches) {
      results.push({ uri, folderUri, matches, scannedAt });
    }
    return { results, truncated };
  }
}

function combineGlobs(globs: string[]): string {
  if (globs.length === 0) {
    return "**/*";
  }
  if (globs.length === 1) {
    return globs[0];
  }
  return `{${globs.join(",")}}`;
}
