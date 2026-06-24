import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { TagMatch, TreeNode } from "../models/types";
import { ScanStore } from "../scanner/scanStore";
import { findExistingLinkedTask } from "../tasks/linkedTaskLookup";
import { TaskStore } from "../tasks/taskStore";
import { relPathLine } from "../util/uri";
import { TaskDetailPanel } from "../webview/taskDetailPanel";
import { folderByKey } from "../workspace/folders";
import { chat, ensureLanguageModel, showMarkdownResponse } from "./lm";
import { parseExpandedTaskResponse, parsePriorityResponse } from "./parsing";

// Per-item character clamps are defensive against pathological inputs (1k-char
// TODOs or minified-file context). They're not user-tunable — users wouldn't
// know what to set, and the values are well below any model's context limit.
const MAX_FINDING_TEXT = 200;
const MAX_CONTEXT_LINE_LEN = 300;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Reads up to ±contextLines of surrounding source for a match, with per-line clamp. */
async function readContext(uri: string, line: number, contextLines: number): Promise<string> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const start = Math.max(0, line - contextLines);
    const end = Math.min(doc.lineCount - 1, line + contextLines);
    const out: string[] = [];
    for (let i = start; i <= end; i++) {
      const prefix = i === line ? "→ " : "  ";
      out.push(prefix + truncate(doc.lineAt(i).text, MAX_CONTEXT_LINE_LEN));
    }
    return out.join("\n");
  } catch {
    return "";
  }
}

async function runWithProgress<T>(
  title: string,
  work: (token: vscode.CancellationToken) => Promise<T>,
): Promise<T> {
  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (_progress, token) => work(token),
  );
}

// ----- Summarize all scanned TODOs -----

export async function summarizeTodos(scanStore: ScanStore, config: Configuration): Promise<void> {
  const matches = scanStore.allMatches();
  if (matches.length === 0) {
    void vscode.window.showInformationMessage("Todo It AI: no scanned todos to summarize.");
    return;
  }
  const model = await ensureLanguageModel();
  if (!model) {
    return;
  }
  const cap = config.all.aiMaxFindings;
  const findings = matches.slice(0, cap);
  const truncatedNote =
    matches.length > cap
      ? `\n\n_Note: only the first ${cap} of ${matches.length} todos were sent to the model (configurable via \`todoIt.ai.maxFindings\`)._`
      : "";
  const prompt =
    `You are summarizing the open TODOs in a codebase. Group them by theme, flag anything that ` +
    `looks urgent (FIXME, BUG, or wording about crashes/security/data loss), and reply in Markdown:\n\n` +
    `- A one-paragraph status overview at the top.\n` +
    `- 3-7 theme bullets, each naming the theme and listing 2-5 example findings as \`path:line — text\`.\n` +
    `- A final "Urgent" section listing any findings that look like they shouldn't wait.\n\n` +
    `Findings (one per line):\n` +
    findings
      .map(
        (m) =>
          `- [${m.tag}] ${relPathLine(m.uri, m.line)} — ${truncate(m.text || m.lineText.trim(), MAX_FINDING_TEXT)}`,
      )
      .join("\n");

  await runWithProgress("Todo It: summarizing todos…", async (token) => {
    try {
      const result = await chat(model, prompt, token);
      await showMarkdownResponse("TODO Summary", result + truncatedNote);
    } catch (err) {
      void vscode.window.showErrorMessage(`Todo It AI: ${(err as Error).message}`);
    }
  });
}

// ----- Suggest priority for a task -----

export async function suggestTaskPriority(
  taskStore: TaskStore,
  config: Configuration,
  node?: TreeNode,
): Promise<void> {
  if (node?.kind !== "task") {
    void vscode.window.showInformationMessage("Todo It AI: open a task first.");
    return;
  }
  const folder = folderByKey(node.folderUri);
  if (!folder) {
    return;
  }
  const model = await ensureLanguageModel();
  if (!model) {
    return;
  }

  // Use the first linked source for context (most tasks have only one — the
  // back-link from Track as Task — and for richer multi-link tasks we'd rather
  // keep the prompt tight than dump every linked file's surroundings).
  const primaryLink = node.task.links?.[0];
  const context = primaryLink
    ? await readContext(primaryLink.uri, primaryLink.line, config.all.aiContextLines)
    : "";
  const prompt =
    `You are triaging a task. Suggest a priority of "low", "medium", or "high" using these heuristics:\n` +
    `- "high" — likely a bug, security issue, broken behavior, deadline-driven work, or blocks others.\n` +
    `- "medium" — clear improvement with real user/dev impact but not urgent.\n` +
    `- "low" — nice-to-have, cleanup, polish, or low-impact refactor.\n\n` +
    `Reply with ONLY a JSON object (no markdown fence): {"priority": "low"|"medium"|"high", "reason": "<one short sentence>"}.\n\n` +
    `Task title: ${node.task.title}\n` +
    (node.task.note ? `Task note: ${node.task.note}\n` : "") +
    (context ? `\nSurrounding code:\n\`\`\`\n${context}\n\`\`\`\n` : "");

  const suggestion = await runWithProgress("Todo It: suggesting priority…", async (token) => {
    try {
      const text = await chat(model, prompt, token);
      return parsePriorityResponse(text);
    } catch (err) {
      void vscode.window.showErrorMessage(`Todo It AI: ${(err as Error).message}`);
      return undefined;
    }
  });
  if (!suggestion) {
    void vscode.window.showInformationMessage(
      "Todo It AI: couldn't parse a priority suggestion — try again.",
    );
    return;
  }
  const apply = await vscode.window.showInformationMessage(
    `Suggested priority: ${suggestion.priority}. ${suggestion.reason}`,
    "Apply",
    "Dismiss",
  );
  if (apply === "Apply") {
    await taskStore.updateTask(folder, node.task.id, { priority: suggestion.priority });
  }
}

