// pilearn videos: turn video lectures into transcripts a course can import.
//
//   pilearn videos <playlist or video URL>... --out <folder> [--lang en]
//
// Runs yt-dlp to list the videos and fetch their captions, preferring captions the
// uploader made over automatic ones, then writes one Markdown transcript per video
// with timestamps, an index.md, and pilearn-videos.json. The learner runs this, not
// the model: PILearn sessions stay offline, and `pilearn_scaffold` level `folder`
// imports the result into a course.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function ytdlp(args) {
  const res = spawnSync("yt-dlp", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (res.error) throw res.error;
  return res;
}

function usage(message) {
  if (message) console.error(`pilearn videos: ${message}`);
  console.error("Usage: pilearn videos <playlist or video URL>... --out <folder> [--lang en]");
  process.exit(1);
}

function clock(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function seconds(stamp) {
  const parts = stamp.split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * WebVTT to timed lines. YouTube's automatic captions roll: each cue repeats the
 * previous line and adds one, with inline word timings. Keeping a line only when it
 * differs from the last kept line removes the repeats and works for plain captions too.
 */
export function parseVtt(vtt) {
  const lines = [];
  let last = "";
  for (const block of vtt.split(/\r?\n\r?\n/)) {
    const time = block.match(/(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s+-->/);
    if (!time) continue;
    const start = seconds(time[0].replace(/\s*-->$/, "").replace(/\.\d+$/, ""));
    const text = block
      .split(/\r?\n/)
      .filter((l) => !/-->/.test(l) && !/^\d+$/.test(l.trim()))
      .map((l) =>
        l
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    for (const line of text) {
      if (line === last || /^\[(music|applause|laughter)\]$/i.test(line)) continue;
      lines.push({ start, text: line });
      last = line;
    }
  }
  return lines;
}

/** Timed lines to paragraphs of about a minute, each opened by its timestamp, with chapter headings. */
export function transcriptMarkdown(lines, chapters = []) {
  const out = [];
  let para = [];
  let paraStart = 0;
  let next = 0;
  const flush = () => {
    if (para.length) out.push(`[${clock(paraStart)}] ${para.join(" ")}`, "");
    para = [];
  };
  for (const line of lines) {
    while (next < chapters.length && chapters[next].start_time <= line.start) {
      flush();
      out.push(`## ${chapters[next].title} [${clock(chapters[next].start_time)}]`, "");
      next++;
    }
    if (!para.length) paraStart = line.start;
    para.push(line.text);
    if (line.start - paraStart >= 60 && /[.?!]$/.test(line.text)) flush();
    else if (line.start - paraStart >= 75) flush();
  }
  flush();
  return out.join("\n");
}

function listVideos(url) {
  const res = ytdlp(["-J", "--flat-playlist", url]);
  if (res.status !== 0) throw new Error(`yt-dlp couldn't read ${url}: ${res.stderr.trim().split("\n").pop()}`);
  const info = JSON.parse(res.stdout);
  if (Array.isArray(info.entries)) {
    return info.entries.map((e) => ({ id: e.id, title: e.title, url: e.url?.startsWith("http") ? e.url : `https://www.youtube.com/watch?v=${e.id}` }));
  }
  return [{ id: info.id, title: info.title, url: info.webpage_url || url }];
}

function fetchVideo(video, lang, work) {
  const res = ytdlp(["-J", "--skip-download", video.url]);
  if (res.status !== 0) return { ...video, captions: "unavailable", lines: [], chapters: [] };
  const info = JSON.parse(res.stdout);
  const pick = (tracks) => Object.keys(tracks || {}).find((k) => k === lang || k === `${lang}-orig` || k.startsWith(`${lang}-`));
  const manual = pick(info.subtitles);
  const auto = manual ? undefined : pick(info.automatic_captions);
  const base = {
    ...video,
    title: info.title || video.title,
    url: info.webpage_url || video.url,
    duration: info.duration || 0,
    chapters: Array.isArray(info.chapters) ? info.chapters : [],
  };
  if (!manual && !auto) return { ...base, captions: "none", lines: [] };
  const track = manual || auto;
  const dir = mkdtempSync(join(work, "v-"));
  ytdlp(["--skip-download", manual ? "--write-subs" : "--write-auto-subs", "--sub-langs", track, "--sub-format", "vtt", "-o", join(dir, "%(id)s"), video.url]);
  const file = readdirSync(dir).find((f) => f.endsWith(".vtt"));
  const lines = file ? parseVtt(readFileSync(join(dir, file), "utf8")) : [];
  return { ...base, captions: manual ? "by the uploader" : "automatic", lines };
}

export function main(args) {
  const urls = [];
  let out;
  let lang = "en";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") out = args[++i];
    else if (args[i] === "--lang") lang = args[++i];
    else if (args[i] === "-h" || args[i] === "--help") usage();
    else urls.push(args[i]);
  }
  if (!urls.length) usage("give at least one playlist or video URL.");
  if (!out) usage("give the folder to write to with --out.");
  const probe = spawnSync("yt-dlp", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0)
    usage("needs yt-dlp. Install it with `brew install yt-dlp` (macOS), `winget install yt-dlp` (Windows), or `pipx install yt-dlp`.");

  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "pilearn-videos-"));
  const videos = urls.flatMap(listVideos);
  const done = [];
  try {
    videos.forEach((video, i) => {
      const n = String(i + 1).padStart(2, "0");
      process.stdout.write(`[${n}/${videos.length}] ${video.title} ... `);
      const v = fetchVideo(video, lang, work);
      const file = `video${n}.md`;
      if (v.lines.length) {
        const head = `# ${v.title}\n\nVideo: ${v.url}\nCaptions: ${v.captions}. Timestamps are [minutes:seconds] into the video.\n\n`;
        writeFileSync(join(dir, file), head + transcriptMarkdown(v.lines, v.chapters) + "\n");
      }
      done.push({ index: i + 1, id: v.id, title: v.title, url: v.url, duration: v.duration, captions: v.captions, file: v.lines.length ? file : null });
      console.log(v.lines.length ? `${v.captions} captions` : "no captions");
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const table = done.map(
    (v) => `| ${v.index} | ${v.title.replaceAll("|", "\\|")} | ${v.duration ? clock(v.duration) : ""} | ${v.url} | ${v.file ? `\`${v.file}\`` : "none"} | ${v.captions} |`,
  );
  writeFileSync(
    join(dir, "index.md"),
    `# Video transcripts\n\nFrom ${urls.join(", ")}. Made by \`pilearn videos\`.\n\n| # | Video | Length | Watch | Transcript | Captions |\n|---|---|---|---|---|---|\n${table.join("\n")}\n`,
  );
  writeFileSync(join(dir, "pilearn-videos.json"), JSON.stringify({ sources: urls, videos: done }, null, 2) + "\n");
  const missing = done.filter((v) => !v.file).length;
  console.log(`\nWrote ${done.length - missing} transcripts to ${dir}${missing ? `; ${missing} videos had no ${lang} captions` : ""}.`);
  console.log(`Add them to a course with /add-course, giving this folder.`);
}
