import * as vscode from "vscode";
import { Configuration } from "../config/configuration";
import { ScanStore } from "../scanner/scanStore";
import { isoDate } from "../tasks/dueCheck";
import { TaskStore } from "../tasks/taskStore";
import { getFolders, isMultiRoot } from "../workspace/folders";
import { relPath, relPathLine } from "../util/uri";
import {
  AddTaskInput,
  clampLimit,
  filterMatches,
  filterTasks,
  ListTasksInput,
  ListTodosInput,
  renderMatches,
  renderTaskGroups,
  SetTaskDoneInput,
  validateAddTask,
} from "./toolFormat";

/** Tool names — must match `contributes.languageModelTools[].name` in package.json. */
export const TOOL_NAMES = {
  listTodos: "todoIt_listTodos",
  listTasks: "todoIt_listTasks",
  addTask: "todoIt_addTask",
  setTaskDone: "todoIt_setTaskDone",
} as const;

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

function resolveFolder(name: string | undefined): vscode.WorkspaceFolder | undefined {
  const folders = getFolders();
  if (!name) {
    return folders[0];
  }
  const wanted = name.trim().toLowerCase();
  return folders.find((f) => f.name.toLowerCase() === wanted || f.uri.toString() === name);
}

/**
 * Registers Todo It's Language Model tools. These replace the old `@todo-it`
 * chat participant (deprecated and unsupported in the Copilot harness): the
 * agent calls the tools itself, or the user references them with `#todos`,
 * `#tasks`, `#addTask`, `#completeTask` in any chat.
 */
export function registerLanguageModelTools(
  scanStore: ScanStore,
  taskStore: TaskStore,
  config: Configuration,
): vscode.Disposable {
  // Older/alternative hosts may not implement the LM tools API — degrade gracefully.
  if (typeof vscode.lm?.registerTool !== "function") {
    return new vscode.Disposable(() => undefined);
  }

  const listTodos: vscode.LanguageModelTool<ListTodosInput> = {
    prepareInvocation() {
      return { invocationMessage: "Reading scanned TODO comments" };
    },
    async invoke(options) {
      const input = options.input ?? {};
      const all = scanStore.allMatches();
      const filtered = filterMatches(all, input, (m) => relPath(m.uri));
      const limit = clampLimit(input.limit, config.all.aiMaxFindings);
      return textResult(
        renderMatches(filtered.slice(0, limit), filtered.length, (m) => relPathLine(m.uri, m.line)),
      );
    },
  };

  const listTasks: vscode.LanguageModelTool<ListTasksInput> = {
    prepareInvocation() {
      return { invocationMessage: "Reading Todo It tasks" };
    },
    async invoke(options) {
      const input = options.input ?? {};
      const today = isoDate(new Date());
      const groups = [];
      for (const folder of getFolders()) {
        const tasks = await taskStore.getTasks(folder);
        groups.push({ folder: folder.name, tasks: filterTasks(tasks, input, today) });
      }
      if (groups.length === 0) {
        return textResult("No workspace folder is open, so there are no tasks.");
      }
      return textResult(renderTaskGroups(groups, today, isMultiRoot()));
    },
  };

  const addTask: vscode.LanguageModelTool<AddTaskInput> = {
    prepareInvocation(options) {
      const { title, priority, dueDate } = options.input;
      const meta = [priority && `priority ${priority}`, dueDate && `due ${dueDate}`].filter(Boolean).join(", ");
      return {
        invocationMessage: `Adding task "${title}"`,
        confirmationMessages: {
          title: "Add Todo It task?",
          message: new vscode.MarkdownString(`**${title}**${meta ? ` — ${meta}` : ""}`),
        },
      };
    },
    async invoke(options) {
      const input = options.input;
      const error = validateAddTask(input);
      if (error) {
        throw new Error(error);
      }
      const folder = resolveFolder(input.folder);
      if (!folder) {
        throw new Error(
          input.folder
            ? `No workspace folder named "${input.folder}". Available: ${getFolders()
                .map((f) => f.name)
                .join(", ")}.`
            : "No workspace folder is open.",
        );
      }
      if (input.parentId) {
        const tasks = await taskStore.getTasks(folder);
        if (!tasks.some((t) => t.id === input.parentId)) {
          throw new Error(`No task with id "${input.parentId}" in folder "${folder.name}".`);
        }
      }
      const task = await taskStore.addTask(folder, {
        title: input.title.trim(),
        priority: input.priority,
        dueDate: input.dueDate,
        note: input.note,
        parentId: input.parentId,
      });
      return textResult(`Created task "${task.title}" (id: ${task.id}) in ${folder.name}.`);
    },
  };

  const setTaskDone: vscode.LanguageModelTool<SetTaskDoneInput> = {
    async prepareInvocation(options) {
      const done = options.input.done ?? true;
      const found = await findTask(taskStore, options.input.taskId);
      const label = found ? `"${found.title}"` : options.input.taskId;
      return {
        invocationMessage: `${done ? "Completing" : "Reopening"} task ${label}`,
        confirmationMessages: {
          title: done ? "Mark Todo It task done?" : "Reopen Todo It task?",
          message: new vscode.MarkdownString(
            `${label}${done ? " and all of its subtasks will be marked done." : " will be reopened (with its subtasks)."}`,
          ),
        },
      };
    },
    async invoke(options) {
      const done = options.input.done ?? true;
      const found = await findTask(taskStore, options.input.taskId);
      if (!found) {
        throw new Error(`No task with id "${options.input.taskId}". Use the todoIt_listTasks tool to look up ids.`);
      }
      await taskStore.setDone(found.folder, found.id, done);
      return textResult(`Task "${found.title}" is now ${done ? "done" : "open"}.`);
    },
  };

  return vscode.Disposable.from(
    vscode.lm.registerTool(TOOL_NAMES.listTodos, listTodos),
    vscode.lm.registerTool(TOOL_NAMES.listTasks, listTasks),
    vscode.lm.registerTool(TOOL_NAMES.addTask, addTask),
    vscode.lm.registerTool(TOOL_NAMES.setTaskDone, setTaskDone),
  );
}

async function findTask(
  taskStore: TaskStore,
  id: string,
): Promise<{ id: string; title: string; folder: vscode.WorkspaceFolder } | undefined> {
  for (const folder of getFolders()) {
    const task = (await taskStore.getTasks(folder)).find((t) => t.id === id);
    if (task) {
      return { id: task.id, title: task.title, folder };
    }
  }
  return undefined;
}
