/**
 * PILearn session header: a persistent status panel (model, directory,
 * session, system, tools/agents, recent activity, workflows) shown above
 * the input, built on the documented `ctx.ui.setHeader()` extension API.
 * Layout and helper functions adapted from Feynman's `research-tools/header.ts`.
 * Lowercase lettering follows Feynman's logo.mjs. The enlarged pi mark keeps
 * Pi's pixel layout and brand colors. See THIRD_PARTY_NOTICES.md for licenses.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { cpus, homedir, totalmem } from "node:os";
import { join, relative, resolve as resolvePath, sep } from "node:path";

import type { ExtensionAPI, ExtensionContext, Theme as PiTheme } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { rgbColor, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const PILEARN_VERSION = process.env.PILEARN_VERSION ?? "dev";

// Pi's fixed brand colors, independent of the surrounding terminal theme.
const PI_CORAL = rgbColor(228, 138, 122);
const PI_BLUE = rgbColor(79, 142, 179);
const PI_YELLOW = rgbColor(234, 182, 93);
const PILEARN_LOGO_WIDTH = 76;
const LEARN_LOGO = [
  "███",
  "███",
  "███       ██████     ███████    ███ ████   ███ █████ ",
  "███     ███   ███          ███  ████   ██  ████   ███",
  "███     ██████████   █████████  ███        ███    ███",
  "███     ███         ███    ███  ███        ███    ███",
  " █████    ███████    ██████ ██  ███        ███    ███",
];

export function renderPilearnLogo(theme: Pick<PiTheme, "fg" | "style">, width: number): string[] {
  const coral = (text: string) => theme.style(text, { fg: PI_CORAL });
  const blue = (text: string) => theme.style(text, { fg: PI_BLUE });
  const yellow = (text: string) => theme.style(text, { fg: PI_YELLOW });
  if (width < PILEARN_LOGO_WIDTH) {
    if (width < 1) return [];
    return [truncateToWidth(coral("p") + yellow("i") + theme.fg("text", "learn"), width, "")];
  }

  // Fivefold scaling of Pi's 4 by 4 pixel mark. Half blocks preserve square
  // pixels where a color boundary falls halfway through a terminal row.
  const top = coral("███████████████") + "     ";
  const elbow = theme.style("▀▀▀▀▀", { fg: PI_CORAL, bg: PI_BLUE }) + coral("▀▀▀▀▀█████") + "     ";
  const bowl = blue("█████") + "     " + coral("█████") + "     ";
  const middle = blue("██████████") + "     " + yellow("█████");
  const taper = blue("█████▀▀▀▀▀") + "     " + yellow("█████");
  const stem = blue("█████") + "          " + yellow("█████");
  const mark = [top, top, elbow, bowl, bowl, middle, middle, taper, stem, stem];

  // The lowercase bodies share the yellow i's height and baseline. Only l ascends.
  return mark.map((line, row) => line + "   " + theme.fg("text", (LEARN_LOGO[row - 3] ?? "").padEnd(53)));
}

function visibleLength(text: string): number {
  return visibleWidth(text);
}

function formatHeaderPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function truncateVisible(text: string, maxVisible: number): string {
  if (visibleWidth(text) <= maxVisible) return text;
  return truncateToWidth(text, maxVisible, maxVisible <= 3 ? "" : "...");
}

function wrapWords(text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (let word of words) {
    if (visibleWidth(word) > maxW) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      word = truncateToWidth(word, maxW, maxW > 3 ? "…" : "");
    }
    const test = cur ? `${cur} ${word}` : word;
    if (cur && visibleWidth(test) > maxW) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function padRight(text: string, width: number): string {
  const clipped = truncateVisible(text, width);
  const gap = Math.max(0, width - visibleLength(clipped));
  return `${clipped}${" ".repeat(gap)}`;
}

function levelLabel(cwd: string): string {
  const ws = process.env.PILEARN_WORKSPACE || join(homedir(), "study");
  const rel = relative(ws, cwd);
  if (rel === "") return "1 \u00b7 curriculum";
  const parts = rel.split(sep);
  if (parts[0] !== "courses" || rel.startsWith("..")) return "outside workspace";
  if (parts.length === 2) return `2 \u00b7 course ${parts[1]}`;
  if (parts.length === 4 && parts[2] === "chapters") return `3 \u00b7 chapter ${parts[3]}`;
  return `2 \u00b7 course ${parts[1]}`;
}

function getCurrentModelLabel(ctx: ExtensionContext): string {
  if (ctx.model) return `${ctx.model.provider}/${ctx.model.id}`;
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index]!;
    if (entry.type === "model_change") return `${(entry as any).provider}/${(entry as any).modelId}`;
  }
  return "not set";
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { type?: string; text?: unknown; name?: unknown };
      if (record.type === "text" && typeof record.text === "string") return record.text;
      if (record.type === "toolCall") return `[${typeof record.name === "string" ? record.name : "tool"}]`;
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function getRecentActivitySummary(ctx: ExtensionContext): string {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index]!;
    if (entry.type !== "message") continue;
    const msg = entry as any;
    const text = extractMessageText(msg.message).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const role = msg.message.role === "assistant" ? "agent" : msg.message.role === "user" ? "you" : msg.message.role;
    return `${role}: ${text}`;
  }
  return "";
}

async function readerModelLabel(): Promise<string> {
  try {
    const s = JSON.parse(await readFile(join(getAgentDir(), "settings.json"), "utf8"));
    return s?.subagents?.agentOverrides?.["chapter-reader"]?.model ?? "chat model (set with /reader-model)";
  } catch {
    return "chat model (set with /reader-model)";
  }
}

async function buildAgentCatalogSummary(): Promise<{ agents: string[]; chains: string[] }> {
  const agents: string[] = [];
  const chains: string[] = [];
  try {
    const entries = await readdir(resolvePath(getAgentDir(), "agents"), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (entry.name.endsWith(".chain.md")) {
        chains.push(entry.name.replace(/\.chain\.md$/i, ""));
      } else {
        agents.push(entry.name.replace(/\.md$/i, ""));
      }
    }
  } catch {
    return { agents: [], chains: [] };
  }
  agents.sort();
  chains.sort();
  return { agents, chains };
}

let cachedResources: { cores: number; ramTotal: string } | null = null;

function detectSystemResources(): { cores: number; ramTotal: string } {
  if (cachedResources) return cachedResources;
  cachedResources = {
    cores: cpus().length,
    ramTotal: `${Math.round(totalmem() / 1024 ** 3)}GB`,
  };
  return cachedResources;
}

type ChapterNode = { id: string; prepared: boolean };
type CourseNode = { id: string; title?: string; chapters: ChapterNode[] };
type StudyTree = { root: string; courses: CourseNode[]; course?: string; chapter?: string };

function workspaceDir(): string {
  return process.env.PILEARN_WORKSPACE || join(homedir(), "study");
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function buildStudyTree(cwd: string): Promise<StudyTree | null> {
  const ws = workspaceDir();
  if (!existsSync(ws)) return null;
  const rel = relative(ws, cwd);
  const parts = rel && !rel.startsWith("..") ? rel.split(sep) : [];
  const course = parts[0] === "courses" ? parts[1] : undefined;
  const chapter = course && parts[2] === "chapters" ? parts[3] : undefined;

  const courses: CourseNode[] = [];
  for (const id of await subdirs(join(ws, "courses"))) {
    const dir = join(ws, "courses", id);
    const chapters = (await subdirs(join(dir, "chapters"))).map((id) => ({
      id,
      prepared: existsSync(join(dir, "chapters", id, "digest.md")),
    }));
    let title: string | undefined;
    try {
      title = JSON.parse(await readFile(join(dir, "course.json"), "utf8")).title;
    } catch {}
    courses.push({ id, title, chapters });
  }
  return { root: formatHeaderPath(ws), courses, course, chapter };
}

type Theme = { fg: (token: any, text: string) => string; bold: (text: string) => string };
type TreeLine = { plain: string; styled: string };

export function renderStudyTree(tree: StudyTree, theme: Theme): TreeLine[] {
  const lines: TreeLine[] = [];
  const add = (branch: string, label: string, styled: string) =>
    lines.push({ plain: branch + label, styled: theme.fg("borderMuted", branch) + styled });
  const here = (text: string) => theme.fg("accent", theme.bold(text));

  add("", `${tree.root}/`, theme.fg("dim", `${tree.root}/`));
  add("├─ ", "courses/", theme.fg("text", "courses/"));
  tree.courses.forEach((course, ci) => {
    const lastCourse = ci === tree.courses.length - 1;
    const isHere = course.id === tree.course;
    const label = `${course.id}/${isHere ? " ◀" : ""}`;
    add(`│  ${lastCourse ? "└─ " : "├─ "}`, label, isHere ? here(label) : theme.fg("text", label));
    if (course.title && course.title !== course.id) add(`│  ${lastCourse ? "   " : "│  "}`, course.title, theme.fg("dim", course.title));
    if (!isHere) return;
    course.chapters.forEach((ch, i) => {
      const branch = `│  ${lastCourse ? "   " : "│  "}${i === course.chapters.length - 1 ? "└─ " : "├─ "}`;
      const isCurrent = ch.id === tree.chapter;
      const label = `${ch.id}${isCurrent ? " ◀" : ""}`;
      add(branch, label, isCurrent ? here(label) : theme.fg(ch.prepared ? "text" : "dim", label));
    });
  });
  if (tree.courses.length === 0) add("│  └─ ", "(no courses yet)", theme.fg("dim", "(no courses yet)"));
  add("└─ ", "aggregate/", theme.fg("text", "aggregate/"));
  if (tree.course) {
    lines.push({ plain: "", styled: "" });
    const legend = "Dim units have no digest.";
    lines.push({ plain: legend, styled: theme.fg("dim", legend) });
  }
  return lines;
}

type WorkflowInfo = { name: string; description: string };

function getWorkflows(pi: ExtensionAPI): WorkflowInfo[] {
  const own = [join(getAgentDir(), "prompts"), join(getAgentDir(), "extensions")];
  return pi
    .getCommands()
    .filter((cmd) => cmd.source !== "skill" && own.some((dir) => cmd.sourceInfo?.path?.startsWith(dir)))
    .map((cmd) => ({ name: `/${cmd.name}`, description: cmd.description ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function (pi: ExtensionAPI) {
  const cache: { agentSummaryPromise?: Promise<{ agents: string[]; chains: string[] }> } = {};

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    cache.agentSummaryPromise ??= buildAgentCatalogSummary();
    const agentData = await cache.agentSummaryPromise;
    const resources = detectSystemResources();
    const workflows = getWorkflows(pi);
    const toolCount = pi.getAllTools().length;
    const agentCount = agentData.agents.length + agentData.chains.length;
    const activitySnapshot = getRecentActivitySummary(ctx);
    const studyTree = await buildStudyTree(ctx.cwd);
    const readerModel = await readerModelLabel();

    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number): string[] {
        const TREE_GAP = 3;
        const treeLines = studyTree ? renderStudyTree(studyTree, theme) : [];
        const treeW = treeLines.length ? Math.min(44, Math.max(width - 2, 1), Math.max(...treeLines.map((l) => visibleWidth(l.plain)))) : 0;
        const maxW = Math.max(width - 2, 1);
        const sideBySide = treeLines.length > 0 && maxW >= PILEARN_LOGO_WIDTH + TREE_GAP + treeW;
        const cardW = sideBySide ? Math.min(maxW - TREE_GAP - treeW, 120) : Math.min(maxW, 120);
        const innerW = cardW - 2;
        const contentW = innerW - 2;
        const groupW = sideBySide ? cardW + TREE_GAP + treeW : cardW;
        const outerPad = " ".repeat(Math.max(0, Math.floor((width - groupW) / 2)));
        const card: string[] = [];
        let boxStart = 0;

        const push = (line: string) => {
          card.push(line);
        };
        const border = (ch: string) => theme.fg("borderMuted", ch);
        const row = (content: string): string => `${border("│")} ${padRight(content, contentW)} ${border("│")}`;

        const useWideLayout = contentW >= 70;
        const leftW = useWideLayout ? Math.min(38, Math.floor(contentW * 0.35)) : 0;
        const divColW = useWideLayout ? 3 : 0;
        const rightW = useWideLayout ? contentW - leftW - divColW : contentW;

        const twoCol = (left: string, right: string): string => {
          if (!useWideLayout) return row(left || right);
          return row(`${padRight(left, leftW)}${border(" │ ")}${padRight(right, rightW)}`);
        };

        const modelLabel = getCurrentModelLabel(ctx);
        const sessionId = ctx.sessionManager.getSessionName()?.trim() || ctx.sessionManager.getSessionId();
        const dirLabel = formatHeaderPath(ctx.cwd);

        push("");
        const logo = renderPilearnLogo(theme, cardW);
        const maxLogoW = Math.max(0, ...logo.map(visibleWidth));
        const logoOffset = " ".repeat(Math.max(0, Math.floor((cardW - maxLogoW) / 2)));
        for (const line of logo) push(logoOffset + line);
        push("");

        boxStart = card.length;
        const versionTag = ` v${PILEARN_VERSION} `;
        const gap = Math.max(0, innerW - versionTag.length);
        const gapL = Math.floor(gap / 2);
        push(border(`╭${"─".repeat(gapL)}`) + theme.fg("dim", versionTag) + border(`${"─".repeat(gap - gapL)}╮`));

        if (useWideLayout) {
          const cmdNameW = 16;
          const descW = Math.max(10, rightW - cmdNameW - 2);
          const leftValueW = Math.max(1, leftW - 11);
          const indent = " ".repeat(11);
          const leftLines: string[] = [""];

          const pushLabeled = (label: string, value: string, color: "text" | "dim") => {
            const wrapped = wrapWords(value, leftValueW);
            leftLines.push(`${theme.fg("dim", label.padEnd(10))} ${theme.fg(color, wrapped[0]!)}`);
            for (let i = 1; i < wrapped.length; i++) {
              leftLines.push(`${indent}${theme.fg(color, wrapped[i]!)}`);
            }
          };

          pushLabeled("model", modelLabel, "text");
          pushLabeled("reader", readerModel, "dim");
          pushLabeled("directory", dirLabel, "text");
          pushLabeled("level", levelLabel(ctx.cwd), "text");
          pushLabeled("session", sessionId, "dim");
          leftLines.push("");
          pushLabeled("system", `${resources.cores} cores · ${resources.ramTotal}`, "dim");
          leftLines.push("");
          leftLines.push(theme.fg("dim", `${toolCount} tools · ${agentCount} agent${agentCount === 1 ? "" : "s"}`));

          const pushList = (heading: string, items: string[]) => {
            if (items.length === 0) return;
            leftLines.push("");
            leftLines.push(theme.fg("accent", theme.bold(heading)));
            for (const line of wrapWords(items.join(", "), leftW)) {
              leftLines.push(theme.fg("dim", line));
            }
          };
          pushList("Agents", agentData.agents);
          pushList("Chains", agentData.chains);

          if (activitySnapshot) {
            const maxActivityLen = leftW * 2;
            const trimmed =
              visibleWidth(activitySnapshot) > maxActivityLen
                ? truncateToWidth(activitySnapshot, maxActivityLen, "…")
                : activitySnapshot;
            leftLines.push("");
            leftLines.push(theme.fg("accent", theme.bold("Last Activity")));
            for (const line of wrapWords(trimmed, leftW)) {
              leftLines.push(theme.fg("dim", line));
            }
          }

          const rightLines: string[] = ["", theme.fg("accent", theme.bold("Workflows"))];
          if (workflows.length === 0) {
            rightLines.push(theme.fg("dim", "none yet. Add prompt templates to"));
            rightLines.push(theme.fg("dim", "agent/prompts/"));
          }
          for (const wf of workflows) {
            const descLines = wrapWords(wf.description, descW);
            for (let index = 0; index < descLines.length; index += 1) {
              const first = index === 0;
              rightLines.push(
                first
                  ? `${theme.fg("accent", padRight(wf.name, cmdNameW))} ${theme.fg("dim", descLines[index]!)}`
                  : `${" ".repeat(cmdNameW)} ${theme.fg("dim", descLines[index]!)}`,
              );
            }
          }

          const maxRows = Math.max(leftLines.length, rightLines.length);
          for (let i = 0; i < maxRows; i++) {
            push(twoCol(leftLines[i] ?? "", rightLines[i] ?? ""));
          }
        } else {
          const narrowValW = Math.max(1, contentW - 11);
          push(row(`${theme.fg("dim", "model".padEnd(10))} ${theme.fg("text", truncateVisible(modelLabel, narrowValW))}`));
          push(row(`${theme.fg("dim", "reader".padEnd(10))} ${theme.fg("dim", truncateVisible(readerModel, narrowValW))}`));
          push(row(`${theme.fg("dim", "directory".padEnd(10))} ${theme.fg("text", truncateVisible(dirLabel, narrowValW))}`));
          push(row(`${theme.fg("dim", "level".padEnd(10))} ${theme.fg("text", truncateVisible(levelLabel(ctx.cwd), narrowValW))}`));
          push(
            row(`${theme.fg("dim", "session".padEnd(10))} ${theme.fg("dim", truncateVisible(sessionId, narrowValW))}`),
          );
          push(
            row(
              theme.fg(
                "dim",
                truncateVisible(`${toolCount} tools · ${agentCount} agents · ${resources.cores} cores · ${resources.ramTotal}`, contentW),
              ),
            ),
          );
        }

        push(border(`╰${"─".repeat(innerW)}╯`));

        const tree = (i: number) => truncateVisible(treeLines[i]!.styled, treeW);
        const fill = (line: string) => line + " ".repeat(Math.max(0, cardW - visibleWidth(line)));
        const lines = card.map((line, i) => {
          const t = i - boxStart;
          return sideBySide && t >= 0 && t < treeLines.length ? `${fill(line)}${" ".repeat(TREE_GAP)}${tree(t)}` : line;
        });
        if (sideBySide) {
          for (let t = card.length - boxStart; t < treeLines.length; t++) lines.push(`${" ".repeat(cardW + TREE_GAP)}${tree(t)}`);
        } else if (treeLines.length) {
          lines.push("");
          for (let t = 0; t < treeLines.length; t++) lines.push(tree(t));
        }
        lines.push("");
        return lines.map((line) => `${outerPad}${line}`);
      },
      invalidate() {},
    }));
  });
}
