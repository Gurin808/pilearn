/**
 * Reads an unpacked MIT OpenCourseWare "Download course" export and turns it into
 * files the tutor can use: a copy of every PDF, the course pages as Markdown, and
 * one index. Works offline from the export's own data.json files, so nothing is
 * scraped and nothing is fetched.
 *
 * Export layout (ocw-hugo-themes offline build):
 *   data.json                      course metadata (title, number, term, instructors)
 *   resources/<slug>/data.json     one per file: title, learning_resource_types, file
 *   static_resources/<hash>_<name> the files themselves
 *   pages/<path>/data.json         syllabus, calendar, readings, ... as HTML in `content`
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export type OcwKind = "notes" | "readings" | "problems" | "solutions" | "exams" | "transcripts" | "other";
export type OcwFile = { slug: string; title: string; kind: OcwKind; types: string[]; description: string; file: string };
export type OcwPage = { name: string; title: string; markdown: string };
export type OcwVideo = { title: string; url: string; transcript?: string; related: string[] };
export type OcwCourse = {
  dir: string;
  number: string;
  title: string;
  term: string;
  instructors: string[];
  url: string;
  license: string;
  files: OcwFile[];
  pages: OcwPage[];
  videos: OcwVideo[];
};

export const KIND_ORDER: OcwKind[] = ["notes", "readings", "problems", "solutions", "exams", "transcripts", "other"];
export const KIND_TITLE: Record<OcwKind, string> = {
  notes: "Lecture notes",
  readings: "Readings",
  problems: "Problem sets and assignments",
  solutions: "Solutions",
  exams: "Exams",
  transcripts: "Video transcripts",
  other: "Other PDFs",
};

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Find the export root: the folder itself, or its only subfolder (unzipping often nests one level). */
export function findExportRoot(dir: string): string {
  if (/\.zip$/i.test(dir)) throw new Error("This is a zip file. Unzip it first (double-click it in Finder or Explorer) and give the folder.");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Folder not found: ${dir}`);
  const isRoot = (d: string) => existsSync(join(d, "data.json")) && existsSync(join(d, "resources"));
  if (isRoot(dir)) return dir;
  const subs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("."));
  if (subs.length === 1 && isRoot(join(dir, subs[0]!.name))) return join(dir, subs[0]!.name);
  throw new Error(
    `${dir} isn't an unpacked OCW course download: it needs data.json and resources/. On the course page on ocw.mit.edu, use "Download course", unzip it, and give that folder.`,
  );
}

function kindOf(types: string[], parentTitle: string, title: string, description: string): OcwKind {
  const has = (re: RegExp) => types.some((t) => re.test(t));
  if (has(/solution/i) || /^solutions?\b/i.test(title) || /^solutions? (to|for)\b/i.test(description)) return "solutions";
  if (has(/exam/i)) return "exams";
  if (has(/problem set|assignment|worked example/i)) return "problems";
  if (has(/lecture notes|online textbook/i)) return "notes";
  if (has(/reading/i)) return "readings";
  if (/transcript/i.test(title) || /video/i.test(parentTitle)) return "transcripts";
  return "other";
}

