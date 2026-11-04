import * as assert from "node:assert";
import { createPathFilter } from "../../src/watcher/pathFilter";

suite("pathFilter", () => {
  test("basename-only pattern matches at any depth and via parent dirs", () => {
    const f = createPathFilter(["**/*"], ["*.log", "vendor"]);
    assert.ok(f.isExcluded("src/app.log"));
    assert.ok(f.isExcluded("vendor/lib/x.js"));
    assert.ok(!f.isExcluded("src/app.ts"));
  });
  test("path globs", () => {
    const f = createPathFilter([], ["**/node_modules/**", "**/*.min.*"]);
    assert.ok(f.isExcluded("a/node_modules/b/c.js"));
    assert.ok(f.isExcluded("dist/a.min.js"));
    assert.ok(!f.isExcluded("src/a.js"));
  });
  test("includes act as a whitelist unless catch-all", () => {
    const f = createPathFilter(["src/**/*.ts"], []);
    assert.ok(f.isIncluded("src/a/b.ts"));
    assert.ok(!f.isIncluded("README.md"));
    assert.ok(createPathFilter(["**/*"], []).isIncluded("README.md"));
  });
});
