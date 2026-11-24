import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import registerAnki from "../agent/extensions/pilearn-anki.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shared = read("agent/templates/shared-AGENTS.md");
const tutor = read("agent/skills/pilearn-tutor/SKILL.md");

// These checks protect the instruction contract and resource loading, not learning efficacy.
test("Pi discovers the tutoring skills without diagnostics", () => {
  const loaded = loadSkillsFromDir({ dir: fileURLToPath(new URL("../agent/skills", import.meta.url)), source: "test" });
  assert.deepEqual(loaded.diagnostics, []);
  for (const name of ["pilearn-tutor", "eli5", "historical-context", "add-course"]) assert.ok(loaded.skills.some((skill) => skill.name === name));
});

test("always-loaded policy handles unfamiliar ideas and bounds hinting without blocking clarification", () => {
  assert.match(shared, /For unfamiliar ideas or missing prerequisites, explain briefly/);
  assert.match(shared, /Answer lookups and local clarification questions directly/);
  assert.match(shared, /one or two useful hints/);
  assert.match(shared, /asks for an explanation/);
  assert.match(shared, /what the learner has already said/);
  assert.doesNotMatch(shared, /first ask what they already think|before you explain it|never overrides the source/);
});

test("study and review commands route to the adaptive policy rather than restore a fixed script", () => {
  for (const path of ["agent/prompts/study.md", "agent/prompts/review.md"]) {
    const prompt = read(path);
    assert.match(prompt, /`pilearn-tutor`/);
    assert.doesNotMatch(prompt, /all eight|eight steps|5 to 8|across every chapter/);
  }
  assert.match(tutor, /Combine or skip checks/);
  assert.match(tutor, /latest independent result/);
  assert.match(tutor, /practice.*setting is a starting guide/);
  assert.match(tutor, /not as a compulsory extra/);
  assert.match(read("agent/skills/eli5/SKILL.md"), /otherwise explain directly/);
});

test("assessment separates support and task type without requiring matched checks or duplicate records", () => {
  assert.match(tutor, /`independent`, `hinted`, or `modeled`/);
  assert.match(tutor, /recall, explanation, application, and transfer/);
  assert.match(tutor, /compare only matched items/);
  assert.match(tutor, /denominators and support stated/);
  assert.match(tutor, /Preserve the first response/);
  assert.match(tutor, /Leave out checks you skipped/);
  assert.match(tutor, /update only \*Next\*/);
  assert.match(tutor, /leave them and past session notes unchanged/);
  const progress = read("agent/prompts/progress.md");
  assert.match(progress, /relevant notes in `sessions\/`/);
  assert.match(progress, /older totals cannot support a comparison/);
  assert.match(progress, /Anki is unavailable/);
});

test("source checking and card selection retain the intended safeguards", () => {
  assert.match(shared, /teaching additions/);
  assert.match(shared, /not expert answer keys/);
  assert.match(shared, /Check available source solutions before grading difficult work/);
  assert.match(shared, /assumptions, edge cases, and conclusion/);
  assert.match(shared, /Cite printed pages for a nonzero offset and cite PDF pages as such for a zero offset/);
  assert.match(shared, /For text files, cite timestamps if present/);
  assert.match(tutor, /A cold pre-test miss alone is not a reason for a card/);
  assert.match(tutor, /front must stand alone a year later/);
  assert.match(tutor, /not just a proposition or exercise number/);
  assert.match(tutor, /latest independent result and date/);
});

test("the card cap is per call and rejects oversized requests before contacting Anki", async (t) => {
  let tool;
  registerAnki({ registerTool: (definition) => { tool = definition; } });
  const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("oversized request reached Anki"));
  assert.match(tool.description, /at most 8 per call/);
  await assert.rejects(tool.execute("test", { action: "add", course: "Fixture", cards: Array.from({ length: 9 }, () => ({ front: "Question", back: "Answer" })) }), /At most 8 cards per call/);
  assert.equal(fetch.mock.callCount(), 0);
});
