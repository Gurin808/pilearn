/**
 * /reader-model: pick the model the chapter-reader uses for PDF reading.
 * Reading math needs image input, so only image-capable models are offered.
 * The choice is stored as a pi-subagents agent override in PILearn's settings
 * (subagents.agentOverrides.chapter-reader.model), which survives reinstalls;
 * with no override, the chapter-reader uses the current chat model.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const AGENT = "chapter-reader";
const USE_CHAT = "Same as the chat model (no override)";

function settingsPath(): string {
  return join(getAgentDir(), "settings.json");
}

async function readSettings(): Promise<Record<string, any>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

async function currentReaderModel(): Promise<string | undefined> {
  const s = await readSettings();
  return s?.subagents?.agentOverrides?.[AGENT]?.model;
}

async function setReaderModel(model: string | undefined): Promise<void> {
  const s = await readSettings();
  const subagents = (s.subagents ??= {});
  const overrides = (subagents.agentOverrides ??= {});
  const entry = (overrides[AGENT] ??= {});
  if (model) entry.model = model;
  else delete entry.model;
  if (Object.keys(entry).length === 0) delete overrides[AGENT];
  if (Object.keys(overrides).length === 0) delete subagents.agentOverrides;
  if (Object.keys(subagents).length === 0) delete s.subagents;
  await writeFile(settingsPath(), JSON.stringify(s, null, 2) + "\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("reader-model", {
    description: "Choose the model the chapter-reader uses to read PDFs (needs image input)",
    handler: async (args, ctx) => {
      const vision = ctx.modelRegistry
        .getAvailable()
        .filter((m: any) => Array.isArray(m.input) && m.input.includes("image"))
        .map((m: any) => `${m.provider}/${m.id}`)
        .sort();
      const current = await currentReaderModel();

      const wanted = args?.trim();
      if (wanted) {
        if (!vision.includes(wanted)) {
          ctx.ui.notify(`"${wanted}" isn't an available image-capable model. Options: ${vision.join(", ") || "none"}`, "error");
          return;
        }
        await setReaderModel(wanted);
        ctx.ui.notify(`PDF reading now uses ${wanted}.`, "info");
        return;
      }

      if (vision.length === 0) {
        ctx.ui.notify("No image-capable model is available. Run /login to connect a provider first.", "error");
        return;
      }
      const options = [USE_CHAT, ...vision.map((id) => (id === current ? `${id}  ◀ current` : id))];
      const choice = await ctx.ui.select(`PDF reading model (current: ${current ?? "chat model"})`, options);
      if (!choice) return;
      const model = choice === USE_CHAT ? undefined : choice.replace(/\s+◀ current$/, "");
      await setReaderModel(model);
      ctx.ui.notify(model ? `PDF reading now uses ${model}.` : "PDF reading now uses the chat model.", "info");
    },
  });
}
