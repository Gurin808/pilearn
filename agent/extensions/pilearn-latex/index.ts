import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable, isKeyRelease, matchesKey } from "@earendil-works/pi-tui";
import { findExpansion, mathContext, visualExpansion, type Expansion, type Stop } from "./snippets.ts";

type Frame = { stops: Stop[]; ids: number[]; index: number; fresh: boolean };
const active = (frame: Frame) => frame.stops.find((stop) => stop.id === frame.ids[frame.index]);

export class LatexEditor extends CustomEditor {
  private frames: Frame[] = [];
  private selection?: number;
  private expected?: string;

  private offset() {
    const { line, col } = this.getCursor();
    return this.getLines().slice(0, line).reduce((sum, value) => sum + value.length + 1, col);
  }

  // Pi exposes cursor reads and text replacement but no cursor setter. Keep the
  // compatibility check here so an incompatible Pi falls back to its normal editor.
  private cursorMotion() {
    return (this as unknown as { moveCursor?: (line: number, col: number) => void }).moveCursor;
  }

  private moveTo(target: number) {
    const move = this.cursorMotion();
    let at = this.offset();
    while (at !== target && move) {
      move.call(this, 0, Math.sign(target - at));
      const next = this.offset();
      if (next === at || (at < target ? next > target : next < target)) break;
      at = next;
    }
    this.tui.requestRender();
  }

  private replace(before: string, expansion: Expansion) {
    let { from, to, text, stops } = expansion;
    const frame = this.frames.at(-1);
    const stop = frame && active(frame);
    if (stop && (from < stop.from || to > stop.to)) this.frames = [];
    let result = before;
    const splice = (start: number, end: number, value: string, absorbing: Set<Stop>) => {
      const delta = value.length - (end - start);
      result = result.slice(0, start) + value + result.slice(end);
      for (const f of this.frames) {
        for (const range of f.stops) {
          if (absorbing.has(range)) range.to += delta;
          else if (range.from >= end) { range.from += delta; range.to += delta; }
        }
      }
    };
    const parents = new Set(this.frames.map(active).filter((range): range is Stop => range !== undefined));
    splice(from, to, text, parents);
    let cursor = from + text.length;
    // Mirrored placeholders, such as the two names in begin/end, keep the same text.
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      const primary = active(f);
      if (!primary) continue;
      f.fresh = false;
      const value = result.slice(primary.from, primary.to);
      for (const mirror of f.stops) {
        if (mirror === primary || mirror.id !== primary.id || result.slice(mirror.from, mirror.to) === value) continue;
        const delta = value.length - (mirror.to - mirror.from);
        const endsBeforeCursor = mirror.to <= cursor;
        const endsBeforeExpansion = mirror.to <= from;
        const absorbing = new Set(this.frames.slice(0, i).map(active).filter((range): range is Stop => range !== undefined));
        absorbing.add(mirror);
        splice(mirror.from, mirror.to, value, absorbing);
        if (endsBeforeCursor) cursor += delta;
        if (endsBeforeExpansion) {
          from += delta;
          stops = stops.map((range) => ({ ...range, from: range.from + delta, to: range.to + delta }));
        }
      }
    }
    if (stops.length) {
      const next = { stops, ids: [...new Set(stops.map((range) => range.id))].sort((a, b) => a - b), index: 0, fresh: true };
      this.frames.push(next);
      cursor = active(next)?.from ?? cursor;
    }
    // setText preserves one undo step. Never use it on Pi's collapsed paste
    // markers, since it would lose their backing contents.
    this.setText(result);
    this.expected = this.getText();
    this.moveTo(cursor);
  }

  private nextStop() {
    while (this.frames.length) {
      const frame = this.frames.at(-1)!;
      frame.index++;
      const stop = active(frame);
      if (!stop) { this.frames.pop(); continue; }
      frame.fresh = true;
      this.moveTo(stop.from);
      if (frame.index === frame.ids.length - 1 && stop.from === stop.to) this.frames.pop();
      return true;
    }
    return false;
  }

  override handleInput(data: string): void {
    const before = this.getText();
    if (!this.cursorMotion() || this.getExpandedText() !== before || isKeyRelease(data)) {
      this.frames = [];
      this.selection = undefined;
      return super.handleInput(data);
    }
    if (this.expected !== before) {
      this.frames = [];
      this.selection = undefined;
    }
    this.expected = before;
    const cursor = this.offset();
    const mode = mathContext(before, cursor).mode;
    const inMath = mode === "inline" || mode === "display";
    const char = decodeKittyPrintable(data) ?? (/^[^\p{Cc}\p{Cs}]$/u.test(data) ? data : undefined);
    if (inMath && (matchesKey(data, "shift+left") || matchesKey(data, "shift+right"))) {
      this.frames = [];
      this.selection ??= cursor;
      this.cursorMotion()?.call(this, 0, matchesKey(data, "shift+left") ? -1 : 1);
      this.tui.requestRender();
      return;
    }
    if (this.selection !== undefined && char && this.selection !== cursor) {
      const result = visualExpansion(before, Math.min(this.selection, cursor), Math.max(this.selection, cursor), char);
      this.selection = undefined;
      if (result) return this.replace(before, result);
    }
    this.selection = undefined;

    const frame = this.frames.at(-1);
    const stop = frame && active(frame);
    if (stop && (cursor < stop.from || cursor > stop.to)) this.frames = [];
    const editing = this.frames.length > 0 && frame && stop;
    if (matchesKey(data, "tab")) {
      const result = findExpansion(before, cursor, false);
      if (result && (inMath || !this.isShowingAutocomplete())) return this.replace(before, result);
      if (this.nextStop()) return;
      return super.handleInput(data);
    }

    if (char && inMath) {
      const end = editing && frame.fresh && cursor === stop.from ? stop.to : cursor;
      const trial = before.slice(0, cursor) + char + before.slice(end);
      const result = findExpansion(trial, cursor + char.length, true);
      if (result) {
        return this.replace(before, { ...result, to: end });
      }
      if (editing) return this.replace(before, { from: cursor, to: end, text: char, stops: [] });
    }
    if (editing && matchesKey(data, "backspace")) {
      const end = frame.fresh && cursor === stop.from ? stop.to : cursor;
      const from = cursor > stop.from ? cursor - ([...before.slice(stop.from, cursor)].at(-1)?.length ?? 0) : cursor;
      if (from < end) return this.replace(before, { from, to: end, text: "", stops: [] });
    }
    super.handleInput(data);
    const after = this.getText();
    if (after !== before) this.frames = [];
    this.expected = after;
  }
}

export default function latexExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui" || ctx.ui.getEditorComponent?.()) return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new LatexEditor(tui, theme, keybindings));
  });
}