export function readOcwExport(input: string): OcwCourse {
  const dir = findExportRoot(input);
  const meta = readJson(join(dir, "data.json"));

  // Every resource, keyed by its file's basename so video transcripts can be matched to their videos.
  type Raw = { slug: string; data: any };
  const raws: Raw[] = [];
  for (const slug of readdirSync(join(dir, "resources"))) {
    const path = join(dir, "resources", slug, "data.json");
    if (!existsSync(path)) continue;
    try {
      raws.push({ slug, data: readJson(path) });
    } catch {}
  }

  // Transcripts linked from a video take the video's title ("3play pdf file" otherwise).
  const videoTitleByFile = new Map<string, string>();
  for (const { data } of raws) {
    if (data.resourcetype !== "Video") continue;
    const files = data.video_files?.video_transcript_resources;
    for (const t of Array.isArray(files) ? files : []) if (t?.file) videoTitleByFile.set(basename(String(t.file)), String(data.title ?? ""));
  }
  // Skip such a transcript when the course also has its own "Transcript ... Lecture N" file for that lecture.
  const lectureTranscripts = new Set(
    raws.flatMap(({ data }) => {
      const m = String(data.title ?? "").match(/transcript\b.*\blecture\s+(\d+)\s*$/i);
      return m ? [m[1]!] : [];
    }),
  );

  const files: OcwFile[] = [];
  const slugByFile = new Map<string, string>();
  const transcriptByLecture = new Map<string, string>();
  for (const { slug, data } of raws) {
    if (data.file_type !== "application/pdf" || !data.file) continue;
    const name = basename(String(data.file));
    const file = join(dir, "static_resources", name);
    if (!existsSync(file)) continue;
    let title = String(data.title ?? slug).trim();
    const video = videoTitleByFile.get(name);
    if (video !== undefined) {
      const lecture = video.match(/^lecture\s+(\d+)\b/i)?.[1];
      if (lecture && lectureTranscripts.has(lecture)) continue;
      title = `Transcript, ${video || title}`;
    }
    const types = list(data.learning_resource_types);
    const description = String(data.description ?? "").replace(/\s+/g, " ").trim();
    const safe = slugOf(slug);
    slugByFile.set(name, safe);
    const lecture = title.match(/transcript\b.*\blecture\s+(\d+)\s*$/i)?.[1];
    if (lecture) transcriptByLecture.set(lecture, safe);
    files.push({
      slug: safe,
      title,
      kind: video !== undefined ? "transcripts" : kindOf(types, String(data.parent_title ?? ""), title, description),
      types,
      description,
      file,
    });
  }
  files.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, "en", { numeric: true }));

  const pdfSlugs = new Set(files.map((f) => f.slug));

  // Videos can't be read, but the plan links to them, and each one's transcript is what a chapter-reader digests.
  const videos: OcwVideo[] = [];
  const videoUrls = new Map<string, string>();
  for (const { slug, data } of raws) {
    if (data.resourcetype !== "Video") continue;
    const title = String(data.title ?? slug).trim();
    const youtube = String(data.video_metadata?.youtube_id ?? "");
    const url = youtube ? `https://www.youtube.com/watch?v=${youtube}` : "";
    if (url) videoUrls.set(slugOf(slug), url);
    // OCW often lists one video under several resources: keep the first.
    if (url && videos.some((v) => v.url === url)) continue;
    const lecture = title.match(/^lecture\s+(\d+)\b/i)?.[1];
    const linked = (Array.isArray(data.video_files?.video_transcript_resources) ? data.video_files.video_transcript_resources : [])
      .map((t: any) => slugByFile.get(basename(String(t?.file ?? ""))))
      .find(Boolean);
    const related = [...String(data.related_resources_text ?? "").matchAll(/resources\/([^/)\s]+)/g)]
      .map((m) => slugOf(m[1]!))
      .filter((r) => pdfSlugs.has(r));
    videos.push({
      title,
      url,
      transcript: linked ?? (lecture ? transcriptByLecture.get(lecture) : undefined),
      related,
    });
  }
  videos.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
  const pages: OcwPage[] = [];
  const walk = (rel: string) => {
    const here = join(dir, "pages", rel);
    const dataPath = join(here, "data.json");
    if (existsSync(dataPath)) {
      try {
        const page = readJson(dataPath);
        const markdown = htmlToMarkdown(String(page.content ?? ""), pdfSlugs, videoUrls);
        if (rel && markdown.trim()) pages.push({ name: rel.replaceAll("/", "-").replaceAll("\\", "-"), title: String(page.title ?? rel), markdown });
      } catch {}
    }
    for (const e of readdirSync(here, { withFileTypes: true })) if (e.isDirectory()) walk(rel ? `${rel}/${e.name}` : e.name);
  };
  if (existsSync(join(dir, "pages"))) walk("");
  pages.sort((a, b) => a.name.localeCompare(b.name));

  const sitePath = String(meta.site_url_path ?? "").replace(/^\/+|\/+$/g, "");
  return {
    dir,
    number: String(meta.primary_course_number ?? meta.site_short_id ?? ""),
    title: String(meta.course_title ?? ""),
    term: [meta.term, meta.year].filter(Boolean).join(" "),
    instructors: (Array.isArray(meta.instructors) ? meta.instructors : []).map((i: any) => String(i?.title ?? "")).filter(Boolean),
    url: sitePath ? `https://ocw.mit.edu/${sitePath}/` : "",
    license: String(raws.find((r) => r.data.license)?.data.license ?? ""),
    files,
    pages,
    videos,
  };
}

