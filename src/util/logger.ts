import * as vscode from "vscode";

export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel("Todo It");
  }

  info(message: string): void {
    this.channel.appendLine(`[info]  ${message}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[warn]  ${message}`);
  }

  error(message: string, err?: unknown): void {
    const detail =
      err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err ? safeStringify(err) : "";
    this.channel.appendLine(`[error] ${message}${detail ? `: ${detail}` : ""}`);
  }

  dispose(): void {
    this.channel.dispose();
  }
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
