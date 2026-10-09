/** Put transparent pasted proofs on white without changing their source files. */
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

async function onWhite(data: string): Promise<string | undefined> {
  // Load the same WASM image library Pi uses, only when a pasted image is read.
  const { PhotonImage } = await import("@silvia-odwyer/photon-node");
  const source = PhotonImage.new_from_byteslice(Buffer.from(data, "base64"));
  try {
    const pixels = source.get_raw_pixels();
    let changed = false;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3]!;
      if (alpha === 255) continue;
      changed = true;
      for (let channel = 0; channel < 3; channel++) {
        pixels[i + channel] = Math.round((pixels[i + channel]! * alpha + 255 * (255 - alpha)) / 255);
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

  // Restore only user-submitted clipboard paths when resuming or switching sessions.
  const restore = (_event: unknown, ctx: { sessionManager: { getBranch: () => unknown[] } }) => {
    submitted.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      const record = entry as { type?: string; message?: { role?: string; content?: unknown } };
      if (record.type !== "message" || record.message?.role !== "user") continue;
      const content = record.message.content;
      const text = typeof content === "string" ? content : Array.isArray(content)
        ? content.filter((block) => block.type === "text").map((block) => block.text).join("\n") : "";
      for (const path of clipboardPaths(text)) submitted.add(path);
    }
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
    try {
      const data = await onWhite(image.data);
      if (!data) return;
      const flattened = { ...image, data, mimeType: "image/png" };
      const content = event.content.map((block) => block === image ? flattened : block);
      content.push({ type: "text", text: "Transparent clipboard image placed on white. Original file unchanged." });
      return {
        content,
        structuredContent: { ...flattened, note: content.filter((block) => block.type === "text").map((block) => block.text).join("\n") },
      };
    } catch {
      const message = "Could not place the pasted clipboard image on white. Try copying a screenshot with the paper background included.";
      return { content: [{ type: "text" as const, text: message }], structuredContent: message, isError: true };
    }
  });
}
