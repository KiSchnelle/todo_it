const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const test = process.argv.includes("--test");

/** Emits the [watch] sentinels and formatted errors the VS Code problem matcher expects. */
const problemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => console.log("[watch] build started"));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log("[watch] build finished");
    });
  },
};

/** Recursively collect files matching a predicate. */
function walk(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) {
    return acc;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

async function buildExtension() {
  // Node host: imports child_process, the bundled ripgrep, and Node std libs.
  const node = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "dist/extension.js",
    format: "cjs",
    platform: "node",
    target: "node22",
    // vscode is provided by the host; @vscode/ripgrep must load natively (it
    // locates its platform binary via createRequire, which breaks if bundled).
    external: ["vscode", "@vscode/ripgrep"],
    sourcemap: !production,
    minify: production,
    logLevel: "silent",
    plugins: [problemMatcherPlugin],
  });
  // Web host: pure VS Code APIs, no Node std lib. The browser bundle deliberately
  // excludes the Node entry point so child_process/ripgrep can't leak in.
  const web = await esbuild.context({
    entryPoints: ["src/extension.web.ts"],
    bundle: true,
    outfile: "dist/extension.web.js",
    format: "cjs",
    platform: "browser",
    target: "es2022",
    external: ["vscode"],
    sourcemap: !production,
    minify: production,
    logLevel: "silent",
    plugins: [problemMatcherPlugin],
  });
  if (watch) {
    await Promise.all([node.watch(), web.watch()]);
  } else {
    await Promise.all([node.rebuild(), web.rebuild()]);
    await Promise.all([node.dispose(), web.dispose()]);
  }
}

async function buildTests() {
  const entryPoints = walk("test", (f) => f.endsWith(".test.ts"));
  await esbuild.build({
    entryPoints,
    bundle: true,
    outdir: "dist/test",
    outbase: "test",
    format: "cjs",
    platform: "node",
    target: "node22",
    external: ["vscode", "mocha"],
    sourcemap: true,
    logLevel: "silent",
    plugins: [problemMatcherPlugin],
  });
}

(async () => {
  try {
    if (test) {
      await buildTests();
    } else {
      await buildExtension();
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
