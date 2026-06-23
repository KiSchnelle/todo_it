import * as assert from "node:assert";
import { isMarkdownUri, matchMarkdownTask, MD_TASK_TAG } from "../../src/scanner/markdownTasks";

suite("matchMarkdownTask", () => {
  test("matches dash, star, plus, and ordered checkboxes", () => {
    for (const line of ["- [ ] write tests", "* [ ] write tests", "+ [ ] write tests", "1. [ ] write tests"]) {
      const m = matchMarkdownTask(line);
      assert.ok(m, `should match: ${line}`);
      assert.strictEqual(m?.text, "write tests");
    }
  });

  test("respects leading whitespace and trims trailing whitespace", () => {
    const m = matchMarkdownTask("    - [ ] indented task   ");
    assert.ok(m);
    assert.strictEqual(m?.text, "indented task");
    // startCol points at the start of the task text.
    assert.strictEqual(m?.startCol, "    - [ ] ".length);
  });

  test("ignores checked boxes and malformed lines", () => {
    assert.strictEqual(matchMarkdownTask("- [x] already done"), null);
    assert.strictEqual(matchMarkdownTask("- [X] capital done"), null);
    assert.strictEqual(matchMarkdownTask("- [] no space inside"), null);
    assert.strictEqual(matchMarkdownTask("- [  ] two spaces"), null);
    assert.strictEqual(matchMarkdownTask("just text"), null);
    assert.strictEqual(matchMarkdownTask("- [ ]"), null); // no content after
  });
});

suite("isMarkdownUri", () => {
  test("detects md / markdown / mdx extensions", () => {
    for (const uri of [
      "file:///x/README.md",
      "file:///x/notes.markdown",
      "file:///x/page.mdx",
      "FILE:///x/UPPER.MD",
    ]) {
      assert.ok(isMarkdownUri(uri), uri);
    }
  });

  test("rejects everything else", () => {
    for (const uri of ["file:///x/code.ts", "file:///x/README.md.bak", "file:///x/markdown"]) {
      assert.strictEqual(isMarkdownUri(uri), false, uri);
    }
  });
});

suite("MD_TASK_TAG", () => {
  test("is the synthetic tag used for grouping", () => {
    assert.strictEqual(MD_TASK_TAG, "MD-TASK");
  });
});
