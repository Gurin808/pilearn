import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Focusable, type KeybindingsManager, type TUI } from "@earendil-works/pi-tui";
import { snippetReference } from "./snippets.ts";

const entries = snippetReference.map((entry) => ({
  entry,
  search: [entry.trigger, entry.description, entry.mode, entry.key, entry.replacement, entry.pattern].join(" ").toLowerCase(),
}));

export function searchSnippets(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return snippetReference;
  const words = needle.split(/\s+/);
  const score = (trigger: string) => trigger === needle ? 0 : trigger.startsWith(needle) ? 1 : 2;
  return entries.filter(({ search }) => words.every((word) => search.includes(word)))
    .map(({ entry }) => entry)
    .sort((a, b) => score(a.trigger.toLowerCase()) - score(b.trigger.toLowerCase()));
}

export class LatexReference implements Focusable {
  private readonly input = new Input({ prompt: "Find: ", placeholder: "try theta, fraction, or pmat" });
  private results = snippetReference;
  private selected = 0;

  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly keys: KeybindingsManager;
  private readonly close: () => void;

  constructor(tui: TUI, theme: Theme, keys: KeybindingsManager, close: () => void, query: string) {
    this.tui = tui;
    this.theme = theme;
    this.keys = keys;
    this.close = close;
    this.setQuery(query);
  }

  get focused() { return this.input.focused; }
  set focused(value: boolean) { this.input.focused = value; }

  private get pageSize() { return Math.max(1, Math.min(12, (this.tui.terminal.rows ?? 24) - 11)); }

  private setQuery(query: string) {
    this.input.setValue(query);
    this.updateResults();
  }

  private updateResults() {
    this.results = searchSnippets(this.input.getValue());
    this.selected = 0;
  }

  handleInput(data: string) {
    if (this.keys.matches(data, "tui.select.cancel") || matchesKey(data, "escape")) {
      this.close();
      return;
    }
    if (matchesKey(data, "ctrl+f")) this.setQuery("");
    else if (this.keys.matches(data, "tui.select.up")) this.selected--;
    else if (this.keys.matches(data, "tui.select.down")) this.selected++;
    else if (this.keys.matches(data, "tui.select.pageUp")) this.selected -= this.pageSize;
    else if (this.keys.matches(data, "tui.select.pageDown")) this.selected += this.pageSize;
    else {
      const before = this.input.getValue();
      this.input.handleInput(data);
      if (this.input.getValue() !== before) this.updateResults();
    }
    this.selected = Math.max(0, Math.min(this.selected, this.results.length - 1));
    this.tui.requestRender();
  }

  render(width: number) {
    if (width < 8) return [];
    const inside = width - 4;
    const border = (text: string) => this.theme.fg("border", text);
    const row = (content: string) => {
      const line = truncateToWidth(content, inside);
      return `${border("│")} ${line}${" ".repeat(Math.max(0, inside - visibleWidth(line)))} ${border("│")}`;
    };
    const lines = [
      border(`╭${"─".repeat(width - 2)}╮`),
      row(this.theme.fg("accent", "LaTeX shortcuts")),
      row(this.input.render(inside)[0] ?? ""),
    ];
    const first = Math.max(0, Math.min(this.selected - Math.floor(this.pageSize / 2), this.results.length - this.pageSize));
    if (!this.results.length) lines.push(row("No matching snippets"));
    for (const [index, entry] of this.results.slice(first, first + this.pageSize).entries()) {
      const selected = index + first === this.selected;
      const label = entry.description ? `${entry.trigger}  ${entry.description}` : entry.trigger;
      lines.push(row(selected ? this.theme.fg("accent", `› ${label}`) : `  ${label}`));
    }
    const entry = this.results[this.selected];
    if (entry) {
      lines.push(row(this.theme.fg("muted", `${entry.mode} · ${entry.key} · ${this.selected + 1}/${this.results.length}`)));
      const preview = entry.replacement.replace(/\$\{(\d+):([^}]*)\}|\$(\d+)/g, (_, id, value, bare) => `‹${value ?? Number(id ?? bare) + 1}›`);
      const wrapped = wrapTextWithAnsi(preview.replaceAll("\n", " ↵ "), inside);
      for (const part of wrapped.slice(0, 2)) lines.push(row(part));
    }
    lines.push(row(this.theme.fg("dim", "↑↓ browse · Ctrl+F clear search · Esc close")));
    lines.push(border(`╰${"─".repeat(width - 2)}╯`));
    return lines;
  }

  invalidate() { this.input.invalidate(); }
}

export async function openLatexReference(ctx: ExtensionContext, query = "") {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("LaTeX shortcut search requires the interactive terminal", "info");
    return;
  }
  await ctx.ui.custom<void>((tui, theme, keys, done) => new LatexReference(tui, theme, keys, () => done(), query), {
    overlay: true,
    overlayOptions: { anchor: "center", width: "86%", maxHeight: "95%", margin: 1 },
  });
}
