/**
 * pilearn_wiki: PILearn's only network access, limited to Wikipedia and Wikidata.
 * Used for historical context (the `historical-context` skill, /history): who
 * discovered what, the experiment or problem behind it, and how people connect
 * (doctoral advisors and students, teachers, influences, collaborators).
 *
 *   search  <terms>            matching article titles with a snippet
 *   article <title> [section]  plain-text intro + section list, or one section
 *   people  <title>            Wikidata facts on a person: dates, advisors,
 *                              students, teachers, influences, employers, fields
 *
 * Hosts are fixed (<lang>.wikipedia.org, www.wikidata.org), so this can't be used
 * to reach anything else.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const UA = `PILearn/${process.env.PILEARN_VERSION ?? "dev"} (learning tool; historical context)`;
const MAX_CHARS = 8000;

const PERSON_PROPS: Record<string, string> = {
  P569: "born",
  P570: "died",
  P19: "place of birth",
  P27: "citizenship",
  P69: "educated at",
  P184: "doctoral advisor",
  P185: "doctoral students",
  P1066: "student of",
  P802: "students",
  P737: "influenced by",
  P108: "employer",
  P101: "field of work",
  P800: "notable work",
  P166: "awards",
};

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  const timeout = AbortSignal.timeout(20000);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

function wikiApi(lang: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  return `https://${lang}.wikipedia.org/w/api.php?${q}`;
}

function wikidataApi(params: Record<string, string>): string {
  const q = new URLSearchParams({ format: "json", ...params });
  return `https://www.wikidata.org/w/api.php?${q}`;
}

function text(s: string, details?: unknown) {
  return { content: [{ type: "text" as const, text: s }], details };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
}

async function page(lang: string, title: string, signal?: AbortSignal) {
  const data = await getJson(
    wikiApi(lang, {
      action: "query",
      prop: "extracts|pageprops|info",
      explaintext: "1",
      inprop: "url",
      redirects: "1",
      titles: title,
    }),
    signal,
  );
  const p = data?.query?.pages?.[0];
  if (!p || p.missing) throw new Error(`No ${lang}.wikipedia article titled "${title}". Try action "search" first.`);
  return p as { title: string; extract?: string; fullurl: string; pageprops?: { wikibase_item?: string } };
}

function sections(extract: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const re = /^(={2,})\s*(.+?)\s*\1\s*$/gm;
  let last = { title: "(intro)", start: 0 };
  let m: RegExpExecArray | null;
  while ((m = re.exec(extract))) {
    out.push({ title: last.title, body: extract.slice(last.start, m.index).trim() });
    last = { title: m[2], start: m.index + m[0].length };
  }
  out.push({ title: last.title, body: extract.slice(last.start).trim() });
  return out;
}

function clip(s: string): string {
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n[… cut at ${MAX_CHARS} characters]` : s;
}

function claimValue(c: any): { id?: string; text?: string } {
  const v = c?.mainsnak?.datavalue?.value;
  if (!v) return {};
  if (typeof v === "object" && v.id) return { id: v.id };
  if (typeof v === "object" && v.time) return { text: String(v.time).replace(/^\+/, "").replace(/T.*$/, "").replace(/-00/g, "") };
  if (typeof v === "string") return { text: v };
  return {};
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "pilearn_wiki",
    label: "Wikipedia",
    description:
      "Look up history on Wikipedia and Wikidata. This is PILearn's only internet access; no other site is reachable. " +
      "search finds article titles. article returns an article's intro and section list, or the text of one section. " +
      "people returns Wikidata facts about a person: dates, doctoral advisors and students, teachers, influences, employers. " +
      "Use it for people, discoveries, and experiments, never for the subject itself, which comes from the book.",
    parameters: Type.Object({
      action: StringEnum(["search", "article", "people"] as const),
      query: Type.String({ description: "search: search terms. article/people: the exact article title (from search)." }),
      section: Type.Optional(Type.String({ description: "article only: a section title from the section list, e.g. \"Early life\"." })),
      lang: Type.Optional(Type.String({ description: "Wikipedia language code, default \"en\" (e.g. \"de\", \"fr\")." })),
    }),
    async execute(_id, params, signal) {
      const lang = (params.lang ?? "en").toLowerCase();
      if (!/^[a-z]{2,3}(-[a-z]+)?$/.test(lang)) throw new Error(`Invalid language code "${params.lang}".`);

      if (params.action === "search") {
        const data = await getJson(
          wikiApi(lang, { action: "query", list: "search", srsearch: params.query, srlimit: "8" }),
          signal,
        );
        const hits: any[] = data?.query?.search ?? [];
        if (!hits.length) return text(`No ${lang}.wikipedia results for "${params.query}".`);
        return text(hits.map((h) => `- ${h.title}: ${stripHtml(h.snippet)}`).join("\n"));
      }

      const p = await page(lang, params.query, signal);

      if (params.action === "article") {
        const secs = sections(p.extract ?? "");
        if (params.section) {
          const want = params.section.toLowerCase();
          const hit = secs.find((s) => s.title.toLowerCase() === want) ?? secs.find((s) => s.title.toLowerCase().includes(want));
          if (!hit) return text(`No section "${params.section}" in ${p.title}. Sections: ${secs.map((s) => s.title).join(", ")}`);
          return text(`${p.title}, section "${hit.title}"\nSource: ${p.fullurl}\n\n${clip(hit.body)}`);
        }
        const list = secs.slice(1).filter((s) => s.body).map((s) => s.title);
        return text(`${p.title}\nSource: ${p.fullurl}\n\n${clip(secs[0]?.body ?? "")}\n\nSections: ${list.join(", ")}`);
      }

      // people
      const qid = p.pageprops?.wikibase_item;
      if (!qid) return text(`${p.title} has no Wikidata entry. Source: ${p.fullurl}`);
      const ent = (await getJson(wikidataApi({ action: "wbgetentities", ids: qid, props: "claims|descriptions", languages: lang }), signal))
        ?.entities?.[qid];
      const found: { label: string; values: { id?: string; text?: string }[] }[] = [];
      const ids = new Set<string>();
      for (const [prop, label] of Object.entries(PERSON_PROPS)) {
        const values = ((ent?.claims?.[prop] ?? []) as any[]).map(claimValue).filter((v) => v.id || v.text).slice(0, 15);
        values.forEach((v) => v.id && ids.add(v.id));
        if (values.length) found.push({ label, values });
      }
      const names = new Map<string, string>();
      const all = [...ids];
      for (let i = 0; i < all.length; i += 50) {
        const data = await getJson(
          wikidataApi({ action: "wbgetentities", ids: all.slice(i, i + 50).join("|"), props: "labels", languages: `${lang}|en` }),
          signal,
        );
        for (const [id, e] of Object.entries<any>(data?.entities ?? {})) {
          names.set(id, e?.labels?.[lang]?.value ?? e?.labels?.en?.value ?? id);
        }
      }
      const desc = ent?.descriptions?.[lang]?.value;
      const lines = found.map((f) => `- ${f.label}: ${f.values.map((v) => (v.id ? names.get(v.id) ?? v.id : v.text)).join("; ")}`);
      return text(
        `${p.title}${desc ? ` (${desc})` : ""}\nSources: ${p.fullurl} · https://www.wikidata.org/wiki/${qid}\n\n${lines.join("\n") || "No person data on Wikidata."}`,
      );
    },
  });
}
