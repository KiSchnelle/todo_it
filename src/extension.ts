import * as vscode from "vscode";
import { activateCommon } from "./activate";
import { JsScanner } from "./scanner/jsScanner";
import { Scanner } from "./scanner/scanner";
import { Logger } from "./util/logger";

function createScanner(logger: Logger): Scanner {
  try {
    // Loaded lazily: @vscode/ripgrep throws at import time when the platform binary package is
    // missing (e.g. a VSIX built for another platform). Fall back to the JS scanner then.
    const { RipgrepScanner } =
      // oxlint-disable-next-line typescript/no-require-imports -- lazy load so a missing ripgrep binary can fall back
      require("./scanner/ripgrepScanner") as typeof import("./scanner/ripgrepScanner");
    return new RipgrepScanner(logger);
  } catch (err) {
    logger.warn(`ripgrep unavailable, falling back to the JS scanner: ${(err as Error).message}`);
    return new JsScanner(logger);
  }
}

/** Node-host entry point: uses the bundled ripgrep binary for fast scanning. */
export function activate(context: vscode.ExtensionContext): void {
  activateCommon(context, createScanner);
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions.
}
