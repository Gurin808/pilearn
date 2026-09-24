#!/usr/bin/env node
// PILearn installer for macOS, Linux, and Windows. Idempotent: re-run any time
// to pick up repo changes.
//   agent config  -> $PILEARN_CFG/agent    (default ~/.pilearn/agent)
//   study data    -> $PILEARN_WORKSPACE    (default ~/study)
//   launcher      -> $PILEARN_BIN/pilearn  (default ~/.local/bin; on Windows
//                    %USERPROFILE%\.pilearn\bin\pilearn.cmd)

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const win = process.platform === "win32";
const SRC = dirname(fileURLToPath(import.meta.url));
const CFG = process.env.PILEARN_CFG || join(homedir(), ".pilearn");
const WORKSPACE = process.env.PILEARN_WORKSPACE || join(homedir(), "study");
const BIN = process.env.PILEARN_BIN || (win ? join(CFG, "bin") : join(homedir(), ".local", "bin"));
const AGENT = join(CFG, "agent");
const say = (msg) => console.log(`pilearn: ${msg}`);

// 0. Requirements
const [major, minor] = process.versions.node.split(".").map(Number);
if (!(major > 22 || (major === 22 && minor >= 19))) {
  console.error(`pilearn: Node.js 22.19 or newer is required (found ${process.version}).`);
  process.exit(1);
}

// 1. Pi harness (the core PILearn runs on)
execFileSync(win ? "npm.cmd" : "npm", ["install", "--no-fund", "--no-audit", "--loglevel=error"], {
  cwd: SRC,
  stdio: "inherit",
  shell: win,
});
const PI = join(SRC, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");

// 2. Agent config: the repo's agent/ tree always wins (theme, subagents, skills,
//    extensions, prompts, templates); the shared level map is installed as AGENTS.md.
mkdirSync(AGENT, { recursive: true });
mkdirSync(BIN, { recursive: true });
for (const d of ["agents", "skills", "extensions", "templates", "themes", "prompts"]) {
  rmSync(join(AGENT, d), { recursive: true, force: true });
}
cpSync(join(SRC, "agent"), AGENT, { recursive: true });
cpSync(join(SRC, "agent", "templates", "shared-AGENTS.md"), join(AGENT, "AGENTS.md"));

// 3. Settings, models, auth, keybindings: seeded only if missing, so local edits
//    and credentials are never overwritten.
for (const f of ["settings.json", "models.json", "auth.json", "keybindings.json"]) {
  if (!existsSync(join(AGENT, f))) cpSync(join(SRC, "seeds", f), join(AGENT, f));
}

// 3b. PILearn loads only its own skills. Pi also picks up skills from the
//     shared ~/.agents/skills folder (used by other agent tools); those would
//     show up in PILearn but sit outside the folders the guard allows.
const settingsPath = join(AGENT, "settings.json");
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const NO_SHARED_SKILLS = "!**/.agents/skills/**";
if (!(settings.skills ?? []).includes(NO_SHARED_SKILLS)) {
  settings.skills = [...(settings.skills ?? []), NO_SHARED_SKILLS];
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

// 4. Extension packages listed in settings.json, installed into PILearn's own
//    package folder (<agent>/npm) so nothing depends on global npm packages.
const packages = settings.packages ?? [];
for (const pkg of packages) {
  const spec = String(typeof pkg === "string" ? pkg : pkg.source ?? "");
  if (!spec.startsWith("npm:")) continue;
  const name = spec.slice(4).replace(/(.)@[^@/]*$/, "$1");
  if (existsSync(join(AGENT, "npm", "node_modules", name))) continue;
  execFileSync(process.execPath, [PI, "install", spec], {
    env: { ...process.env, PI_CODING_AGENT_DIR: AGENT },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

// 5. Study workspace: folders created if missing (they hold your study data);
//    the level-1 AGENTS.md is PILearn's own instructions, so it's always updated.
mkdirSync(join(WORKSPACE, "courses"), { recursive: true });
mkdirSync(join(WORKSPACE, "aggregate"), { recursive: true });
cpSync(join(SRC, "agent", "templates", "level1-AGENTS.md"), join(WORKSPACE, "AGENTS.md"));

// 6. Launcher
const launcherJs = join(SRC, "bin", "pilearn.js");
let launcher;
if (win) {
  launcher = join(BIN, "pilearn.cmd");
  writeFileSync(launcher, `@echo off\r\nset "PILEARN_WORKSPACE=${WORKSPACE}"\r\nset "PI_CODING_AGENT_DIR=${AGENT}"\r\nnode "${launcherJs}" %*\r\n`);
} else {
  launcher = join(BIN, "pilearn");
  writeFileSync(launcher, `#!/bin/sh\nexport PILEARN_WORKSPACE="${WORKSPACE}"\nexport PI_CODING_AGENT_DIR="${AGENT}"\nexec node "${launcherJs}" "$@"\n`);
  chmodSync(launcher, 0o755);
}

say(`agent config at ${AGENT}`);
say(`study workspace at ${WORKSPACE}`);
say(`launcher installed -> ${launcher}`);
const onPath = (process.env.PATH ?? "")
  .split(delimiter)
  .some((p) => p.replace(/[\\/]+$/, "").toLowerCase() === BIN.replace(/[\\/]+$/, "").toLowerCase());
if (!onPath) {
  if (win) say(`add ${BIN} to your PATH (Settings > "Edit environment variables for your account" > Path), then open a new terminal.`);
  else say(`add ${BIN} to your PATH to run 'pilearn'.`);
}
console.log(`
Next steps:
  1. pilearn               start PILearn
  2. /login                connect your model provider (e.g. a ChatGPT or Claude subscription, or an API key)
  3. /model                choose the chat model (saved as your default)
  4. /reader-model         choose the model that reads PDFs (needs image input)
  5. /add-book <pdf>       add your first book`);
