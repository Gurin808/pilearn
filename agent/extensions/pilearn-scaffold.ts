/**
 * pilearn_scaffold: creates level-2 (course) and level-3 (chapter) folders
 * in the study workspace from the AGENTS.md templates in <agentDir>/templates.
 * Deterministic on purpose (P4: structure enforced by the tool, not the prompt).
 */

import { copyFile, link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const PAGES = /^(\d+)(?:-(\d+))?$/;

const Params = Type.Object({
  level: StringEnum(["course", "chapter"] as const),
  course: Type.String({ description: "Course id: short, lowercase, hyphenated (e.g. bookofproof)" }),
  title: Type.Optional(Type.String({ description: "Course title (level course) or chapter title (level chapter)" })),
  source: Type.Optional(
    Type.String({ description: "Level course, first call only: path to the source file. The tool links it into the course folder." }),
  ),
  pageOffset: Type.Optional(
    Type.Integer({
      description:
        "Level course: PDF page = printed page + pageOffset. Find it by locating one printed page, such as a chapter start, in the PDF. A later call can set or correct it.",
    }),
  ),
  practice: Type.Optional(
    StringEnum(["foundational", "conceptual"] as const, {
      description:
        "Level course: how much practice by hand this subject needs. foundational means fluency matters and gets more exercises; conceptual means getting the idea is enough and gets a few. Ask the learner.",
    }),
  ),
  solutions: Type.Optional(
    Type.String({ description: "Level course: where the source's own solutions are, e.g. \"odd-numbered exercises, printed pp. 292-364\"; \"none\" if it has none" }),
  ),
  chapter: Type.Optional(Type.String({ description: "Level chapter: chapter number or id (e.g. 3, 03, appendix-a)" })),
  pages: Type.Optional(Type.String({ description: "Level chapter: PRINTED page range as in the book's table of contents, e.g. 41-67" })),
});

type Course = { id: string; title: string; source: string; sourceLink: string; pageOffset?: number; practice?: string; solutions?: string };

function workspace(): string {
  return process.env.PILEARN_WORKSPACE || join(homedir(), "study");
}

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

function chapterId(raw: string): string | null {
  const id = raw.trim().toLowerCase().replace(/^ch/, "");
  if (/^\d+$/.test(id)) return `ch${id.padStart(2, "0")}`;
  return ID.test(id) ? id : null;
}

async function fill(template: string, values: Record<string, string>): Promise<string> {
  let text = await readFile(join(getAgentDir(), "templates", template), "utf8");
  for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{{${key}}}`, value);
  return text;
}

async function createIfMissing(path: string, content: string): Promise<boolean> {
  try {
    await writeFile(path, content, { flag: "wx" });
    return true;
  } catch (err: any) {
    if (err?.code === "EEXIST") return false;
    throw err;
  }
}

function result(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

async function saveCourse(dir: string, course: Course) {
  await writeFile(join(dir, "course.json"), JSON.stringify(course, null, 2) + "\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "pilearn_scaffold",
    label: "Scaffold",
    description:
      "Create or update a PILearn course folder (level 2) or create a chapter folder (level 3) in the study workspace. " +
      "Course: links the source into the folder as source.<ext>, writes AGENTS.md from the level template, and stores title, pageOffset, practice, and solutions in course.json. A repeat call updates them. " +
      "Chapter: takes PRINTED page numbers and converts them to PDF pages with the course's pageOffset. The tool never overwrites an existing AGENTS.md.",
    parameters: Params,

    async execute(_toolCallId, params) {
      if (!ID.test(params.course)) throw new Error(`Invalid course id "${params.course}": use lowercase letters, digits, hyphens.`);
      const courseDir = join(workspace(), "courses", params.course);
      const metaPath = join(courseDir, "course.json");
      const existing: Course | null = existsSync(metaPath) ? JSON.parse(await readFile(metaPath, "utf8")) : null;

      if (params.level === "course") {
        if (existing) {
          const updated: Course = {
            ...existing,
            ...(params.title ? { title: params.title } : {}),
            ...(params.pageOffset !== undefined ? { pageOffset: params.pageOffset } : {}),
            ...(params.practice ? { practice: params.practice } : {}),
            ...(params.solutions ? { solutions: params.solutions } : {}),
          };
          await saveCourse(courseDir, updated);
          const note = params.source ? " (source is fixed after creation; ignored the new one)" : "";
          return result(
            `Updated course ${params.course}: title "${updated.title}", pageOffset ${updated.pageOffset ?? "not set"}, practice ${updated.practice ?? "not set"}, solutions ${updated.solutions ?? "not set"}${note}.`,
          );
        }
        if (!params.source || !params.title) throw new Error("Creating a course needs `title` and `source` (path to the primary source).");
        const expanded = expandHome(params.source);
        const source = isAbsolute(expanded) ? expanded : resolve(expanded);
        if (!existsSync(source)) throw new Error(`Source not found: ${source}`);

        for (const sub of ["chapters", "sessions"]) await mkdir(join(courseDir, sub), { recursive: true });
        const sourceLink = join(courseDir, `source${extname(source).toLowerCase() || ".pdf"}`);
        let linkExists = false;
        try {
          lstatSync(sourceLink);
          linkExists = true;
        } catch {}
        if (!linkExists) {
          // Windows only allows symlinks with Developer Mode or admin rights:
          // fall back to a hard link (same drive), then to a copy.
          try {
            await symlink(source, sourceLink);
          } catch {
            try {
              await link(source, sourceLink);
            } catch {
              await copyFile(source, sourceLink);
            }
          }
        }

        const course: Course = {
          id: params.course,
          title: params.title,
          source,
          sourceLink,
          ...(params.pageOffset !== undefined ? { pageOffset: params.pageOffset } : {}),
          ...(params.practice ? { practice: params.practice } : {}),
          ...(params.solutions ? { solutions: params.solutions } : {}),
        };
        await saveCourse(courseDir, course);
        const made = ["course.json", ...(linkExists ? [] : [basename(sourceLink)])];
        if (await createIfMissing(join(courseDir, "AGENTS.md"), await fill("level2-AGENTS.md", { TITLE: params.title, SOURCE: sourceLink })))
          made.push("AGENTS.md");
        const progress =
          `# ${params.title} progress\n\n## Next\n- ch01\n\n## Sessions\n| Date | Sections | Pre-test (hit/partial/miss) | Post-test (hit/partial/miss) | Warm-up (hit/partial/miss) | Cards |\n|---|---|---|---|---|---|\n\n` +
          `## Exercises\n| Assigned | Sections | Exercises | Why | How it went |\n|---|---|---|---|---|\n\n` +
          `## Recall log\n| Date | Section | Item | Result |\n|---|---|---|---|\n`;
        if (await createIfMissing(join(courseDir, "progress.md"), progress)) made.push("progress.md");
        const missing = [course.pageOffset === undefined && "pageOffset", !course.practice && "practice", !course.solutions && "solutions"].filter(Boolean);
        const next = missing.length ? ` Next: set ${missing.join(", ")} with another level-course call.` : "";
        return result(`Course ${params.course} at ${courseDir}. Created: ${made.join(", ")}.${next}`);
      }

      if (!existing) throw new Error(`Course ${params.course} doesn't exist yet: create it with level "course" first.`);
      if (existing.pageOffset === undefined) throw new Error(`Course ${params.course} has no pageOffset yet: set it with a level-course call first.`);
      const id = params.chapter ? chapterId(params.chapter) : null;
      if (!id) throw new Error("Level chapter needs a valid `chapter` (e.g. 3, 03, appendix-a).");
      const m = params.pages?.match(PAGES);
      if (!m || !params.title) throw new Error("Level chapter needs `title` and `pages` as a printed range like 41-67.");
      const [first, last] = [Number(m[1]), Number(m[2] ?? m[1])];
      if (last < first) throw new Error(`Page range ${params.pages} runs backwards.`);
      const pdfPages = `${first + existing.pageOffset}-${last + existing.pageOffset}`;

      const chapterDir = join(courseDir, "chapters", id);
      await mkdir(chapterDir, { recursive: true });
      const made = await createIfMissing(
        join(chapterDir, "AGENTS.md"),
        await fill("level3-AGENTS.md", { CHAPTER: id, TITLE: params.title, SOURCE: existing.sourceLink, PAGES: params.pages!, PDF_PAGES: pdfPages }),
      );
      return result(`Chapter ${id} at ${chapterDir}: printed ${params.pages} = PDF ${pdfPages}. ${made ? "Created AGENTS.md." : "AGENTS.md already existed; kept it."}`);
    },
  });
}
