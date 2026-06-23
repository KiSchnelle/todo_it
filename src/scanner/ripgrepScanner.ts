import { spawn } from "node:child_process";
import * as path from "node:path";
import { rgPath } from "@vscode/ripgrep";
import * as vscode from "vscode";
import { ScannedFileResult, TagMatch, TodoItConfig } from "../models/types";
import { Logger } from "../util/logger";
import { isMarkdownUri, matchMarkdownTask, MD_TASK_TAG } from "./markdownTasks";
import { RgJsonStream } from "./rgJsonParser";
import { ScanResult, Scanner } from "./scanner";
import { TagMatcher, tagPatternSource } from "./tagMatcher";

/** Task storage files must never appear as scanned code tags. */
const ALWAYS_EXCLUDE = ["**/.vscode/todos.json", "**/.vscode/todos.local.json"];

function buildArgs(config: TodoItConfig, target: string): string[] {
  const args = ["--json"];
  if (!config.caseSensitive) {
    args.push("-i");
  }
  if (config.respectGitignore) {
    // Honor .gitignore/.ignore even when the folder is not inside a git repo.
    args.push("--no-require-git");
  } else {
    args.push("-uu");
  }
  for (const glob of [...config.excludeGlobs, ...ALWAYS_EXCLUDE]) {
    args.push("--glob", `!${glob}`);
  }
  for (const glob of config.includeGlobs) {
    if (glob !== "**/*") {
      args.push("--glob", glob);
    }
  }
  args.push(
    "-e",
    tagPatternSource(
      config.tags,
      config.commentsOnly,
      config.commentMarkers,
      config.markdownTasksEnabled,
    ),
  );
  // `--` ensures a path is never parsed as a flag (e.g. a file named "-rf").
  args.push("--", target);
  return args;
}

export class RipgrepScanner implements Scanner {
  constructor(private readonly logger: Logger) {}

  /** Scan an entire workspace folder. */
  async scanFolder(
    folder: vscode.WorkspaceFolder,
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult> {
    return this.scan(folder, config, ".", token);
  }

  /** Re-scan a single file within a folder. */
  async scanFile(
    folder: vscode.WorkspaceFolder,
    fileUri: vscode.Uri,
    config: TodoItConfig,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult> {
    const rel = path.relative(folder.uri.fsPath, fileUri.fsPath) || ".";
    return this.scan(folder, config, rel, token);
  }

  private async scan(
    folder: vscode.WorkspaceFolder,
    config: TodoItConfig,
    target: string,
    token?: vscode.CancellationToken,
  ): Promise<ScanResult> {
    if (config.tags.length === 0 && !config.markdownTasksEnabled) {
      return { results: [], truncated: false };
    }
    const matcher = new TagMatcher(
      config.tags,
      config.caseSensitive,
      config.commentsOnly,
      config.commentMarkers,
    );
    const folderUri = folder.uri.toString();
    const cwd = folder.uri.fsPath;
    const fileMatches = new Map<string, TagMatch[]>();
    let count = 0;
    let truncated = false;

    const stream = new RgJsonStream((rg) => {
      if (truncated) {
        return;
      }
      const fileUri = vscode.Uri.file(path.resolve(cwd, rg.path)).toString();
      const line = rg.lineNumber - 1;
      const pushMatch = (m: TagMatch): boolean => {
        if (count >= config.maxResults) {
          truncated = true;
          return false;
        }
        const arr = fileMatches.get(fileUri);
        if (arr) {
          arr.push(m);
        } else {
          fileMatches.set(fileUri, [m]);
        }
        count++;
        return true;
      };
      for (const lineMatch of matcher.match(rg.lineText)) {
        const ok = pushMatch({
          matchId: `${fileUri}|${line}|${lineMatch.startCol}|${lineMatch.tag}`,
          uri: fileUri,
          folderUri,
          tag: lineMatch.tag,
          line,
          startCol: lineMatch.startCol,
          endCol: lineMatch.endCol,
          lineText: rg.lineText,
          text: lineMatch.text,
        });
        if (!ok) {
          return;
        }
      }
      if (config.markdownTasksEnabled && isMarkdownUri(fileUri)) {
        const md = matchMarkdownTask(rg.lineText);
        if (md) {
          pushMatch({
            matchId: `${fileUri}|${line}|${md.startCol}|${MD_TASK_TAG}`,
            uri: fileUri,
            folderUri,
            tag: MD_TASK_TAG,
            line,
            startCol: md.startCol,
            endCol: md.endCol,
            lineText: rg.lineText,
            text: md.text,
          });
        }
      }
    });

    await this.run(buildArgs(config, target), cwd, stream, () => truncated, token);

    const scannedAt = Date.now();
    const results: ScannedFileResult[] = [];
    for (const [uri, matches] of fileMatches) {
      results.push({ uri, folderUri, matches, scannedAt });
    }
    return { results, truncated };
  }

  private run(
    args: string[],
    cwd: string,
    stream: RgJsonStream,
    shouldStop: () => boolean,
    token?: vscode.CancellationToken,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(rgPath, args, { cwd });
      let settled = false;
      const finish = (err?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        stream.push(chunk);
        if (shouldStop()) {
          proc.kill();
        }
      });
      proc.stderr.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          this.logger.warn(`rg: ${text}`);
        }
      });
      proc.on("error", (err) => finish(err));
      // rg exits 1 when there are no matches; that is not an error for us.
      proc.on("close", () => {
        stream.flush();
        finish();
      });

      token?.onCancellationRequested(() => {
        proc.kill();
        finish();
      });
    });
  }
}