function slugOf(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", ndash: "–", mdash: "—", hellip: "…", times: "×", minus: "−", deg: "°",
  middot: "·", eacute: "é", uuml: "ü", ouml: "ö", auml: "ä",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** OCW page HTML to Markdown. Links to PDFs in the export become their path under ocw/files/, links to videos their YouTube URL. */
export function htmlToMarkdown(html: string, pdfSlugs: Set<string>, videoUrls = new Map<string, string>()): string {
  const link = (attrs: string, label: string) => {
    const href = decode(attrs.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
    const raw = href.match(/resources\/([^/?#"']+)/i)?.[1];
    const slug = raw ? slugOf(raw) : undefined;
    if (slug && pdfSlugs.has(slug)) return `${label} (\`ocw/files/${slug}.pdf\`)`;
    if (slug && videoUrls.has(slug)) return `${label} (${videoUrls.get(slug)})`;
    if (/^https?:\/\//i.test(href) && !/ocw\.mit\.edu/i.test(href)) return `${label} (${href})`;
    return label;
  };
  const inline = (h: string) =>
    decode(
      h
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_m, attrs: string, label: string) => link(attrs, label.replace(/<[^>]+>/g, "")))
        .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => `\n\n${"#".repeat(Number(n))} `)
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|ul|ol|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .split("\n")
      .map((line) => line.replace(/[ \t ]+/g, " ").trim())
      .join("\n");

  const tables: string[] = [];
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) =>
        [...r[1]!.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((c) =>
          inline(c[2]!).split("\n").filter(Boolean).join("; ").replaceAll("|", "\\|"),
        ),
      )
      .filter((cells) => cells.length && cells.some(Boolean));
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (cells: string[]) => `| ${[...cells, ...Array(width - cells.length).fill("")].join(" | ")} |`;
    const md = [line(rows[0]!), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
    tables.push(md);
    return `\n\n\u0000${tables.length - 1}\u0000\n\n`;
  });
  return inline(withoutTables)
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => tables[Number(i)]!)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The index the level-1 session reads to plan the course. Paths are relative to the course folder. */
export function ocwIndex(course: OcwCourse): string {
  const out: string[] = [];
  out.push(`# OCW ${course.number} ${course.title}${course.term ? `, ${course.term}` : ""}`, "");
  if (course.instructors.length) out.push(`Instructors: ${course.instructors.join(", ")}.`);
  if (course.url) out.push(`Course page: ${course.url}`);
  if (course.license) out.push(`License: ${course.license}`);
  out.push(`Imported from \`${course.dir}\`.`, "");
  out.push(
    "Every PDF of the course is copied to `ocw/files/`. To study from one, add it as a source with `pilearn_scaffold` at level `source`, using its path below. The course pages are in `ocw/pages/` as Markdown. The calendar, readings, and assignments pages usually say which lecture uses which reading and problem set, and the syllabus names the textbook and its edition. When the course has a page per lecture or session, that page lists what belongs together: the video, its transcript, notes, suggested reading, and problems.",
    "",
    "## Pages",
    "",
  );
  for (const p of course.pages) out.push(`- \`ocw/pages/${p.name}.md\`, ${p.title}`);
  for (const kind of KIND_ORDER) {
    const group = course.files.filter((f) => f.kind === kind);
    if (!group.length) continue;
    out.push("", `## ${KIND_TITLE[kind]} (${group.length})`, "", "| File | Title | Description |", "|---|---|---|");
    for (const f of group) out.push(`| \`ocw/files/${f.slug}.pdf\` | ${f.title.replaceAll("|", "\\|")} | ${f.description.slice(0, 140).replaceAll("|", "\\|")} |`);
  }
  if (course.videos.length) {
    out.push(
      "",
      `## Videos (${course.videos.length})`,
      "",
      "Videos can't be read. Each one's transcript is the readable record of what it said. Related is what OCW lists with the video, often the week's lecture notes.",
      "",
      "| Video | Watch | Transcript | Related |",
      "|---|---|---|---|",
    );
    for (const v of course.videos)
      out.push(
        `| ${v.title.replaceAll("|", "\\|")} | ${v.url} | ${v.transcript ? `\`ocw/files/${v.transcript}.pdf\`` : "none"} | ${v.related.map((r) => `\`ocw/files/${r}.pdf\``).join(", ")} |`,
      );
  }
  out.push("");
  return out.join("\n");
}