// ----- Track as Task (AI-expanded) -----

export async function trackAsTaskAI(
  taskStore: TaskStore,
  config: Configuration,
  node?: TreeNode,
): Promise<void> {
  if (node?.kind !== "match") {
    return;
  }
  const folder = folderByKey(node.match.folderUri);
  if (!folder) {
    return;
  }
  // Dedup against the same scanned position — repeat clicks just reveal the
  // existing task instead of stacking up.
  const existing = findExistingLinkedTask(await taskStore.getTasks(folder), node.match);
  if (existing) {
    TaskDetailPanel.show(taskStore, folder, existing);
    return;
  }
  const model = await ensureLanguageModel();
  if (!model) {
    return;
  }

  const context = await readContext(node.match.uri, node.match.line, config.all.aiContextLines);
  const originalComment = truncate(
    node.match.text || node.match.lineText.trim(),
    MAX_FINDING_TEXT,
  );
  const prompt =
    `You are turning a short code comment into a fuller task description. The comment may be cryptic — use the surrounding code as context.\n\n` +
    `Tag: ${node.match.tag}\n` +
    `Original comment: ${originalComment}\n` +
    `File: ${relPathLine(node.match.uri, node.match.line)}\n\n` +
    (context ? `Surrounding code:\n\`\`\`\n${context}\n\`\`\`\n\n` : "") +
    `Reply with ONLY a JSON object (no markdown fence):\n` +
    `{"title": "<short, action-oriented sentence — max ~80 chars>",\n` +
    ` "note": "<2-4 sentence Markdown note explaining context, what needs to happen, and acceptance criteria>",\n` +
    ` "priority": "low" | "medium" | "high"}\n\n` +
    `For priority, treat FIXME/BUG and wording about crashes/security/data-loss as "high"; clear improvements with real impact as "medium"; cleanup/polish as "low".`;

  const expanded = await runWithProgress("Todo It: expanding TODO with AI…", async (token) => {
    try {
      const text = await chat(model, prompt, token);
      return parseExpandedTaskResponse(text);
    } catch (err) {
      void vscode.window.showErrorMessage(`Todo It AI: ${(err as Error).message}`);
      return undefined;
    }
  });

  // Always create the task — fall back to the plain comment text if expansion failed.
  const fallbackTitle = node.match.text.trim() || `${node.match.tag}: ${node.match.lineText.trim()}`;
  const task = await taskStore.addTask(folder, {
    title: expanded?.title ?? fallbackTitle,
    note: expanded?.note,
    priority: expanded?.priority,
    links: [
      {
        uri: node.match.uri,
        line: node.match.line,
        column: node.match.startCol,
        tag: node.match.tag,
        preview: node.match.lineText.trim(),
      },
    ],
  });
  TaskDetailPanel.show(taskStore, folder, task);
}

// ----- Explain a scanned match -----

export async function explainMatch(config: Configuration, node?: TreeNode): Promise<void> {
  if (node?.kind !== "match") {
    void vscode.window.showInformationMessage("Todo It AI: right-click a scanned todo to explain it.");
    return;
  }
  const match: TagMatch = node.match;
  const model = await ensureLanguageModel();
  if (!model) {
    return;
  }

  const context = await readContext(match.uri, match.line, config.all.aiContextLines);
  const location = relPathLine(match.uri, match.line);
  const prompt =
    `Explain what this TODO/comment is asking for, using the surrounding code as context. Be specific about what the author likely meant. Reply in Markdown.\n\n` +
    `Tag: ${match.tag}\n` +
    `Comment text: ${truncate(match.text || match.lineText.trim(), MAX_FINDING_TEXT)}\n` +
    `Location: ${location}\n\n` +
    (context ? `Surrounding code:\n\`\`\`\n${context}\n\`\`\`\n` : "");

  await runWithProgress("Todo It: explaining…", async (token) => {
    try {
      const result = await chat(model, prompt, token);
      await showMarkdownResponse(`Explain ${match.tag} at ${location}`, result);
    } catch (err) {
      void vscode.window.showErrorMessage(`Todo It AI: ${(err as Error).message}`);
    }
  });
}
