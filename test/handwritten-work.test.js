import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import guard from "../agent/extensions/pilearn-guard.ts";

// A synthetic 32x32 PNG, never the learner's clipboard contents.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJklEQVR4nO3NMQ0AAAwDoPo33arYsQQMkB6LQCAQCAQCgUAg+BIMi1X0pjxKe0gAAAAASUVORK5CYII=", "base64");

test("Pi clipboard screenshot paths pass the guard and read as model-visible images", async (t) => {
  const path = join(tmpdir(), `pi-clipboard-${randomUUID()}.png`);
  writeFileSync(path, png);
  t.after(() => rmSync(path, { force: true }));
  const handlers = new Map();
  guard({ on: (name, handler) => handlers.set(name, handler) });
  const ctx = { cwd: tmpdir(), ui: { notify: () => assert.fail("image read was blocked") } };
  const decision = await handlers.get("tool_call")({ toolName: "read", input: { path } }, ctx);
  assert.notEqual(decision?.block, true);
  const result = await createReadTool(tmpdir()).execute("screenshot-test", { path });
  assert.ok(result.content.some((block) => block.type === "image" && block.mimeType === "image/png" && block.data.length > 0));
});

test("seed keybindings preserve Pi's built-in clipboard paste action", () => {
  const bindings = JSON.parse(readFileSync(new URL("../seeds/keybindings.json", import.meta.url), "utf8"));
  // An absent override leaves Pi's platform-specific Ctrl+V / Alt+V defaults active.
  assert.equal(bindings["app.clipboard.pasteImage"], undefined);
});
