import { TagDefinition } from "../models/types";

export const DEFAULT_TAGS: TagDefinition[] = [
  { tag: "TODO", color: "#ffbd2e" },
  { tag: "FIXME", color: "#ff5f56" },
  { tag: "HACK", color: "#c678dd" },
  { tag: "BUG", color: "#e06c75" },
  { tag: "NOTE", color: "#61afef" },
  { tag: "XXX", color: "#e5c07b" },
];

export const DEFAULT_INCLUDES = ["**/*"];

export const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/out/**",
  "**/.git/**",
  "**/*.min.*",
];

export const TASKS_FILE = ".vscode/todos.json";
export const TASKS_FILE_LOCAL = ".vscode/todos.local.json";
export const TASKS_SCHEMA_VERSION = 1 as const;
