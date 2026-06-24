import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ManualTask, TagMatch } from "../models/types";
import { ScanStore } from "../scanner/scanStore";
import { isoDate, tasksDueBy } from "../tasks/dueCheck";
import { TaskStore } from "../tasks/taskStore";
import { getFolders } from "../workspace/folders";
import { relPathLine } from "../util/uri";

const MAX_FINDING_TEXT = 200;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

interface Snapshot {
  matches: readonly TagMatch[];
  tasks: ManualTask[];
}

async function collectSnapshot(scanStore: ScanStore, taskStore: TaskStore): Promise<Snapshot> {
  const matches = scanStore.allMatches();
  const tasks: ManualTask[] = [];
  for (const folder of getFolders()) {
    tasks.push(...(await taskStore.getTasks(folder)));
  }
  return { matches, tasks };
}

function renderMatchesForPrompt(matches: readonly TagMatch[], cap: number): string {
  return matches
    .slice(0, cap)
    .map(
      (m) =>
        `- [${m.tag}] ${relPathLine(m.uri, m.line)} — ${truncate(m.text || m.lineText.trim(), MAX_FINDING_TEXT)}`,
    )
    .join("\n");
}

function renderTasksForPrompt(tasks: readonly ManualTask[]): string {
  return tasks
    .map((t) => {
      const bits: string[] = [];
      if (t.priority) {
        bits.push(t.priority);
      }
      if (t.dueDate) {
        bits.push(`due ${t.dueDate}`);
      }
      if (t.done) {
        bits.push("done");
      }
      const meta = bits.length > 0 ? ` (${bits.join(", ")})` : "";
      return `- ${t.title}${meta}`;
    })
    .join("\n");
}

/**
 * Sticky chat participant that answers questions about the user's TODOs and
 * manual tasks. The handler exposes two slash commands:
 *   /summarize — themed Markdown overview (same prompt as the toolbar command).
 *   /overdue   — pure list of overdue / due-today tasks (no LM call needed).
 * Everything else is generic Q&A against a context snapshot.
 */
export function registerChatParticipant(
  scanStore: ScanStore,
  taskStore: TaskStore,
  config: Configuration,
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (request, _context, stream, token) => {
    if (request.command === "overdue") {
      await handleOverdue(taskStore, stream);
      return;
    }
    const snap = await collectSnapshot(scanStore, taskStore);
    const cap = config.all.aiMaxFindings;

    if (request.command === "summarize") {
      await handleSummarize(snap, cap, request, stream, token);
      return;
    }

    // Generic Q&A: pass the snapshot + the user's question to the model.
    if (snap.matches.length === 0 && snap.tasks.length === 0) {
      stream.markdown(
        "_No scanned todos and no manual tasks in this workspace yet. Open a folder with code or add a task to give me something to work with._",
      );
      return;
    }
    const prompt =
      `You are a helpful assistant answering questions about the user's TODO comments and manual tasks in a code repository. ` +
      `Be specific, cite paths and line numbers, and call out anything that looks urgent.\n\n` +
      `## Scanned TODOs (${snap.matches.length} total${snap.matches.length > cap ? `, only first ${cap} shown` : ""})\n` +
      renderMatchesForPrompt(snap.matches, cap) +
      `\n\n## Manual tasks (${snap.tasks.length})\n` +
      (snap.tasks.length > 0 ? renderTasksForPrompt(snap.tasks) : "_(none)_") +
      `\n\n## Question\n${request.prompt}`;
    await streamModel(request.model, prompt, stream, token);
  };

  const participant = vscode.chat.createChatParticipant("todoIt.chat", handler);
  participant.iconPath = new vscode.ThemeIcon("checklist");
  return participant;
}

async function handleOverdue(taskStore: TaskStore, stream: vscode.ChatResponseStream): Promise<void> {
  const today = isoDate(new Date());
  const lines: string[] = [];
  let total = 0;
  for (const folder of getFolders()) {
    const tasks = await taskStore.getTasks(folder);
    const due = tasksDueBy(tasks, today);
    if (due.length === 0) {
      continue;
    }
    total += due.length;
    lines.push(`**${folder.name}**`);
    for (const t of due) {
      const overdue = t.dueDate && t.dueDate < today;
      lines.push(`- ${t.title} — ${overdue ? `**overdue** (was due ${t.dueDate})` : "due today"}`);
    }
    lines.push("");
  }
  if (total === 0) {
    stream.markdown("✅ Nothing overdue. You're caught up.");
    return;
  }
  stream.markdown(`Found ${total} task${total === 1 ? "" : "s"} due today or earlier:\n\n${lines.join("\n")}`);
}

async function handleSummarize(
  snap: Snapshot,
  cap: number,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  if (snap.matches.length === 0) {
    stream.markdown("_No scanned todos to summarize._");
    return;
  }
  const prompt =
    `Summarize these scanned TODOs by theme, flag anything that looks urgent (FIXME / BUG / crash / security / data-loss wording), and reply in Markdown with:\n` +
    `- a one-paragraph status overview\n` +
    `- 3–7 theme bullets, each citing 2–5 \`path:line\` examples\n` +
    `- a final "Urgent" section\n\n` +
    `Findings (${snap.matches.length} total${snap.matches.length > cap ? `, only first ${cap} sent` : ""}):\n` +
    renderMatchesForPrompt(snap.matches, cap);
  await streamModel(request.model, prompt, stream, token);
}

async function streamModel(
  model: vscode.LanguageModelChat,
  prompt: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  try {
    const response = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
    for await (const chunk of response.text) {
      if (token.isCancellationRequested) {
        break;
      }
      stream.markdown(chunk);
    }
  } catch (err) {
    stream.markdown(`\n\n_Todo It AI failed: ${(err as Error).message}_`);
  }
}
