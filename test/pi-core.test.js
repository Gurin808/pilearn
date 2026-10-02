import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLatestPi } from "../bin/pi-core.js";

const name = "@earendil-works/pi-coding-agent";

function fixture(t, version = "0.87.1") {
  const root = mkdtempSync(join(tmpdir(), "pilearn-pi-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "node_modules", name);
  const cli = join(dir, "dist", "cli.js");
  const install = (next) => {
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: next }));
    writeFileSync(cli, "");
  };
  if (version) install(version);
  const calls = [];
  const warnings = [];
  const options = {
    offline: false,
    warn: (message) => warnings.push(message),
    run: (command, args, opts) => {
      calls.push({ command, args, opts });
      if (args[0] === "view") return { status: 0, stdout: '["0.99.2"]\n' };
      install("0.99.2");
      return { status: 0 };
    },
  };
  return { root, dir, cli, install, calls, warnings, options };
}

test("the dependency follows the latest tag, not a minor-version range", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  assert.equal(manifest.dependencies[name], "latest");
});

test("updates an old local core before returning its CLI", (t) => {
  const f = fixture(t);
  assert.equal(ensureLatestPi(f.root, f.options), f.cli);
  assert.equal(JSON.parse(readFileSync(join(f.dir, "package.json"))).version, "0.99.2");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].args[0], "view");
  assert.ok(f.calls[0].args.includes(`${name}@latest`));
  assert.equal(f.calls[1].args[0], "update");
  assert.ok(f.calls[1].args.includes(name));
  assert.ok(f.calls[1].args.includes("--ignore-scripts"));
  assert.ok(f.calls[1].args.includes("--no-save"));
  assert.equal(f.calls[1].opts.cwd, f.root);
  assert.ok(f.calls[0].opts.timeout <= 10000);
});

test("checks every call, but does not reinstall a current core", (t) => {
  const f = fixture(t, "0.99.2");
  ensureLatestPi(f.root, f.options);
  ensureLatestPi(f.root, f.options);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every((call) => call.args[0] === "view"));
  assert.deepEqual(f.warnings, []);
});

test("installs a missing core", (t) => {
  const f = fixture(t, null);
  assert.equal(ensureLatestPi(f.root, f.options), f.cli);
  assert.equal(f.calls.length, 2);
});

test("a failed registry check warns and keeps the installed core", (t) => {
  const f = fixture(t);
  f.options.run = () => ({ status: null, error: new Error("timeout") });
  assert.equal(ensureLatestPi(f.root, f.options), f.cli);
  assert.match(f.warnings.join("\n"), /could not check.*using installed Pi 0\.87\.1/i);
});

test("accepts the single-string output used by other npm versions", (t) => {
  const f = fixture(t, "0.99.2");
  f.options.run = () => ({ status: 0, stdout: '\"0.99.2\"' });
  assert.equal(ensureLatestPi(f.root, f.options), f.cli);
  assert.deepEqual(f.warnings, []);
});

test("invalid registry output is handled like an unavailable registry", (t) => {
  const f = fixture(t);
  f.options.run = () => ({ status: 0, stdout: "not JSON" });
  assert.equal(ensureLatestPi(f.root, f.options), f.cli);
  assert.equal(f.warnings.length, 1);
});

test("a failed update warns and uses the remaining installed core", (t) => {
  const f = fixture(t);
  const original = f.options.run;
  f.options.run = (command, args, opts) => args[0] === "view"
    ? original(command, args, opts)
    : { status: 1 };
  assert.equal(ensureLatestPi(f.root, f.options), f.cli);
  assert.match(f.warnings.join("\n"), /could not update.*using installed Pi 0\.87\.1/i);
});

test("does not claim success if npm leaves the old version", (t) => {
  const f = fixture(t);
  const original = f.options.run;
  f.options.run = (command, args, opts) => args[0] === "view"
    ? original(command, args, opts)
    : { status: 0 };
  ensureLatestPi(f.root, f.options);
  assert.match(f.warnings.join("\n"), /could not update/i);
});

test("fails clearly when no usable core remains after an update", (t) => {
  const f = fixture(t);
  const original = f.options.run;
  f.options.run = (command, args, opts) => {
    if (args[0] === "view") return original(command, args, opts);
    rmSync(f.dir, { recursive: true, force: true });
    return { status: 1 };
  };
  assert.throws(() => ensureLatestPi(f.root, f.options), /Pi is not installed/);
});

test("offline mode makes no npm calls", (t) => {
  const f = fixture(t);
  assert.equal(ensureLatestPi(f.root, { ...f.options, offline: true }), f.cli);
  assert.equal(f.calls.length, 0);
});

test("missing offline core gives installation instructions", (t) => {
  const f = fixture(t, null);
  assert.throws(() => ensureLatestPi(f.root, { ...f.options, offline: true }), /Run.*install/);
});
