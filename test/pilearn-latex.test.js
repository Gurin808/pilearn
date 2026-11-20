import assert from "node:assert/strict";
import { test } from "node:test";
import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import latexExtension, { LatexEditor } from "../agent/extensions/pilearn-latex/index.ts";
import { findExpansion, mathContext } from "../agent/extensions/pilearn-latex/snippets.ts";
import { LatexReference, searchSnippets } from "../agent/extensions/pilearn-latex/reference.ts";

const editor = () => new LatexEditor({ requestRender() {} }, { borderColor: (s) => s, selectList: {} }, new KeybindingsManager(TUI_KEYBINDINGS));
const type = (input, text) => { for (const char of text) input.handleInput(char); };
const expand = (text, automatic = true) => findExpansion(text, text.length, automatic)?.text;

test("the default catalog retains symbol, regex, dynamic, and environment snippets", () => {
  assert.equal(expand("$@t"), "\\theta");
  assert.equal(expand("$xhat"), "\\hat{x}");
  assert.equal(expand("$\\alpha3"), "\\alpha_{3}");
  assert.equal(expand("$\\alpha_{3}4"), "\\alpha_{34}");
  assert.equal(expand("$\\int", false), "\\int  \\, dx ");
  assert.equal(expand("$\\theta"), undefined);
  assert.equal(expand("$\\thetax"), "\\theta x");
  assert.equal(expand("$pmat"), "\\begin{pmatrix}\\end{pmatrix}");
  assert.equal(expand("$$\npmat"), "\\begin{pmatrix}\n\n\\end{pmatrix}");
  assert.equal(expand("$iden2"), "\\begin{pmatrix}\n1 & 0 \\\\\n0 & 1\n\\end{pmatrix}");
  assert.equal(expand("$\\ce{CO2"), undefined);
  assert.equal(expand("$\\text{Itsrr"), undefined);
});

test("math detection follows the cursor and excludes prose, code, shell commands, and escaped dollars", () => {
  for (const value of ["@t", "text \\$@t", "`$@t", "```julia\n$@t", "~~~\n$@t", "/history $@t", "!echo $@t", "$x$ @t"]) {
    assert.equal(expand(value), undefined, value);
  }
  assert.equal(mathContext("$$", 1).mode, "inline");
  assert.equal(mathContext("$$\n\n$$", 3).mode, "display");
  assert.equal(expand("```\n$x$\n```\n$@t"), "\\theta");
});

test("mk and dm require Tab and place the cursor inside the delimiters", () => {
  const input = editor();
  type(input, "Value mk");
  assert.equal(input.getText(), "Value mk");
  type(input, "\t@tsr\t");
  assert.equal(input.getText(), "Value $\\theta^{2}$");
  assert.equal(input.getCursor().col, input.getText().length);
  type(input, " dm\tx/y\t\t");
  assert.equal(input.getText(), "Value $\\theta^{2}$ \n$$\n\\frac{x}{y}\n$$");
  assert.deepEqual(input.getCursor(), { line: 3, col: 2 });
});

test("Tab replaces default fields, mirrors repeated fields, and exits nested snippets", () => {
  const input = editor();
  type(input, "mk\touter");
  assert.equal(input.getText(), "$\\ket{\\psi} \\bra{\\psi} $");
  type(input, "@t\t\t");
  assert.equal(input.getText(), "$\\ket{\\theta} \\bra{\\theta} $");
  assert.equal(input.getCursor().col, input.getText().length);
  const nested = editor();
  type(nested, "mk\t//sqx\t\ty\t\t");
  assert.equal(nested.getText(), "$\\frac{\\sqrt{ x }}{y}$");
  assert.equal(nested.getCursor().col, nested.getText().length);
});

test("visual snippets wrap a range selected with Shift+arrow", () => {
  const input = editor();
  type(input, "mk\tx+y");
  input.handleInput("\x1b[1;2D");
  input.handleInput("\x1b[1;2D");
  input.handleInput("\x1b[1;2D");
  type(input, "S");
  assert.equal(input.getText(), "$\\sqrt{ x+y }$");
});

test("pastes and ordinary input remain unexpanded", () => {
  const input = editor();
  type(input, "prose @t and mk123");
  assert.equal(input.getText(), "prose @t and mk123");
  input.handleInput("\x1b[200~$@t$\x1b[201~");
  assert.match(input.getText(), /\$@t\$$/);
  input.setText("$@t$");
  assert.equal(input.getText(), "$@t$");
});

test("the extension only installs in the terminal and leaves other editors alone", () => {
  let sessionStart;
  latexExtension({
    registerCommand() {},
    registerShortcut() {},
    on(name, listener) { if (name === "session_start") sessionStart = listener; },
  });
  let installed = 0;
  const ui = { getEditorComponent: () => undefined, setEditorComponent: () => installed++ };
  sessionStart({}, { mode: "rpc", ui });
  sessionStart({}, { mode: "tui", ui: { ...ui, getEditorComponent: () => () => {} } });
  assert.equal(installed, 0);
  sessionStart({}, { mode: "tui", ui });
  assert.equal(installed, 1);
});

test("shortcut search finds triggers, LaTeX commands, and descriptions", () => {
  assert.equal(searchSnippets("mk")[0].key, "Tab");
  assert.equal(searchSnippets("dm")[0].replacement, "$$\n$0\n$$");
  assert.ok(searchSnippets("THETA").some((entry) => entry.trigger === "@t"));
  assert.equal(searchSnippets("square root")[0].trigger, "sq");
  assert.ok(searchSnippets("pmat").some((entry) => entry.mode === "Display math"));
  assert.ok(searchSnippets("fraction Tab").some((entry) => entry.trigger === "x/y"));
  assert.deepEqual(searchSnippets("not a real snippet"), []);
});

test("reference overlay filters, supports reset and cancel, and stays within its width", () => {
  let closed = false;
  const overlay = new LatexReference(
    { terminal: { rows: 24 }, requestRender() {} },
    { fg: (_, text) => text },
    new KeybindingsManager(TUI_KEYBINDINGS),
    () => { closed = true; },
    "theta",
  );
  overlay.focused = true;
  assert.match(overlay.render(60).join("\n"), /@t.*Greek letter/);
  assert.match(overlay.render(60).join("\n"), /\\theta/);
  assert.ok(overlay.render(24).every((line) => visibleWidth(line) <= 24));
  overlay.handleInput("\x06");
  type(overlay, "zzzz");
  assert.match(overlay.render(60).join("\n"), /No matching snippets/);
  overlay.handleInput("\x1b");
  assert.ok(closed);
});
