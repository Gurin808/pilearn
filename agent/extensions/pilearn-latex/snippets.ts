import defaults from "./vendor/snippets.js";
import variables from "./vendor/variables.js";

type Mode = "text" | "inline" | "display" | "code";
type Context = { mode: Mode; start: number };
export type Stop = { id: number; from: number; to: number };
export type Expansion = { from: number; to: number; text: string; stops: Stop[] };

type Snippet = {
  trigger: string | RegExp;
  replacement: string | ((match: RegExpMatchArray) => string | false);
  options: string;
  priority?: number;
  description?: string;
  excludedMacros?: string[];
};

const delimiters = " \t\n.,+-:;!?\\/{}[]()=~$'\"|`<>*^%#@&";
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const snippets = (defaults as Snippet[]).map((snippet) => {
  const { trigger, options } = snippet;
  const visual = options.includes("v");
  const literal = typeof trigger === "string" && !options.includes("r");
  const source = typeof trigger === "string" ? trigger : trigger.source;
  const pattern = literal ? escapeRegex(source) : source.replace(/\$\{\w+\}/g, (name) => variables[name] ?? name);
  return { ...snippet, source, visual, pattern: new RegExp(`(?:${pattern})(?![\\s\\S])`, typeof trigger === "string" ? "" : trigger.flags) };
});

export type SnippetReference = {
  trigger: string;
  mode: string;
  key: string;
  description: string;
  replacement: string;
  pattern?: string;
};

const shorthand: Record<string, string> = {
  mk: "Inline math",
  dm: "Display math",
  sq: "Square root",
  sr: "Square or superscript 2",
  cb: "Cube or superscript 3",
  "//": "Fraction template",
  par: "Partial derivative",
  brk: "Bra-ket or inner product",
  outer: "Outer product",
};

const regexExamples: Record<string, string> = {
  "([a-zA-Z])hat": "xhat",
  "([a-zA-Z])bar": "xbar",
  "([a-zA-Z])dot": "xdot",
  "([a-zA-Z])ddot": "xddot",
  "([a-zA-Z])vec": "xvec",
  "([a-zA-Z])tilde": "xtilde",
  "([pbBvV]mat)": "pmat / bmat / Bmat / vmat / Vmat",
  "(matrix|cases|array)": "matrix / cases / array",
  "(matrix|cases|align|array)": "matrix / cases / align / array",
  "iden(\\d)": "iden2",
  "par([0-9])": "par2",
  "pa([A-Za-z])([A-Za-z])": "pafy",
  "(\\d)rt": "3rt",
};

export const snippetReference: readonly SnippetReference[] = [
  ...snippets.map(({ source, trigger, options, replacement, description }) => {
    const regex = trigger instanceof RegExp || options.includes("r");
    return {
      trigger: regex && regexExamples[source] ? regexExamples[source] : source,
      mode: options.includes("m") ? "Math" : options.includes("M") ? "Display math" : options.includes("n") ? "Inline math" : "Prose",
      key: options.includes("v") ? "Select then type" : options.includes("A") ? "Automatic" : "Tab",
      description: description ?? shorthand[source] ?? (/^[@:]/.test(source) ? "Greek letter" : ""),
      replacement: typeof replacement === "string" ? replacement : "Computed from what you type",
      pattern: regex ? source : undefined,
    };
  }),
  { trigger: "x/y", mode: "Math", key: "Tab", description: "Turn two operands into a fraction", replacement: "\\frac{x}{y}" },
];

function escaped(text: string, index: number) {
  let from = index;
  while (text[from - 1] === "\\") from--;
  return (index - from) % 2 === 1;
}

function runLength(text: string, index: number) {
  let end = index + 1;
  while (text[end] === text[index]) end++;
  return end - index;
}

