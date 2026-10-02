import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLatestPiPackages, latestNpmSource } from "../bin/pi-packages.js";

test("removes npm versions without damaging scoped package names", () => {
  assert.equal(latestNpmSource("npm:pi-subagents@0.40.0"), "npm:pi-subagents");
  assert.equal(latestNpmSource("npm:@scope/tools@^1.0.0"), "npm:@scope/tools");
  assert.equal(latestNpmSource("npm:@scope/tools"), "npm:@scope/tools");
  assert.equal(latestNpmSource("npm:tools"), "npm:tools");
  assert.equal(latestNpmSource("git:github.com/example/tools@v1"), "git:github.com/example/tools@v1");
  assert.equal(latestNpmSource("./tools"), "./tools");
});

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "pilearn-packages-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "settings.json");
  const settings = {
    theme: "pilearn",
    packages: ["npm:pi-subagents@0.40.0", { source: "npm:@scope/tools@1.0.0", skills: [], extensions: ["*.ts"] }],
  };
  writeFileSync(path, JSON.stringify(settings));
  return { dir, path, settings };
}

test("migrates existing settings and updates packages in PILearn's own agent directory", (t) => {
  const f = fixture(t);
  const calls = [];
  ensureLatestPiPackages(f.dir, "/pi/dist/cli.js", {
    offline: false,
    run: (...args) => { calls.push(args); return { status: 0 }; },
  });
  const settings = JSON.parse(readFileSync(f.path));
  assert.equal(settings.theme, f.settings.theme);
  assert.deepEqual(settings.packages, ["npm:pi-subagents", { source: "npm:@scope/tools", skills: [], extensions: ["*.ts"] }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1], ["/pi/dist/cli.js", "update", "--extensions"]);
  assert.equal(calls[0][2].env.PI_CODING_AGENT_DIR, f.dir);
  assert.equal(calls[0][2].cwd, f.dir);
});

test("offline mode unpins settings but makes no network calls", (t) => {
  const f = fixture(t);
  ensureLatestPiPackages(f.dir, "/pi/dist/cli.js", { offline: true, run: () => assert.fail("unexpected subprocess") });
  assert.equal(JSON.parse(readFileSync(f.path)).packages[0], "npm:pi-subagents");
});

test("update failure gives a warning without preventing startup", (t) => {
  const f = fixture(t);
  const warnings = [];
  ensureLatestPiPackages(f.dir, "/pi/dist/cli.js", {
    offline: false, run: () => ({ status: 1 }), warn: (message) => warnings.push(message),
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Could not update extension packages/);
});

test("missing settings do not cause an update", (t) => {
  const f = fixture(t);
  rmSync(f.path);
  ensureLatestPiPackages(f.dir, "/pi/dist/cli.js", { run: () => assert.fail("unexpected subprocess") });
});

test("seed extension sources are unpinned", () => {
  const settings = JSON.parse(readFileSync(new URL("../seeds/settings.json", import.meta.url)));
  for (const source of settings.packages) assert.equal(source, latestNpmSource(source));
});
