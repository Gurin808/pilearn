import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function latestNpmSource(source) {
  if (typeof source !== "string" || !source.startsWith("npm:")) return source;
  const spec = source.slice(4);
  const versionAt = spec.lastIndexOf("@");
  return versionAt > 0 ? `npm:${spec.slice(0, versionAt)}` : source;
}

export function ensureLatestPiPackages(agentDir, piCli, {
  run = spawnSync,
  warn = (message) => console.error(`pilearn: ${message}`),
  offline = Boolean(process.env.PI_OFFLINE),
} = {}) {
  const path = join(agentDir, "settings.json");
  if (!existsSync(path)) return;
  const settings = JSON.parse(readFileSync(path, "utf8"));
  const packages = settings.packages ?? [];
  const unpinned = packages.map((entry) => typeof entry === "string"
    ? latestNpmSource(entry)
    : { ...entry, source: latestNpmSource(entry.source) });
  if (JSON.stringify(packages) !== JSON.stringify(unpinned)) {
    settings.packages = unpinned;
    writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  }
  if (offline || unpinned.length === 0) return;

  const result = run(process.execPath, [piCli, "update", "--extensions"], {
    cwd: agentDir,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      npm_config_fetch_retries: "0",
      npm_config_fetch_timeout: "5000",
    },
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 120000,
  });
  if (result.status !== 0) {
    warn("Could not update extension packages. Keeping available installed packages; will retry on the next launch.");
  }
}