export function mathContext(text: string, cursor: number): Context {
  if (/^\s*[!/]/.test(text)) return { mode: "code", start: 0 };
  let mode: Context["mode"] = "text";
  let start = 0;
  let ticks = 0;
  let fence: { char: string; length: number } | undefined;
  for (let i = 0; i < cursor;) {
    if ((i === 0 || text[i - 1] === "\n") && mode !== "display" && ticks === 0) {
      const end = text.indexOf("\n", i);
      const lineEnd = end === -1 ? text.length : end;
      const line = text.slice(i, lineEnd);
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence || marker) {
        if (cursor <= lineEnd) return { mode: "code", start: i };
        if (fence && marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
        else if (!fence && marker) fence = { char: marker[1][0], length: marker[1].length };
        i = lineEnd + 1;
        continue;
      }
    }
    const ch = text[i];
    if (ch === "`" && mode === "text" && (ticks || !escaped(text, i))) {
      const count = runLength(text, i);
      if (i + count > cursor) return { mode: "code", start: i };
      if (ticks === count) ticks = 0;
      else if (!ticks) ticks = count;
      i += count;
      continue;
    }
    if (!ticks && ch === "$" && !escaped(text, i)) {
      const count = runLength(text, i);
      if (count === 1 || count === 2) {
        if (mode === "text") {
          // Stop at the cursor so it can sit between the dollars inserted by mk.
          const width = Math.min(count, cursor - i);
          mode = width === 1 ? "inline" : "display";
          start = i + width;
          i += width;
          continue;
        }
        const width = mode === "inline" ? 1 : 2;
        if (i + width <= cursor && count >= width) {
          mode = "text";
          i += width;
          continue;
        }
      }
      i += count;
      continue;
    }
    if (ch === "\n" && mode === "inline") mode = "text";
    i++;
  }
  return { mode: ticks || fence ? "code" : mode, start };
}

function inMacroArgument(math: string, names: string[]) {
  const stack: (string | undefined)[] = [];
  for (const token of math.matchAll(/\\([a-zA-Z]+)\s*\{|\\[^a-zA-Z\n]|[{}]/g)) {
    if (token[1] || token[0] === "{") stack.push(token[1]);
    if (token[0] === "}") stack.pop();
  }
  return stack.some((name) => name && names.includes(name));
}

export function template(from: number, to: number, replacement: string): Expansion {
  const placeholder = /\$\{(\d+):((?:\\.|[^}])*)\}|\$(\d+)/g;
  const stops: Stop[] = [];
  const defaults = new Map<number, string>();
  for (const match of replacement.matchAll(placeholder)) {
    if (match[1] !== undefined && !defaults.has(Number(match[1]))) defaults.set(Number(match[1]), match[2]);
  }
  let text = "";
  let offset = 0;
  for (const match of replacement.matchAll(placeholder)) {
    text += replacement.slice(offset, match.index);
    const id = Number(match[1] ?? match[3]);
    const start = from + text.length;
    text += defaults.get(id) ?? "";
    stops.push({ id, from: start, to: from + text.length });
    offset = match.index + match[0].length;
  }
  text += replacement.slice(offset);
  if (stops.length && !stops.some((stop) => stop.from === from + text.length && stop.from === stop.to)) {
    stops.push({ id: Math.max(...stops.map((stop) => stop.id)) + 1, from: from + text.length, to: from + text.length });
  }
  return { from, to, text, stops };
}

