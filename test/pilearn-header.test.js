import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import registerHeader, { buildStudyTree, renderPilearnLogo, renderStudyTree } from "../agent/extensions/pilearn-header.ts";

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

function logoTheme(text = "#d4d4d4", mode = "truecolor") {
  return new Theme({ text, accent: "#00ffff", dim: "#777777", borderMuted: "#555555", success: "#00ff00", muted: "#999999", thinkingXhigh: "#ffffff" }, { selectedBg: "#222222" }, mode);
}

test("the enlarged Pi mark preserves its pixel shape and aligns lowercase learn with the i", () => {
  const lines = renderPilearnLogo(logoTheme(), 76).map(stripVTControlCharacters);
  assert.equal(lines.length, 10);
  assert.ok(lines.every((line) => visibleWidth(line) === 76));
  assert.deepEqual(lines.map((line) => line.slice(0, 20)), [
    "███████████████     ",
    "███████████████     ",
    "▀▀▀▀▀▀▀▀▀▀█████     ",
    "█████     █████     ",
    "█████     █████     ",
    "██████████     █████",
    "██████████     █████",
    "█████▀▀▀▀▀     █████",
    "█████          █████",
    "█████          █████",
  ]);
  assert.equal(lines[3].slice(23).trim(), "███");
  assert.equal(lines[4].slice(23).trim(), "███");
  assert.equal(lines[5].slice(23), "███       ██████     ███████    ███ ████   ███ █████ ");
  assert.equal(lines[9].slice(23), " █████    ███████    ██████ ██  ███        ███    ███");
});

test("Pi's colors stay fixed while learn follows the terminal foreground", () => {
  for (const text of ["#d4d4d4", "#222222"]) {
    const lines = renderPilearnLogo(logoTheme(text), 100);
    const logo = lines.join("\n");
    for (const color of ["228;138;122", "79;142;179", "234;182;93"]) assert.ok(logo.includes(`\x1b[38;2;${color}m`));
    assert.ok(lines[2].includes("\x1b[48;2;79;142;179m"), "half-block boundary needs the blue lower pixel");
    assert.ok(!logo.includes("\x1b[38;2;0;255;255m"), "logo must not inherit the accent color");
    assert.ok(lines[5].includes(logoTheme(text).fg("text", "███       ██████     ███████    ███ ████   ███ █████ ")));
  }
});

test("logo colors respect 256-color terminals and reset before surrounding content", () => {
  const lines = renderPilearnLogo(logoTheme("#d4d4d4", "256color"), 76);
  assert.ok(lines.join("").includes("\x1b[38;5;"));
  assert.ok(lines[2].includes("\x1b[48;5;"));
  assert.ok(!lines.join("").includes("\x1b[38;2;"));
  assert.ok(lines[2].includes("\x1b[49m"), "blue background must not leak into the rest of the row");
  assert.ok(lines.every((line) => line.endsWith("\x1b[39m")));
});

test("narrow terminals get a complete compact wordmark instead of clipped block letters", () => {
  for (const width of [0, 1, 6, 7, 20, 40, 75, 76, 100]) {
    const lines = renderPilearnLogo(logoTheme(), width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    if (width >= 7 && width < 76) assert.deepEqual(lines.map(stripVTControlCharacters), ["pilearn"]);
  }
});

test("startup header centers the colored logo and keeps the panel and tree within resized widths", async (t) => {
  await treeFor(t, []);
  let start;
  let createHeader;
  registerHeader({
    on: (event, handler) => { if (event === "session_start") start = handler; },
    getCommands: () => [],
    getAllTools: () => [],
  });
  await start({}, {
    mode: "tui",
    cwd: process.env.PILEARN_WORKSPACE,
    ui: { setHeader: (factory) => { createHeader = factory; } },
    sessionManager: { getBranch: () => [], getSessionName: () => "", getSessionId: () => "test-session" },
  });
  const header = createHeader({}, logoTheme());
  for (const width of [20, 40, 60, 77, 78, 80, 100, 120, 160, 200]) {
    const lines = header.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `header overflow at ${width} columns`);
    const plain = lines.map(stripVTControlCharacters);
    assert.ok(plain.some((line) => line.includes("model")));
    assert.ok(plain.some((line) => line.includes("courses/")));
    if (width >= 78) {
      const top = plain[1];
      const bottom = plain[10];
      assert.equal(top.trim(), "███████████████");
      assert.equal(bottom.trimEnd().length - top.indexOf("█"), 76);
    } else {
      assert.equal(plain[1].trim(), "pilearn");
    }
    header.invalidate();
  }
});
