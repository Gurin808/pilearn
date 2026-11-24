import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { migrateCourseInstructions, migrateSettings } from "../bin/install-config.js";

const source = fileURLToPath(new URL("../", import.meta.url));
const agentDir = join(tmpdir(), "pilearn-test-agent");
const exclusion = "!**/.agents/skills/**";

const oldCourse = `# Level 2, course: Test course

Follow the \`pilearn-tutor\` skill. \`/review\` starts a recall-only session.
The sources are the ground truth. Open a source only to check something a digest doesn't cover.
The \`practice\` setting sets how many exercises to assign.
Source: /library/my-edition.pdf. pageOffset: 12.
Personal note: keep my notation.
`;

test("theme migration removes retired selections and paths without changing other settings", () => {
  const settings = {
    theme: "pilearn",
    themes: ["themes/pilearn.json", "-themes/pilearn.json", "+./themes/pilearn.json", join(agentDir, "themes", "pilearn.json"), "themes\\pilearn.json", "themes/mine.json", "!**/disabled/**"],
    skills: ["skills/local"],
    defaultProvider: "my-provider",
    defaultModel: "my-model",
    subagents: { agentOverrides: { "chapter-reader": { model: "reader-model" } } },
    defaultTools: ["read"],
    packages: ["npm:pi-docparser"],
  };
  const before = structuredClone(settings);
  const next = migrateSettings(settings, agentDir);
  assert.equal(next.theme, undefined);
  assert.deepEqual(next.themes, ["themes/mine.json", "!**/disabled/**"]);
  assert.deepEqual(next.skills, ["skills/local", exclusion]);
  for (const key of ["defaultProvider", "defaultModel", "subagents", "defaultTools", "packages"]) assert.deepEqual(next[key], before[key]);
  assert.deepEqual(settings, before);
  assert.deepEqual(migrateSettings(next, agentDir), next);
});

test("fresh settings use Pi's default without overriding user-selected themes", () => {
  assert.deepEqual(migrateSettings({ theme: "light/dark", themes: ["themes/custom.json"], skills: [exclusion] }, agentDir), {
    theme: "light/dark", themes: ["themes/custom.json"], skills: [exclusion],
  });
  assert.deepEqual(migrateSettings({ theme: "pilearn", themes: ["themes/pilearn.json"] }, agentDir), { skills: [exclusion] });
  assert.equal(migrateSettings({ theme: "light/pilearn" }, agentDir).theme, undefined);
  assert.deepEqual(migrateSettings({}, agentDir), { skills: [exclusion] });
  const seed = JSON.parse(readFileSync(join(source, "seeds/settings.json"), "utf8"));
  assert.equal(seed.theme, undefined);
  assert.equal(seed.themes, undefined);
  assert.equal(existsSync(join(source, "agent/themes/pilearn.json")), false);
});

test("course migration changes only known policy wording and is idempotent", () => {
  const next = migrateCourseInstructions(oldCourse);
  assert.match(next, /independent application/);
  assert.match(next, /Follow the shared teaching and citation rules/);
  assert.match(next, /guides exercise load/);
  assert.match(next, /Source: \/library\/my-edition.pdf. pageOffset: 12./);
  assert.match(next, /Personal note: keep my notation./);
  assert.equal(migrateCourseInstructions(next), next);
  const custom = oldCourse.replace("# Level 2, course:", "# My custom instructions:");
  assert.equal(migrateCourseInstructions(custom), custom);
});

test("legacy single-book course instructions keep their PDF path while gaining source checks", () => {
  const old = "# Level 2, course: Proofs\nThe source is `/library/proofs.pdf`, and it is the ground truth. Open the source only to check something a digest doesn't cover.\n- `pageOffset`, where PDF page = printed page + offset. Talk to the learner in printed page numbers and call tools with PDF page numbers.\n- `practice`, which sets how many exercises to assign.\n";
  const next = migrateCourseInstructions(old);
  assert.match(next, /`\/library\/proofs.pdf`/);
  assert.match(next, /PDF page = printed page \+ offset/);
  assert.match(next, /Follow the shared teaching and citation rules/);
  assert.match(next, /rather than setting a minimum/);
  assert.doesNotMatch(next, /only to check|ground truth|Talk to the learner/);
});

