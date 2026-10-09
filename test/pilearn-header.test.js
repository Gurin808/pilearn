import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStudyTree, renderStudyTree } from "../agent/extensions/pilearn-header.ts";

async function treeFor(t, sections) {
  const root = mkdtempSync(join(tmpdir(), "pilearn-header-test-"));
  const previous = process.env.PILEARN_WORKSPACE;
  process.env.PILEARN_WORKSPACE = root;
  t.after(() => {
    if (previous === undefined) delete process.env.PILEARN_WORKSPACE;
    else process.env.PILEARN_WORKSPACE = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const course = join(root, "courses", "bookofproof");
  const chapter = join(course, "chapters", "ch03");
  mkdirSync(chapter, { recursive: true });
  writeFileSync(join(chapter, "digest.md"), `## Sections\n| Section | Title |\n|---|---|\n${Array.from({ length: 10 }, (_, i) => `| 3.${i + 1} | Topic |`).join("\n")}\n`);
  writeFileSync(join(course, "progress.md"), `## Sessions\n| Date | Sections |\n|---|---|\n${sections.map((s) => `| 2026-10-07 | ${s} |`).join("\n")}\n`);
  return buildStudyTree(course);
}

const theme = { fg: (_, text) => text, bold: (text) => text };

test("startup marks ch03 studied after sessions phrased with 'and'", async (t) => {
  const tree = await treeFor(t, ["3.1–3.3", "3.4–3.5", "3.6 and 3.7", "3.8 and 3.9", "3.10"]);
  const lines = renderStudyTree(tree, theme).map((line) => line.plain).join("\n");
  assert.match(lines, /bookofproof\/ 1\/1/);
  assert.match(lines, /ch03 ✓/);
});

test("partial section coverage does not mark the chapter studied", async (t) => {
  const tree = await treeFor(t, ["3.1–3.5", "3.6 and 3.7", "3.10"]);
  assert.equal(tree.courses[0].chapters[0].studied, false);
});

test("ranges and comma-separated sections still mark a chapter studied", async (t) => {
  const tree = await treeFor(t, ["3.1-3.5", "3.6, 3.7; 3.8–3.10"]);
  assert.equal(tree.courses[0].chapters[0].studied, true);
});

test("startup accepts ranges phrased with 'to' followed by introduction", async (t) => {
  const tree = await treeFor(t, ["3.1 to 3.10, introduction"]);
  const lines = renderStudyTree(tree, theme).map((line) => line.plain).join("\n");
  assert.match(lines, /bookofproof\/ 1\/1/);
  assert.match(lines, /ch03 ✓/);
});

test("a 'to' range does not cover sections beyond its endpoint", async (t) => {
  const tree = await treeFor(t, ["3.1 to 3.9, introduction"]);
  assert.equal(tree.courses[0].chapters[0].studied, false);
});

test("a bare unit id still marks the whole chapter studied", async (t) => {
  const tree = await treeFor(t, ["ch03"]);
  assert.equal(tree.courses[0].chapters[0].studied, true);
});