export function findExpansion(text: string, cursor: number, automatic: boolean): Expansion | undefined {
  const { mode, start } = mathContext(text, cursor);
  if (mode === "code" || (automatic && mode === "text")) return;
  // Keep one character before math so upstream regexes that capture a non-backslash prefix work at the opening delimiter.
  const base = mode === "text" ? text.lastIndexOf("\n", cursor - 1) + 1 : Math.max(0, start - 1);
  const before = text.slice(base, cursor);
  if (mode !== "text" && inMacroArgument(text.slice(start, cursor), ["text", "textrm", "textsf", "texttt", "textbf", "textit", "textup", "textnormal", "mbox", "hbox", "operatorname", "begin", "end", "tag"])) return;
  const candidates = snippets.flatMap((s) => {
    const flags = s.options;
    if (s.visual || flags.includes("A") !== automatic) return [];
    if (mode === "text" ? !flags.includes("t") : !(flags.includes("m") || flags.includes(mode === "display" ? "M" : "n"))) return [];
    const match = before.match(s.pattern);
    if (!match) return [];
    const from = cursor - match[0].length;
    if (flags.includes("w") && (!delimiters.includes(text[from - 1] ?? " ") || !delimiters.includes(text[cursor] ?? " "))) return [];
    return [{ s, match, from }];
  }).sort((a, b) => (b.s.priority ?? 0) - (a.s.priority ?? 0) || b.match[0].length - a.match[0].length);

  for (const { s, match, from } of candidates) {
    if (s.excludedMacros && inMacroArgument(text.slice(start, cursor), s.excludedMacros)) continue;
    let replacement = typeof s.replacement === "string" ? s.replacement : s.replacement(match);
    if (replacement === false) continue;
    // The upstream macro guard claims known macro prefixes without editing them.
    if (replacement === match[0]) return;
    if (mode === "text" && s.source === "dm") {
      const after = text.slice(cursor).split("\n", 1)[0];
      if (after.trim()) return;
      if (text.slice(base, from).trim()) replacement = "\n" + replacement;
    }
    replacement = replacement.replace(/\[\[(\d+)\]\]/g, (_, index) => match[Number(index) + 1] ?? "");
    return template(from, cursor, replacement);
  }
  if (!automatic && mode !== "text") return fraction(text, start, cursor);
}

function fraction(text: string, start: number, end: number): Expansion | undefined {
  // Read a slash and two operands at the cursor, allowing balanced groups.
  const before = text.slice(start, end);
  const pairs: Record<string, string> = { ")": "(", "}": "{", "]": "[" };
  const stack: string[] = [];
  let slash = -1;
  let from = before.length;
  for (; from > 0; from--) {
    const index = from - 1;
    const ch = before[index];
    if (escaped(before, index)) continue;
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (stack.length) { if (ch === stack.at(-1)) stack.pop(); }
    else if (ch === "/" && slash === -1) slash = index;
    else if (/[\s+=,;<>/()[\]{}]/.test(ch) || (ch === "-" && index > 0)) break;
  }
  if (stack.length || slash <= from) return;
  const unwrap = (value: string) => /^\([^()]*\)$/.test(value) ? value.slice(1, -1) : value;
  const numerator = unwrap(before.slice(from, slash));
  const denominator = unwrap(before.slice(slash + 1));
  const prefix = `\\frac{${numerator}}{`;
  const to = start + from + prefix.length;
  return { from: start + from, to: end, text: `${prefix}${denominator}}`, stops: [
    ...(!denominator ? [{ id: 0, from: to, to }, { id: 1, from: to + 1, to: to + 1 }] : []),
  ] };
}

export function visualExpansion(text: string, from: number, to: number, key: string): Expansion | undefined {
  const mode = mathContext(text, from);
  const end = mathContext(text, to);
  if (mode.mode === "text" || mode.mode === "code" || mode.mode !== end.mode || mode.start !== end.start) return;
  const snippet = snippets.find((s) => s.visual && s.trigger === key);
  if (typeof snippet?.replacement !== "string") return;
  // Substitute selection after parsing so literal dollars in a selection cannot create tab stops.
  const marker = "\u0001";
  const result = template(from, to, snippet.replacement.replace("${VISUAL}", marker));
  const offset = result.text.indexOf(marker);
  if (offset < 0) return result;
  const selected = text.slice(from, to);
  for (const stop of result.stops) {
    if (stop.from > from + offset) stop.from += selected.length - 1;
    if (stop.to > from + offset) stop.to += selected.length - 1;
  }
  result.text = result.text.replace(marker, () => selected);
  return result;
}