test("reinstallation refreshes instructions and retires the theme without touching learner data", { skip: process.platform === "win32" && "uses a POSIX npm stub" }, (t) => {
  const root = mkdtempSync(join(tmpdir(), "pilearn-install-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const cfg = join(root, "config");
  const agent = join(cfg, "agent");
  const workspace = join(root, "study");
  const bin = join(root, "bin");
  const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
  mkdirSync(repo, { recursive: true });
  for (const path of ["install.mjs", "bin", "agent", "seeds"]) cpSync(join(source, path), join(repo, path), { recursive: true });
  put(join(repo, "node_modules/@earendil-works/pi-coding-agent/package.json"), '{"version":"1.5.2"}');
  put(join(repo, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"), "// offline fixture\n");
  put(join(repo, "node_modules/@silvia-odwyer/photon-node/package.json"), "{}");
  const npm = join(root, "stub/npm");
  put(npm, "#!/bin/sh\nexit 0\n");
  chmodSync(npm, 0o755);
  put(join(agent, "settings.json"), JSON.stringify({ theme: "pilearn", themes: ["themes/pilearn.json", "themes/mine.json"], defaultModel: "keep-model", packages: [] }));
  put(join(agent, "themes/pilearn.json"), "retired");
  put(join(agent, "themes/mine.json"), "keep custom palette");
  const courseFile = join(workspace, "courses/test/AGENTS.md");
  const courseText = "# Level 2, course: Proofs\n\n`course.json` lists my PDF. Talk to the learner in the source's own page numbers, and name the source when the course has more than one. Call tools with PDF page numbers.\n\n`progress.md` holds session history, recall results, and what comes next. `sessions/` has one log per session. Cards go to the Anki deck `PILearn::Proofs`.\n\nPersonal note: keep my notation.\n";
  const expectedCourse = "# Level 2, course: Proofs\n\n`course.json` lists my PDF.\n\nCards go to the Anki deck `PILearn::Proofs`.\n\nPersonal note: keep my notation.\n";
  put(courseFile, courseText);
  const preserved = new Map([
    [join(agent, "auth.json"), '{"fixture":"unchanged"}'],
    [join(agent, "models.json"), '{"providers":{}}'],
    [join(agent, "keybindings.json"), '{"fixture":"unchanged"}'],
    [join(agent, "clipboard.json"), '{"background":"black"}'],
    [join(workspace, "courses/test/progress.md"), "## Next\n- Finish 1.2\n\n## Sessions\n| Date | Sections |\n|---|---|\n| 2026-11-20 | 1.1 |\n"],
    [join(workspace, "courses/test/sessions/old.md"), "Existing session\n"],
    [join(workspace, "courses/test/chapters/ch01/digest.md"), "Existing digest\n"],
    [join(workspace, "courses/test/source.pdf"), "Existing book fixture\n"],
  ]);
  for (const [path, text] of preserved) put(path, text);
  const env = { ...process.env, PI_OFFLINE: "1", PILEARN_CFG: cfg, PILEARN_WORKSPACE: workspace, PILEARN_BIN: bin, PATH: `${dirname(npm)}${delimiter}${process.env.PATH}` };
  const install = () => {
    const result = spawnSync(process.execPath, [join(repo, "install.mjs")], { env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  };
  install();
  assert.equal(existsSync(join(agent, "themes/pilearn.json")), false);
  assert.equal(readFileSync(join(agent, "themes/mine.json"), "utf8"), "keep custom palette");
  const settings = readFileSync(join(agent, "settings.json"), "utf8");
  assert.equal(JSON.parse(settings).theme, undefined);
  assert.equal(JSON.parse(settings).defaultModel, "keep-model");
  assert.equal(readFileSync(join(agent, "AGENTS.md"), "utf8"), readFileSync(join(source, "agent/templates/shared-AGENTS.md"), "utf8"));
  assert.equal(readFileSync(courseFile, "utf8"), expectedCourse);
  install();
  assert.equal(readFileSync(courseFile, "utf8"), expectedCourse);
  assert.equal(readFileSync(join(agent, "settings.json"), "utf8"), settings);
  for (const [path, text] of preserved) assert.equal(readFileSync(path, "utf8"), text, path);
});
