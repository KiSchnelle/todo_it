import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "dist/test/**/*.test.js",
  workspaceFolder: "./test/fixtures/workspace",
  // CI also runs the suite on the engines.vscode floor (VSCODE_VERSION=1.104.0).
  version: process.env.VSCODE_VERSION || "stable",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
