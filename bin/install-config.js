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
      "Check original statements and available solution pages when feedback is difficult, uncertain, or disputed. Follow the shared adaptive teaching rules, including labeled teaching examples and prerequisite explanations.",
    )
    .replace("and it is the ground truth.", "and it is the reference for source definitions and claims.")
    .replace(
      "Open the source only to check something a digest doesn't cover.",
      "Open the source and available solutions when feedback is difficult, uncertain, or disputed. Follow the shared adaptive teaching rules, including labeled teaching examples and prerequisite explanations.",
    )
    .replace("The `practice` setting sets how many exercises to assign.", "The `practice` setting guides exercise load; adapt it to independent work already done and the learner's needs.")
    .replace("`practice`, which sets how many exercises to assign.", "`practice`, which guides exercise load rather than setting a minimum.");
}
