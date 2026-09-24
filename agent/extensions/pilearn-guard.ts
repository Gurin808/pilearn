/**
 * Keeps the model's file tools inside the study workspace.
 *
 * Every file-touching tool call is checked before it runs:
 *   write/edit                       -> only inside the workspace
 *   read/grep/find/ls/document_*     -> the workspace, each course's source file
 *                                       (course.json `source`, usually outside via symlink),
 *                                       PILearn's agent dir (skills, templates, past
 *                                       sessions) except credentials, and the temp dir
 *                                       where document_screenshot saves pages
 *   subagent cwd                     -> only inside the workspace
 * Paths are resolved through symlinks, so a link inside the workspace can't point
 * the model elsewhere, except at a course's own source.
 *
 * This guards the model's tools, not the Pi process: it is not an OS sandbox.
 * With `bash` disabled (settings.json defaultTools) the tools are the model's only
 * way to touch files. The learner's own `!command` shell is not affected.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const READ_TOOLS = new Set(["read", "grep", "find", "ls", "document_parse", "document_search", "document_screenshot"]);
const WRITE_TOOLS = new Set(["write", "edit"]);
const SECRETS = ["auth.json", "models.json"];

/** Resolve symlinks for the longest existing prefix, so not-yet-created files work. */
function real(p: string): string {
  let head = p;
  const tail: string[] = [];
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) return p;
    tail.unshift(head.slice(parent.length).replace(/^[\\/]+/, ""));
    head = parent;
  }
  try {
    return join(realpathSync(head), ...tail);
  } catch {
    return p;
  }
}

function inside(p: string, root: string): boolean {
  const rel = relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function workspace(): string {
  return real(resolve(process.env.PILEARN_WORKSPACE || join(homedir(), "study")));
}

function courseSources(ws: string): string[] {
  const out: string[] = [];
  let ids: string[] = [];
  try {
    ids = readdirSync(join(ws, "courses"));
  } catch {
    return out;
  }
  for (const id of ids) {
    try {
      const course = JSON.parse(readFileSync(join(ws, "courses", id, "course.json"), "utf8"));
      if (typeof course.source === "string") out.push(real(course.source));
    } catch {}
  }
  return out;
}

function expand(p: string, cwd: string): string {
  const home = p === "~" || p.startsWith("~/") || p.startsWith("~\\") ? join(homedir(), p.slice(1)) : p;
  return real(resolve(cwd, home));
}

function readAllowed(p: string, ws: string): boolean {
  if (inside(p, ws)) return true;
  const agent = real(getAgentDir());
  if (inside(p, agent)) return !SECRETS.some((f) => p === join(agent, f));
  if (inside(p, real(tmpdir()))) return true;
  return courseSources(ws).includes(p);
}

const OUTSIDE =
  "PILearn only works with files inside the study workspace. To use a new book or paper, add it with /add-book, which links it into a course folder.";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const name = event.toolName;
    const input = (event.input ?? {}) as Record<string, unknown>;
    const ws = workspace();
    const block = (reason: string) => {
      if (ctx.hasUI) ctx.ui.notify(`Blocked ${name}: ${reason}`, "warning");
      return { block: true, reason };
    };

    // document_* tools can send pages to a remote OCR server: not allowed.
    if (name.startsWith("document_") && input.ocrServerUrl) {
      return block("remote OCR servers are disabled in PILearn; OCR runs locally.");
    }

    if (WRITE_TOOLS.has(name) || READ_TOOLS.has(name)) {
      const raw = typeof input.path === "string" && input.path ? input.path : ".";
      const p = expand(raw, ctx.cwd);
      if (WRITE_TOOLS.has(name) ? !inside(p, ws) : !readAllowed(p, ws)) {
        return block(`${raw} is outside the study workspace (${ws}). ${OUTSIDE}`);
      }
      return undefined;
    }

    if (name === "subagent") {
      // cwd can appear at the top level or inside tasks/chain steps.
      const cwds: string[] = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            if (k === "cwd" && typeof x === "string") cwds.push(x);
            else walk(x);
          }
        }
      };
      walk(input);
      for (const c of cwds) {
        if (!inside(expand(c, ctx.cwd), ws)) return block(`subagent cwd ${c} is outside the study workspace (${ws}).`);
      }
    }
    return undefined;
  });
}
