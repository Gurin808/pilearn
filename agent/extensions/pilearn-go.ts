/**
 * /go: move between study levels with an arrow-key picker (ctx.ui.select, as /model does).
 * A Pi process can't change its working directory, and the working directory decides the
 * AGENTS.md stack (= the level). So /go hands the target folder to the launcher
 * (bin/pilearn.js, via $PILEARN_HANDOFF) and shuts Pi down; the launcher relaunches Pi there.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Target = { label: string; dir: string; id: string };

function workspace(): string {
  return process.env.PILEARN_WORKSPACE || join(homedir(), "study");
}

async function targets(cwd: string): Promise<Target[]> {
  const ws = workspace();
  const rel = relative(ws, cwd);
  const here = rel === "" ? "study" : rel.split(sep)[0] === "courses" ? rel.split(sep)[1] : "";
  const mark = (id: string) => (id === here ? "  ◀ here" : "");

  const list: Target[] = [{ id: "study", dir: ws, label: `~/study · level 1, all courses${mark("study")}` }];
  let ids: string[] = [];
  try {
    ids = (await readdir(join(ws, "courses"), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {}
  for (const id of ids) {
    const dir = join(ws, "courses", id);
    let title = id;
    try {
      title = JSON.parse(await readFile(join(dir, "course.json"), "utf8")).title ?? id;
    } catch {}
    list.push({ id, dir, label: `${title} (${id}) · level 2${mark(id)}` });
  }
  return list;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("go", {
    description: "Move to the curriculum (level 1) or a course (level 2); PILearn restarts there",
    handler: async (args, ctx) => {
      const handoff = process.env.PILEARN_HANDOFF;
      if (!handoff) {
        ctx.ui.notify("/go needs PILearn started with the `pilearn` command.", "error");
        return;
      }
      const list = await targets(ctx.cwd);
      const wanted = args?.trim();
      let target = wanted ? list.find((t) => t.id === wanted) : undefined;
      if (wanted && !target) {
        ctx.ui.notify(`No course "${wanted}". Options: ${list.map((t) => t.id).join(", ")}`, "error");
        return;
      }
      if (!target) {
        const choice = await ctx.ui.select("Go to", list.map((t) => t.label));
        target = list.find((t) => t.label === choice);
      }
      if (!target || !existsSync(target.dir)) return;
      if (target.dir === ctx.cwd) {
        ctx.ui.notify("You're already here.", "info");
        return;
      }
      await ctx.waitForIdle();
      await writeFile(handoff, target.dir);
      ctx.shutdown();
    },
  });
}
