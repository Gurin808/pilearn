#!/usr/bin/env node
// pilearn: PILearn's launcher, on the Pi core.
//
// PILearn is a SIBLING package on the Pi core (like Feynman), not a Feynman
// session. It boots the Pi harness with PILearn's OWN agent config:
//   - agent dir:   $PI_CODING_AGENT_DIR  ->  ~/.pilearn/agent  (own skills/agents/theme/settings)
//   - workspace:   $PILEARN_WORKSPACE    ->  ~/study  (courses/, aggregate/: study data,
//                   kept apart from this code repo so dev notes never load into tutoring)
//   - working dir: anywhere under <workspace>/courses/ stays as-is (course or chapter
//                   level); anywhere else resolves to the workspace root (level 1)
//   - banner:      drawn by agent/extensions/pilearn-header.ts inside the session panel

import { spawnSync } from "node:child_process";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { existsSync, readFileSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const PILEARN_WORKSPACE = process.env.PILEARN_WORKSPACE || join(homedir(), "study");
const PILEARN_VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;

const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pilearn", "agent");

function resolveWorkDir() {
  const cwd = process.cwd();
  if (cwd.startsWith(join(PILEARN_WORKSPACE, "courses") + sep)) return cwd;
  return PILEARN_WORKSPACE;
}

const args = process.argv.slice(2);
let courseName = null;
const passthrough = [];
let printContext = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--course" && args[i + 1]) { courseName = args[i + 1]; i++; continue; }
  if (args[i] === "--context") { printContext = true; continue; }
  passthrough.push(args[i]);
}
const workDir = courseName ? join(PILEARN_WORKSPACE, "courses", courseName) : resolveWorkDir();
if (printContext) {
  console.log(workDir);
  process.exit(0);
}
if (!existsSync(workDir)) {
  console.error(`pilearn: ${workDir} does not exist. Run the installer, or ask the level-1 session to create the course.`);
  process.exit(1);
}

const localPi = join(PACKAGE_ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
if (!existsSync(localPi)) {
  console.error(`pilearn: Pi harness not found. Run \`npm install\` in ${PACKAGE_ROOT}`);
  process.exit(1);
}

// /go (agent/extensions/pilearn-go.ts) writes a target folder to this handoff file
// and shuts Pi down; we then relaunch Pi there, since a Pi process can't change cwd.
const handoff = join(tmpdir(), `pilearn-go-${process.pid}`);
let dir = workDir;
let piArgs = passthrough;
for (;;) {
  rmSync(handoff, { force: true });
  const res = spawnSync(process.execPath, [localPi, ...piArgs], {
    cwd: dir,
    stdio: "inherit",
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PILEARN_WORKSPACE, PILEARN_VERSION, PILEARN_HANDOFF: handoff },
  });
  const next = existsSync(handoff) ? readFileSync(handoff, "utf8").trim() : "";
  rmSync(handoff, { force: true });
  if (!next || !existsSync(next)) process.exit(res.status ?? 0);
  dir = next;
  piArgs = [];
}
