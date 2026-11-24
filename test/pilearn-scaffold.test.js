import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

const root = fileURLToPath(new URL("../", import.meta.url));

test("scaffolding keeps the next step separate from session evidence and gives each source a locator", async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "pilearn-scaffold-test-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const agentDir = join(workspace, "agent");
  const prior = { PILEARN_WORKSPACE: process.env.PILEARN_WORKSPACE, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
  Object.assign(process.env, { PILEARN_WORKSPACE: workspace, PI_CODING_AGENT_DIR: agentDir });
  t.after(() => {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  cpSync(join(root, "agent/templates"), join(agentDir, "templates"), { recursive: true });
  const { extensions, errors } = await discoverAndLoadExtensions([join(root, "agent/extensions/pilearn-scaffold")], workspace, agentDir);
  assert.deepEqual(errors, []);
  const { definition } = extensions[0].tools.get("pilearn_scaffold");
  const scaffold = (params) => definition.execute("fixture", { course: "proof", ...params });

  await scaffold({ level: "course", title: "Proofs" });
  const course = join(workspace, "courses/proof");
  assert.equal(readFileSync(join(course, "progress.md"), "utf8"), "# Proofs progress\n\n## Next\n- (first unit)\n");

  mkdirSync(join(course, "materials/lecture"), { recursive: true });
  for (const file of ["book.pdf", "notes.pdf", "lecture.md"]) writeFileSync(join(course, "materials/lecture", file), "fixture");
  await scaffold({ level: "source", source: "book", path: "materials/lecture/book.pdf", pageOffset: 12 });
  await scaffold({ level: "chapter", chapter: "lec01", title: "Proof methods", parts: [
    { source: "book", pages: "2-3" },
    { source: "materials/lecture/notes.pdf", pages: "2-3" },
    { source: "materials/lecture/lecture.md" },
  ] });

  const unit = readFileSync(join(course, "chapters/lec01/AGENTS.md"), "utf8");
  assert.match(unit, /pages 2-3, which are PDF pages 14-15/);
  assert.match(unit, /PDF pages 2-3/);
  assert.match(unit, /source ID in each citation/);
  assert.match(unit, /ps3 PDF p\. 2/);
  assert.match(unit, /cite.*timestamps.*headings/i);
});
