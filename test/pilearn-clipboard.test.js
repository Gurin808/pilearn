import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { PhotonImage } from "@silvia-odwyer/photon-node";
import clipboard from "../agent/extensions/pilearn-clipboard.ts";

function png(pixels) {
  const image = new PhotonImage(pixels, 32, 32);
  try { return Buffer.from(image.get_bytes()); }
  finally { image.free(); }
}

function pixels(data) {
  const image = PhotonImage.new_from_byteslice(Buffer.from(data, "base64"));
  try { return image.get_raw_pixels(); }
  finally { image.free(); }
}

function fixture(t, { transparent = true, ink = 0, name = `pi-clipboard-${randomUUID()}.png` } = {}) {
  const agentDir = mkdtempSync(join(tmpdir(), "pilearn-clipboard-config-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  });
  const raw = new Uint8Array(32 * 32 * 4).fill(255);
  raw.set([ink, ink, ink, transparent ? 0 : 255], 0);
  raw.set([ink, ink, ink, 255], 4);
  raw.set([ink, ink, ink, transparent ? 128 : 255], 8);
  const original = png(raw);
  const path = join(tmpdir(), name);
  writeFileSync(path, original);
  t.after(() => rmSync(path, { force: true }));
  const handlers = new Map();
  const commands = new Map();
  const statuses = new Map();
  const notices = [];
  const api = { on: (name, handler) => handlers.set(name, handler), registerCommand: (name, command) => commands.set(name, command) };
  clipboard(api);
  const ctx = {
    cwd: tmpdir(), hasUI: true, sessionManager: { getBranch: () => [] },
    ui: { setStatus: (key, text) => statuses.set(key, text), notify: (text, level) => notices.push({ text, level }) },
  };
  const submit = () => handlers.get("input")({ source: "interactive", text: `Check exercise #1\n${path}` }, ctx);
  const read = async () => {
    const result = await createReadTool(tmpdir()).execute("test", { path });
    const event = { type: "tool_result", toolName: "read", toolCallId: "test", input: { path }, isError: false, ...result };
    return { event, changed: await handlers.get("tool_result")(event, ctx) };
  };
  const command = (args) => commands.get("clipboard-background").handler(args, ctx);
  return { path, original, agentDir, api, handlers, commands, statuses, notices, ctx, command, submit, read };
}

test("a pasted transparent proof reaches the model with white paper and preserved black ink", async (t) => {
  const f = fixture(t);
  await f.submit();
  const { event, changed } = await f.read();
  const content = changed?.content ?? event.content;
  const image = content.find((block) => block.type === "image");
  assert.deepEqual(Array.from(pixels(image.data).slice(0, 12)), [255, 255, 255, 255, 0, 0, 0, 255, 127, 127, 127, 255]);
  assert.equal(image.mimeType, "image/png");
  assert.deepEqual(readFileSync(f.path), f.original, "original clipboard PNG stays unchanged");
  assert.equal(changed.structuredContent.data, image.data, "codemode receives the same flattened image");
});

test("black paper preserves white ink and saves the chosen background", async (t) => {
  const f = fixture(t, { ink: 255 });
  await f.command("black");
  await f.submit();
  const { changed } = await f.read();
  const image = changed.content.find((block) => block.type === "image");
  assert.deepEqual(Array.from(pixels(image.data).slice(0, 12)), [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255]);
  assert.equal(JSON.parse(readFileSync(join(f.agentDir, "clipboard.json"), "utf8")).background, "black");
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: black");
  assert.match(changed.structuredContent.note, /placed on black/);
  assert.deepEqual(readFileSync(f.path), f.original);
});

test("the background choice survives a fresh extension instance", async (t) => {
  const f = fixture(t, { ink: 255 });
  await f.command("black");
  clipboard(f.api);
  await f.handlers.get("session_start")({}, f.ctx);
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: black");
  await f.submit();
  const { changed } = await f.read();
  const image = changed.content.find((block) => block.type === "image");
  assert.deepEqual(Array.from(pixels(image.data).slice(0, 8)), [0, 0, 0, 255, 255, 255, 255, 255]);
});

test("toggle switches both ways and serializes concurrent changes", async (t) => {
  const f = fixture(t);
  await f.command("toggle");
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: black");
  await f.command("toggle");
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: white");
  await Promise.all([f.command("toggle"), f.command("toggle")]);
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: white");
  assert.equal(JSON.parse(readFileSync(join(f.agentDir, "clipboard.json"), "utf8")).background, "white");
});

test("white is the default and checking it creates no preference file", async (t) => {
  const f = fixture(t);
  await f.handlers.get("session_start")({}, f.ctx);
  await f.command("");
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: white");
  assert.equal(existsSync(join(f.agentDir, "clipboard.json")), false);
  assert.match(f.notices.at(-1).text, /background is white/);
});

test("invalid commands leave the saved background unchanged", async (t) => {
  const f = fixture(t);
  await f.command("black");
  await f.command("automatic");
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: black");
  assert.equal(JSON.parse(readFileSync(join(f.agentDir, "clipboard.json"), "utf8")).background, "black");
  assert.equal(f.notices.at(-1).level, "warning");
});

test("an unreadable preference warns and uses white without overwriting it", async (t) => {
  const f = fixture(t);
  const path = join(f.agentDir, "clipboard.json");
  writeFileSync(path, "broken JSON");
  await f.handlers.get("session_start")({}, f.ctx);
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: white");
  assert.equal(f.notices.at(-1).level, "warning");
  assert.equal(readFileSync(path, "utf8"), "broken JSON");
});

test("a failed save does not change the active background", async (t) => {
  const f = fixture(t);
  await f.handlers.get("session_start")({}, f.ctx);
  mkdirSync(join(f.agentDir, "clipboard.json"));
  await f.command("black");
  assert.equal(f.statuses.get("clipboard-background"), "clipboard background: white");
  assert.equal(f.notices.at(-1).level, "error");
  await f.submit();
  const { changed } = await f.read();
  assert.match(changed.structuredContent.note, /placed on white/);
});

test("ordinary images are unchanged even when submitted in the same way", async (t) => {
  const f = fixture(t, { name: `pilearn-book-page-${randomUUID()}.png` });
  await f.command("black");
  await f.submit();
  const { changed } = await f.read();
  assert.equal(changed, undefined);
});

test("clipboard images not submitted by the learner are unchanged", async (t) => {
  const f = fixture(t);
  const { changed } = await f.read();
  assert.equal(changed, undefined);
});

test("extension-injected paths do not opt images into white-background handling", async (t) => {
  const f = fixture(t);
  await f.handlers.get("input")({ source: "extension", text: f.path }, f.ctx);
  const { changed } = await f.read();
  assert.equal(changed, undefined);
});

test("opaque clipboard images keep their original result and encoding", async (t) => {
  const f = fixture(t, { transparent: false });
  await f.command("black");
  await f.submit();
  const { changed } = await f.read();
  assert.equal(changed, undefined);
});

test("a clipboard-like filename outside the system temp directory is unchanged", async (t) => {
  const f = fixture(t);
  const { event } = await f.read();
  const outside = join(tmpdir(), "course", `pi-clipboard-${randomUUID()}.png`);
  await f.handlers.get("input")({ source: "interactive", text: outside }, f.ctx);
  event.input.path = outside;
  assert.equal(await f.handlers.get("tool_result")(event, f.ctx), undefined);
});

test("resuming a session restores its learner-submitted clipboard images", async (t) => {
  const f = fixture(t);
  f.ctx.sessionManager.getBranch = () => [{ type: "message", message: { role: "user", content: [{ type: "text", text: f.path }] } }];
  await f.handlers.get("session_start")({}, f.ctx);
  const { changed } = await f.read();
  assert.ok(changed?.content.some((block) => block.type === "image"));
});

test("switching sessions drops clipboard paths from the previous session", async (t) => {
  const f = fixture(t);
  await f.submit();
  await f.handlers.get("session_switch")({}, f.ctx);
  const { changed } = await f.read();
  assert.equal(changed, undefined);
});

test("the system temp directory's canonical alias still identifies the same pasted image", async (t) => {
  const f = fixture(t);
  await f.submit();
  const { event } = await f.read();
  event.input.path = join(realpathSync(tmpdir()), basename(f.path));
  const changed = await f.handlers.get("tool_result")(event, f.ctx);
  assert.ok(changed?.content.some((block) => block.type === "image"));
});

test("failed image reads are left unchanged", async (t) => {
  const f = fixture(t);
  await f.submit();
  const { event } = await f.read();
  event.isError = true;
  assert.equal(await f.handlers.get("tool_result")(event, f.ctx), undefined);
});
