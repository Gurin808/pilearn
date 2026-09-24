/**
 * Tells the model today's date. Pi doesn't put it in the system prompt, and with
 * `bash` disabled the model can't look it up, but progress logs, session file
 * names (sessions/YYYY-MM-DD-chNN.md), and spaced recall all need it.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
    return { systemPrompt: `${event.systemPrompt}\n\nToday's date: ${today()} (${weekday}). Use it for every date you log.` };
  });
}
