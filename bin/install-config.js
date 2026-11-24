import { resolve } from "node:path";

const NO_SHARED_SKILLS = "!**/.agents/skills/**";

// Remove only PILearn's retired theme. Other appearance preferences belong to the user.
export function migrateSettings(settings, agentDir) {
  const next = { ...settings };
  if (typeof next.theme === "string" && next.theme.split("/").includes("pilearn")) delete next.theme;
  if (Array.isArray(next.themes)) {
    const retired = resolve(agentDir, "themes", "pilearn.json");
    next.themes = next.themes.filter((entry) => {
      if (typeof entry !== "string") return true;
      const path = entry.replace(/^[-+]/, "").replaceAll("\\", "/");
      return resolve(agentDir, path) !== retired;
    });
    if (next.themes.length === 0) delete next.themes;
  }
  if (!(next.skills ?? []).includes(NO_SHARED_SKILLS)) {
    next.skills = [...(next.skills ?? []), NO_SHARED_SKILLS];
  }
  return next;
}

// Exact replacements keep course paths, page offsets, and personal additions intact.
export function migrateCourseInstructions(text) {
  if (!text.startsWith("# Level 2, course:")) return text;
  return text
    .replace("`/review` starts a recall-only session", "`/review` checks delayed recall and independent application")
    .replace(
      "The sources are the ground truth. Open a source only to check something a digest doesn't cover.",
      "Follow the shared teaching and citation rules.",
    )
    .replace("and it is the ground truth.", "and it is the reference for source definitions and claims.")
    .replace(
      "Open the source only to check something a digest doesn't cover.",
      "Follow the shared teaching and citation rules.",
    )
    .replace(" Follow the `pilearn-tutor` skill. `/study` starts a session, `/review` checks delayed recall and independent application, and `/progress` reports the results.", "")
    .replace("Start from the units' `digest.md` files. Check original statements and available solution pages when feedback is difficult, uncertain, or disputed. Follow the shared adaptive teaching rules, including labeled teaching examples and prerequisite explanations.\n\n", "")
    .replace("Check original statements and available solution pages when feedback is difficult, uncertain, or disputed. Follow the shared adaptive teaching rules, including labeled teaching examples and prerequisite explanations.", "Follow the shared teaching and citation rules.")
    .replace("Open the source and available solutions when feedback is difficult, uncertain, or disputed. Follow the shared adaptive teaching rules, including labeled teaching examples and prerequisite explanations.", "Follow the shared teaching and citation rules.")
    .replace(" Talk to the learner in the source's own page numbers, and name the source when the course has more than one. Call tools with PDF page numbers.", "")
    .replace(" Talk to the learner in printed page numbers and call tools with PDF page numbers.", "")
    .replace(" A unit without `digest.md` isn't prepared yet. Start a `chapter-reader` subagent with `cwd` set to its folder before you teach it.", "")
    .replace("`progress.md` holds session history, recall results, and what comes next. `sessions/` has one log per session. ", "")
    .replace("The `practice` setting sets how many exercises to assign.", "The `practice` setting guides exercise load; adapt it to independent work already done and the learner's needs.")
    .replace("`practice`, which sets how many exercises to assign.", "`practice`, which guides exercise load rather than setting a minimum.");
}
