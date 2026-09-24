/**
 * pilearn_anki: the Anki bridge (P11): sends error-driven cards to Anki via
 * AnkiConnect and reads review history back as retention numbers (P7).
 * The per-session card cap (P11: 5–8 per lesson) is enforced here, not left to the prompt (P4).
 * Daily intake is Anki's job (deck option "new cards/day"), so creation isn't capped per day.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ANKI_URL = process.env.PILEARN_ANKI_URL || "http://127.0.0.1:8765";
const MODEL = "PILearn";
const MAX_PER_SESSION = 8;
const DAY_MS = 86_400_000;

const Params = Type.Object({
  action: StringEnum(["add", "stats"] as const),
  course: Type.String({ description: "Course title as in course.json; the deck is PILearn::<course>" }),
  chapter: Type.Optional(Type.String({ description: "add: chapter id, used as a tag (e.g. ch01)" })),
  cards: Type.Optional(
    Type.Array(
      Type.Object({
        front: Type.String({ description: "Recall prompt; math as $…$ / $$…$$" }),
        back: Type.String({ description: "Answer with printed page reference; math as $…$ / $$…$$" }),
      }),
      { description: "add: 1–8 atomic cards from this session's missed/partial items only" },
    ),
  ),
});

async function anki(action: string, params: Record<string, unknown> = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(ANKI_URL, { method: "POST", body: JSON.stringify({ action, version: 6, params }) });
  } catch {
    throw new Error("Anki isn't reachable. Open Anki (with the AnkiConnect add-on installed) and try again.");
  }
  const body = (await res.json()) as { result: unknown; error: string | null };
  if (body.error) throw new Error(`AnkiConnect ${action}: ${body.error}`);
  return body.result;
}

function toMathJax(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => `\\[${tex}\\]`)
    .replace(/\$([^$\n]+?)\$/g, (_m, tex) => `\\(${tex}\\)`)
    .replace(/\n/g, "<br>");
}

function tagSafe(s: string): string {
  return s.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_:-]/gu, "");
}

async function ensureModel() {
  const models: string[] = await anki("modelNames");
  if (models.includes(MODEL)) return;
  await anki("createModel", {
    modelName: MODEL,
    inOrderFields: ["Front", "Back"],
    css: ".card { font-family: -apple-system, sans-serif; font-size: 20px; text-align: left; max-width: 40em; margin: auto; }",
    cardTemplates: [{ Name: "Recall", Front: "{{Front}}", Back: "{{FrontSide}}<hr id=answer>{{Back}}" }],
  });
}

function result(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "pilearn_anki",
    label: "Anki",
    description:
      `Anki bridge. add: create recall cards in deck PILearn::<course>, at most ${MAX_PER_SESSION} per session (one call per session). ` +
      "stats: retention for the course's deck from Anki's review history. Requires Anki open with AnkiConnect.",
    parameters: Params,

    async execute(_toolCallId, params) {
      const deck = `PILearn::${params.course}`;

      if (params.action === "add") {
        const cards = params.cards ?? [];
        if (cards.length === 0) return result("No cards to add.");
        if (cards.length > MAX_PER_SESSION) throw new Error(`At most ${MAX_PER_SESSION} cards per session; you sent ${cards.length}. Keep the ${MAX_PER_SESSION} most important misses.`);

        await ensureModel();
        await anki("createDeck", { deck });
        const tags = ["pilearn", tagSafe(params.course), ...(params.chapter ? [tagSafe(params.chapter)] : [])];
        const ids: (number | null)[] = await anki("addNotes", {
          notes: cards.map((c) => ({
            deckName: deck,
            modelName: MODEL,
            fields: { Front: toMathJax(c.front), Back: toMathJax(c.back) },
            tags,
            options: { allowDuplicate: false },
          })),
        });
        const added = ids.filter((id) => id !== null).length;
        const dupes = ids.length - added;
        return result(`Added ${added} card(s) to ${deck}${dupes ? `; ${dupes} skipped as duplicates` : ""}. Anki's new-cards/day setting controls when you see them.`);
      }

      const cardIds: number[] = await anki("findCards", { query: `"deck:${deck}"` });
      if (cardIds.length === 0) return result(`${deck}: no cards yet.`);
      const reviewsByCard: Record<string, number[][]> = await anki("getReviewsOfCards", { cards: cardIds });
      const since = Date.now() - 30 * DAY_MS;
      let reviews = 0;
      let passed = 0;
      let longest = 0;
      for (const entries of Object.values(reviewsByCard)) {
        for (const e of entries as any[]) {
          const [time, , , ease, ivl, , , , type] = Array.isArray(e) ? e : [e.id, 0, 0, e.ease, e.ivl, 0, 0, 0, e.type];
          if (ivl > longest) longest = ivl;
          if (type !== 1 || time < since) continue; // type 1 = review of a learned card
          reviews += 1;
          if (ease > 1) passed += 1;
        }
      }
      const retention = reviews ? `${Math.round((passed / reviews) * 100)}% (${passed}/${reviews} reviews, last 30 days)` : "no reviews of learned cards in the last 30 days";
      return result(`${deck}: ${cardIds.length} cards. Retention: ${retention}. Longest interval: ${longest > 0 ? `${longest} days` : "none yet"}.`);
    },
  });
}
