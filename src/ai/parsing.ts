/** Strips a leading ```json fence (or plain ```) some models wrap JSON responses in. */
export function stripJsonFences(text: string): string {
  return text.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
}

import { TaskPriority } from "../models/types";

export interface PrioritySuggestion {
  priority: TaskPriority;
  reason: string;
}

const PRIORITIES = new Set<TaskPriority>(["low", "medium", "high"]);

function isPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (PRIORITIES as Set<string>).has(value);
}

export function parsePriorityResponse(text: string): PrioritySuggestion | undefined {
  try {
    const parsed = JSON.parse(stripJsonFences(text)) as { priority?: unknown; reason?: unknown };
    if (isPriority(parsed.priority) && typeof parsed.reason === "string") {
      return { priority: parsed.priority, reason: parsed.reason };
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

export interface ExpandedTask {
  title: string;
  note: string;
  /** Optional — newer prompts ask for it; omit if the model doesn't provide one. */
  priority?: TaskPriority;
}

export function parseExpandedTaskResponse(text: string): ExpandedTask | undefined {
  try {
    const parsed = JSON.parse(stripJsonFences(text)) as {
      title?: unknown;
      note?: unknown;
      priority?: unknown;
    };
    if (typeof parsed.title === "string" && parsed.title.trim() && typeof parsed.note === "string") {
      const priority = isPriority(parsed.priority) ? parsed.priority : undefined;
      return { title: parsed.title.trim(), note: parsed.note, priority };
    }
  } catch {
    /* fall through */
  }
  return undefined;
}
