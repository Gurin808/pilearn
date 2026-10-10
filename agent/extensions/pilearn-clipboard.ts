/** Put transparent pasted proofs on chosen paper without changing their source files. */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";

type Background = "white" | "black";

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const canonicalTemp = realpathSync(tmpdir());
const tempRoots = [...new Set([resolve(tmpdir()), canonicalTemp])];
// Pi generates these exact filenames on clipboard paste. Ordinary image paths do not match.
const clipboardPathPattern = new RegExp(
  `(?:${tempRoots.map(escapeRegex).join("|")})${escapeRegex(sep)}pi-clipboard-` +
    `[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\\.(?:png|webp|gif)(?=$|[\\s"'\x60])`,
  "gi",
);

function clipboardPaths(text: string): string[] {
  return [...text.matchAll(clipboardPathPattern)].map((match) => resolve(canonicalTemp, basename(match[0])));
}

async function onBackground(data: string, background: Background): Promise<string | undefined> {
  // Load the same WASM image library Pi uses, only when a pasted image is read.
  const { PhotonImage } = await import("@silvia-odwyer/photon-node");
  const source = PhotonImage.new_from_byteslice(Buffer.from(data, "base64"));
  try {
    const pixels = source.get_raw_pixels();
    const paper = background === "white" ? 255 : 0;
    let changed = false;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3]!;
      if (alpha === 255) continue;
      changed = true;
      for (let channel = 0; channel < 3; channel++) {
        pixels[i + channel] = Math.round((pixels[i + channel]! * alpha + paper * (255 - alpha)) / 255);
      }
      pixels[i + 3] = 255;
    }
    if (!changed) return undefined; // Opaque images keep their original bytes and format.
    const flattened = new PhotonImage(pixels, source.get_width(), source.get_height());
    try {
      return Buffer.from(flattened.get_bytes()).toString("base64");
    } finally {
      flattened.free();
    }
  } finally {
    source.free();
  }
}

export default function (pi: ExtensionAPI) {
  const submitted = new Set<string>();
  const preferencePath = join(getAgentDir(), "clipboard.json");
  let background: Background = "white";
  const showBackground = (ctx: ExtensionContext) => {
    if (ctx.hasUI) ctx.ui.setStatus("clipboard-background", `clipboard background: ${background}`);
  };
  const readBackground = async (): Promise<Background> => {
    try {
      const saved = JSON.parse(await readFile(preferencePath, "utf8"));
      if (saved?.background !== "white" && saved?.background !== "black") throw new Error("Invalid background");
      return saved.background;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "white";
      throw error;
    }
  };

  pi.registerCommand("clipboard-background", {
    description: "Choose white or black paper for transparent pasted images, or toggle between them",
    getArgumentCompletions: (prefix) => {
      const matches = ["white", "black", "toggle"].filter((choice) => choice.startsWith(prefix));
      return matches.length ? matches.map((choice) => ({ value: choice, label: choice })) : null;
    },
    handler: async (args, ctx) => {
      const choice = args.trim().toLowerCase();
      if (!choice) {
        showBackground(ctx);
        ctx.ui.notify(`Clipboard background is ${background}. Use /clipboard-background white, black, or toggle.`, "info");
        return;
      }
      if (choice !== "white" && choice !== "black" && choice !== "toggle") {
        ctx.ui.notify("Use /clipboard-background white, black, or toggle.", "warning");
        return;
      }
      try {
        await withFileMutationQueue(preferencePath, async () => {
          const next = choice === "toggle" ? (await readBackground() === "white" ? "black" : "white") : choice;
          const temp = `${preferencePath}.${randomUUID()}.tmp`;
          await mkdir(dirname(preferencePath), { recursive: true });
          try {
            await writeFile(temp, JSON.stringify({ background: next }, null, 2) + "\n", { mode: 0o600 });
            await rename(temp, preferencePath);
          } finally {
            await rm(temp, { force: true });
          }
          background = next;
          showBackground(ctx);
          ctx.ui.notify(`Clipboard background saved as ${background}. It applies on the next image read.`, "info");
        });
      } catch {
        ctx.ui.notify("Could not save the clipboard background. The current choice is unchanged.", "error");
      }
    },
  });

  // Restore only user-submitted clipboard paths when resuming or switching sessions.
  const restore = async (_event: unknown, ctx: ExtensionContext) => {
    submitted.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      const record = entry as { type?: string; message?: { role?: string; content?: unknown } };
      if (record.type !== "message" || record.message?.role !== "user") continue;
      const content = record.message.content;
      const text = typeof content === "string" ? content : Array.isArray(content)
        ? content.filter((block) => block.type === "text").map((block) => block.text).join("\n") : "";
      for (const path of clipboardPaths(text)) submitted.add(path);
    }
    try {
      background = await readBackground();
    } catch {
      background = "white";
      ctx.ui.notify("Could not load the saved clipboard background. Using white.", "warning");
    }
    showBackground(ctx);
  };
  pi.on("session_start", restore);
  pi.on("session_switch", restore);
  pi.on("input", (event) => {
    if (event.source !== "extension") {
      for (const path of clipboardPaths(event.text)) submitted.add(path);
    }
    return { action: "continue" };
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "read" || event.isError || typeof event.input.path !== "string") return;
    const path = resolve(ctx.cwd, event.input.path);
    if (!tempRoots.includes(dirname(path)) || !submitted.has(resolve(canonicalTemp, basename(path)))) return;
    const image = event.content.find((block) => block.type === "image" && ["image/png", "image/webp", "image/gif"].includes(block.mimeType));
    if (!image || image.type !== "image") return;
    const paper = background;
    try {
      const data = await onBackground(image.data, paper);
      if (!data) return;
      const flattened = { ...image, data, mimeType: "image/png" };
      const content = event.content.map((block) => block === image ? flattened : block);
      content.push({ type: "text", text: `Transparent clipboard image placed on ${paper}. Original file unchanged.` });
      return {
        content,
        structuredContent: { ...flattened, note: content.filter((block) => block.type === "text").map((block) => block.text).join("\n") },
      };
    } catch {
      const message = `Could not place the pasted clipboard image on ${paper}. Try copying a screenshot with the paper background included.`;
      return { content: [{ type: "text" as const, text: message }], structuredContent: message, isError: true };
    }
  });
}
