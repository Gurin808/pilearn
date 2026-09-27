/**
 * pilearn_scaffold: creates course folders (level 2) and unit folders (level 3) in
 * the study workspace from the AGENTS.md templates in <agentDir>/templates, keeps
 * each course's list of PDF sources in course.json, and imports MIT OpenCourseWare
 * downloads. Deterministic on purpose (P4: structure enforced by the tool, not the prompt).
 *
 * Books are linked, never copied, so a library such as Calibre keeps the only copy.
 * OCW PDFs are copied into the course folder, so the download can be deleted.
 */

import { copyFile, link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { KIND_ORDER, KIND_TITLE, ocwIndex, readOcwExport } from "./ocw";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const PAGES = /^(\d+)(?:-(\d+))?$/;

const Part = Type.Object({
  source: Type.String({
    description: "Source id from course.json, e.g. book, or the path of a PDF under ocw/files/, which is then added as a source with pageOffset 0",
  }),
  pages: Type.String({ description: "Page range as the source numbers its pages, e.g. 41-67. For a source with pageOffset 0 these are PDF pages." }),
  role: Type.Optional(
    StringEnum(["reading", "exercises", "solutions"] as const, {
      description:
        "reading (default): the chapter-reader digests these pages. exercises: problems the reader lists without solving. solutions: for the tutor only; the reader skips them.",
    }),
  ),
  note: Type.Optional(
    Type.String({
      description:
        "Narrows the range when it holds more than this unit needs. Written to follow the word Only, e.g. \"Part B\", \"problems 1E and 1G-1H\", \"the part on lecture 9\"",
    }),
  ),
});

const Params = Type.Object({
  level: StringEnum(["course", "source", "ocw", "chapter"] as const, {
    description:
      "course: create a course or update its title and practice. source: add a PDF to a course, or update a source's title, pageOffset, or solutions. ocw: import an unpacked OCW course download into a course. chapter: create one unit folder.",
  }),
  course: Type.String({ description: "Course id: short, lowercase, hyphenated (e.g. bookofproof)" }),
  title: Type.Optional(Type.String({ description: "Title of the course, source, or unit, depending on the level" })),
  practice: Type.Optional(
    StringEnum(["foundational", "conceptual"] as const, {
      description:
        "Level course: how much practice by hand this subject needs. foundational means fluency matters and gets more exercises; conceptual means getting the idea is enough and gets a few. Ask the learner.",
    }),
  ),
  source: Type.Optional(Type.String({ description: "Level source: the source id, short and lowercase, e.g. book, notes-m, ps3" })),
  path: Type.Optional(
    Type.String({
      description:
        "Level source, first call for that id: a local PDF path or file URL (linked, not copied), or a PDF already in the course folder such as ocw/files/ps3.pdf. Level ocw: the unpacked OCW download folder.",
    }),
  ),
  pageOffset: Type.Optional(
    Type.Integer({
      description:
        "Level source: PDF page = page as the source numbers it + pageOffset. Find it by locating one printed page, such as a chapter start, in the PDF. Use 0 when the PDF has no printed page numbers.",
    }),
  ),
  solutions: Type.Optional(
    Type.String({ description: "Level source: where this source's own solutions are, e.g. \"odd-numbered exercises, printed pp. 292-364\"; \"none\" if it has none" }),
  ),
  chapter: Type.Optional(Type.String({ description: "Level chapter: unit id, e.g. 3 (becomes ch03), appendix-a, notes-m, ps3" })),
  parts: Type.Optional(Type.Array(Part, { description: "Level chapter: the page ranges this unit covers, in reading order" })),
  pages: Type.Optional(
    Type.String({ description: "Level chapter, for a course with exactly one source: shorthand for one reading part of that source, e.g. 41-67" }),
  ),
});

/** file is relative to the course folder. origin is the real file a linked book points to. */
type Source = { title: string; file: string; origin?: string; pageOffset?: number; solutions?: string };
type Course = {
  id: string;
  title: string;
  practice?: string;
  sources: Record<string, Source>;
  ocw?: { number: string; title: string; term: string; url: string; origin: string };
};

function workspace(): string {
  return process.env.PILEARN_WORKSPACE || join(homedir(), "study");
}

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

function inside(p: string, root: string): boolean {
  const rel = relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function chapterId(raw: string): string | null {
  const id = raw.trim().toLowerCase().replace(/^ch(?=\d+$)/, "");
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

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function result(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

/**
 * Link a book into the course folder. Windows only allows symlinks with Developer Mode
 * or admin rights: fall back to a hard link (same drive), then to a copy.
 */
async function linkBook(source: string, dest: string): Promise<void> {
  try {
    await symlink(source, dest);
  } catch {
    try {
      await link(source, dest);
    } catch {
      await copyFile(source, dest);
    }
  }
}

/** course.json from before sources existed had one book at the top level: move it to sources.book. */
function migrate(raw: any, courseDir: string): Course {
  if (raw.sources) return raw as Course;
  const { source, sourceLink, pageOffset, solutions, ...rest } = raw;
  const sources: Record<string, Source> = {};
  if (typeof sourceLink === "string") {
    sources.book = {
      title: rest.title,
      file: relative(courseDir, sourceLink) || "source.pdf",
      origin: typeof source === "string" ? source : sourceLink,
      ...(pageOffset !== undefined ? { pageOffset } : {}),
      ...(solutions ? { solutions } : {}),
    };
  }
  return { ...rest, sources };
}

async function saveCourse(dir: string, course: Course) {
  await writeFile(join(dir, "course.json"), JSON.stringify(course, null, 2) + "\n");
}

function describeSource(id: string, s: Source): string {
  return `${id} (${s.file}, pageOffset ${s.pageOffset ?? "not set"}, solutions ${s.solutions ?? "not set"})`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "pilearn_scaffold",
    label: "Scaffold",
    description:
      "Build PILearn courses in the study workspace. " +
      "Level course creates the course folder (level 2) with AGENTS.md, progress.md, and course.json, or updates its title and practice. " +
      "Level source adds one PDF to the course's sources under an id: a book outside the workspace is linked as sources/<id>.pdf, a PDF already in the course folder is used where it is. A repeat call updates title, pageOffset, or solutions. " +
      "Level ocw copies every PDF of an unpacked OCW course download into ocw/files/, writes its pages as Markdown to ocw/pages/, and writes ocw/index.md. " +
      "Level chapter creates one unit folder (level 3) whose AGENTS.md lists its parts, each a page range of one source, converted to PDF pages with that source's pageOffset. " +
      "The tool never overwrites an existing AGENTS.md.",
    parameters: Params,

    async execute(_toolCallId, params) {
      if (!ID.test(params.course)) throw new Error(`Invalid course id "${params.course}": use lowercase letters, digits, hyphens.`);
      const courseDir = join(workspace(), "courses", params.course);
      const metaPath = join(courseDir, "course.json");
      const existing: Course | null = existsSync(metaPath) ? migrate(JSON.parse(await readFile(metaPath, "utf8")), courseDir) : null;

      if (params.level === "course") {
        if (params.pageOffset !== undefined || params.solutions || params.path)
          throw new Error("pageOffset, solutions, and path belong to a source: add the PDF with level \"source\".");
        if (existing) {
          const updated: Course = {
            ...existing,
            ...(params.title ? { title: params.title } : {}),
            ...(params.practice ? { practice: params.practice } : {}),
          };
          await saveCourse(courseDir, updated);
          return result(`Updated course ${params.course}: title "${updated.title}", practice ${updated.practice ?? "not set"}.`);
        }
        if (!params.title) throw new Error("Creating a course needs `title`.");
        for (const sub of ["chapters", "sessions"]) await mkdir(join(courseDir, sub), { recursive: true });
        const course: Course = { id: params.course, title: params.title, ...(params.practice ? { practice: params.practice } : {}), sources: {} };
        await saveCourse(courseDir, course);
        const made = ["course.json", "chapters/", "sessions/"];
        if (await createIfMissing(join(courseDir, "AGENTS.md"), await fill("level2-AGENTS.md", { TITLE: params.title }))) made.push("AGENTS.md");
        const progress =
          `# ${params.title} progress\n\n## Next\n- (first unit)\n\n## Sessions\n| Date | Sections | Pre-test (hit/partial/miss) | Post-test (hit/partial/miss) | Warm-up (hit/partial/miss) | Cards |\n|---|---|---|---|---|---|\n\n` +
          `## Exercises\n| Assigned | Sections | Exercises | Why | How it went |\n|---|---|---|---|---|\n\n## Recall log\n| Date | Section | Item | Result |\n|---|---|---|---|\n`;
        if (await createIfMissing(join(courseDir, "progress.md"), progress)) made.push("progress.md");
        return result(
          `Course ${params.course} at ${courseDir}. Created: ${made.join(", ")}. Next: add a book with level "source", or an OCW download with level "ocw".`,
        );
      }

      if (!existing) throw new Error(`Course ${params.course} doesn't exist yet: create it with level "course" first.`);

      if (params.level === "source") {
        const id = params.source?.trim().toLowerCase();
        if (!id || !ID.test(id)) throw new Error("Level source needs a `source` id: short, lowercase, hyphenated (e.g. book, ps3).");
        const current = existing.sources[id];
        let note = "";
        let entry: Source;
        if (current) {
          if (params.path) note = " The file of an existing source can't change; ignored `path`.";
          entry = { ...current };
        } else {
          if (!params.path) throw new Error(`Source ${id} is new: give the PDF's \`path\`.`);
          const raw = params.path.startsWith("file://") ? fileURLToPath(params.path) : expandHome(params.path);
          const path = isAbsolute(raw) ? raw : resolve(courseDir, raw);
          if (!existsSync(path)) throw new Error(`File not found: ${path}`);
          if (extname(path).toLowerCase() !== ".pdf") throw new Error(`${path} isn't a PDF. PILearn reads PDF sources only.`);
          let file: string;
          let origin: string | undefined;
          if (inside(path, courseDir)) {
            file = relative(courseDir, path);
          } else {
            origin = realpathSync(path);
            if (inside(realpathSync(path), realpathSync(workspace())))
              throw new Error(`${path} is in another part of the workspace. Import it into this course instead.`);
            await mkdir(join(courseDir, "sources"), { recursive: true });
            file = join("sources", `${id}.pdf`);
            if (exists(join(courseDir, file))) throw new Error(`${file} already exists but isn't in course.json. Choose another id.`);
            await linkBook(path, join(courseDir, file));
          }
          const taken = Object.entries(existing.sources).find(([, s]) => s.file === file);
          if (taken) throw new Error(`${file} is already source ${taken[0]}.`);
          entry = { title: basename(path, extname(path)), file, ...(origin ? { origin } : {}) };
        }
        if (params.title) entry.title = params.title;
        if (params.pageOffset !== undefined) entry.pageOffset = params.pageOffset;
        if (params.solutions) entry.solutions = params.solutions;
        const updated: Course = { ...existing, sources: { ...existing.sources, [id]: entry } };
        await saveCourse(courseDir, updated);
        const next = entry.pageOffset === undefined ? " Next: set pageOffset (0 if the PDF has no printed page numbers)." : "";
        return result(`${current ? "Updated" : "Added"} source ${describeSource(id, entry)}.${note}${next}`);
      }

      if (params.level === "ocw") {
        if (!params.path) throw new Error("Level ocw needs `path`: the unpacked OCW download folder.");
        const raw = params.path.startsWith("file://") ? fileURLToPath(params.path) : expandHome(params.path);
        const ocw = readOcwExport(isAbsolute(raw) ? raw : resolve(raw));
        if (existing.ocw && existing.ocw.origin !== ocw.dir && existing.ocw.number !== ocw.number)
          throw new Error(`Course ${params.course} already has OCW ${existing.ocw.number}. Use a new course for a second OCW course.`);
        const filesDir = join(courseDir, "ocw", "files");
        const pagesDir = join(courseDir, "ocw", "pages");
        await mkdir(filesDir, { recursive: true });
        await mkdir(pagesDir, { recursive: true });
        let copied = 0;
        for (const f of ocw.files) {
          const dest = join(filesDir, `${f.slug}.pdf`);
          if (exists(dest)) continue;
          await copyFile(f.file, dest);
          copied++;
        }
        for (const p of ocw.pages) await writeFile(join(pagesDir, `${p.name}.md`), `# ${p.title}\n\n${p.markdown}\n`);
        await writeFile(join(courseDir, "ocw", "index.md"), ocwIndex(ocw));
        const titles = Object.fromEntries(ocw.files.map((f) => [f.slug, { title: f.title, kind: f.kind }]));
        await writeFile(join(courseDir, "ocw", "files.json"), JSON.stringify(titles, null, 2) + "\n");
        const updated: Course = { ...existing, ocw: { number: ocw.number, title: ocw.title, term: ocw.term, url: ocw.url, origin: ocw.dir } };
        await saveCourse(courseDir, updated);
        const counts = KIND_ORDER.map((k) => [k, ocw.files.filter((f) => f.kind === k).length] as const)
          .filter(([, n]) => n)
          .map(([k, n]) => `${n} ${KIND_TITLE[k].toLowerCase()}`)
          .join(", ");
        return result(
          `Imported OCW ${ocw.number} ${ocw.title} (${ocw.term}): ${ocw.files.length} PDFs in ocw/files/ (${copied} newly copied; ${counts}), ${ocw.pages.length} pages in ocw/pages/, and ${ocw.videos.length} videos (${ocw.videos.filter((v) => v.transcript).length} with transcripts) listed in ocw/index.md. Read ocw/index.md next. The download folder is no longer needed.`,
        );
      }

      // level chapter
      const id = params.chapter ? chapterId(params.chapter) : null;
      if (!id) throw new Error("Level chapter needs a valid `chapter` (e.g. 3, 03, appendix-a, ps3).");
      if (!params.title) throw new Error("Level chapter needs `title`.");
      // A part can name an OCW file by path. Add it as a source under its file name, with pageOffset 0.
      let ocwTitles: Record<string, { title: string }> = {};
      try {
        ocwTitles = JSON.parse(await readFile(join(courseDir, "ocw", "files.json"), "utf8"));
      } catch {}
      let added = false;
      for (const part of params.parts ?? []) {
        const m = part.source.trim().match(/^(?:\.\/)?ocw\/files\/([a-z0-9_-]+)\.pdf$/i);
        if (!m || existing.sources[part.source]) continue;
        const file = join("ocw", "files", `${m[1]}.pdf`);
        if (!existsSync(join(courseDir, file))) throw new Error(`${file} doesn't exist. Check the path in ocw/index.md.`);
        const known = Object.entries(existing.sources).find(([, s]) => s.file === file)?.[0];
        const id = known ?? m[1]!.toLowerCase().replaceAll("_", "-");
        if (!known) {
          if (existing.sources[id]) throw new Error(`Source id ${id} is taken by another file. Add ${file} with level "source" and a new id.`);
          existing.sources[id] = { title: ocwTitles[m[1]!]?.title ?? m[1]!, file, pageOffset: 0 };
          added = true;
        }
        part.source = id;
      }
      if (added) await saveCourse(courseDir, existing);
      const ids = Object.keys(existing.sources);
      let parts = params.parts ?? [];
      if (!parts.length && params.pages) {
        if (ids.length !== 1) throw new Error(`Course ${params.course} has ${ids.length} sources: give \`parts\` with a source for each range.`);
        parts = [{ source: ids[0]!, pages: params.pages }];
      }
      if (!parts.length) throw new Error("Level chapter needs `parts` (or `pages` for a course with one source).");

      const lines: string[] = [];
      const summary: string[] = [];
      const warnings: string[] = [];
      for (const part of parts) {
        const source = existing.sources[part.source];
        if (!source) throw new Error(`Unknown source "${part.source}". Sources of ${params.course}: ${ids.join(", ") || "none yet"}.`);
        if (source.pageOffset === undefined)
          throw new Error(`Source ${part.source} has no pageOffset yet: set it with level "source" (0 if its PDF has no printed page numbers).`);
        const m = part.pages.trim().match(PAGES);
        if (!m) throw new Error(`Pages "${part.pages}" should be a range like 41-67.`);
        const [first, last] = [Number(m[1]), Number(m[2] ?? m[1])];
        if (last < first) throw new Error(`Page range ${part.pages} runs backwards.`);
        if (first + source.pageOffset < 1) throw new Error(`Pages ${part.pages} of ${part.source} fall before PDF page 1.`);
        const pdf = `${first + source.pageOffset}-${last + source.pageOffset}`;
        const where = source.pageOffset === 0 ? `PDF pages ${pdf}` : `pages ${first}-${last}, which are PDF pages ${pdf}`;
        const file = `\`${join(courseDir, source.file)}\``;
        const role = part.role ?? "reading";
        const note = part.note
          ?.trim()
          .replace(/[.\s]+$/, "")
          .replace(/^only\s+/i, "")
          .replace(/\s+only$/i, "");
        const only = note ? ` Only ${note}.` : "";
        if (role === "reading") lines.push(`- Read ${file} (source \`${part.source}\`, ${source.title}), ${where}.${only}`);
        else if (role === "exercises") lines.push(`- List the exercises in ${file} (source \`${part.source}\`, ${source.title}), ${where}.${only} Don't solve them.`);
        else lines.push(`- Solutions are in ${file} (source \`${part.source}\`, ${source.title}), ${where}.${only} They are for the tutor. Don't read them.`);
        summary.push(`${role} ${part.source} ${part.pages} = PDF ${pdf}${note ? ` (only ${note})` : ""}`);
        if (role === "exercises" && last - first + 1 > 12)
          warnings.push(`${part.source} ${part.pages} is ${last - first + 1} pages of exercises. Problems usually take a few pages at the end of a section; check that the range covers only them.`);
      }
      const cited = parts.filter((p) => p.role !== "solutions");
      const several = new Set(cited.map((p) => p.source)).size > 1;
      const pdfOnly = cited.some((p) => existing.sources[p.source]!.pageOffset === 0);
      const printed = cited.some((p) => existing.sources[p.source]!.pageOffset !== 0);
      const cite = [
        several ? "This unit uses more than one source, so cite pages with the source id, like `book p. 45` or `ps3 p. 2`." : "",
        pdfOnly ? "Cite a range given only in PDF pages by its PDF pages, even where a page prints its own number." : "",
        printed ? "Cite a range given in the source's own pages by those pages." : "",
      ]
        .filter(Boolean)
        .join(" ");

      const chapterDir = join(courseDir, "chapters", id);
      await mkdir(chapterDir, { recursive: true });
      const made = await createIfMissing(
        join(chapterDir, "AGENTS.md"),
        await fill("level3-AGENTS.md", { CHAPTER: id, TITLE: params.title, PARTS: lines.join("\n"), CITE: cite }),
      );
      return result(
        `Unit ${id} at ${chapterDir}: ${summary.join("; ")}. ${made ? "Created AGENTS.md." : "AGENTS.md already existed; kept it."}${warnings.map((w) => ` ${w}`).join("")}`,
      );
    },
  });
}
