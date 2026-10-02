import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE = "@earendil-works/pi-coding-agent";

export function ensureLatestPi(packageRoot, {
  run = spawnSync,
  warn = (message) => console.error(`pilearn: ${message}`),
  offline = Boolean(process.env.PI_OFFLINE),
} = {}) {
  const dir = join(packageRoot, "node_modules", PACKAGE);
  const cli = join(dir, "dist", "cli.js");
  const installedVersion = () => {
    if (!existsSync(cli)) return null;
    try {
      return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version || null;
    } catch {
      return null;
    }
  };
  const fallback = (reason) => {
    const version = installedVersion();
    if (!version) throw new Error(`Pi is not installed. Run \`sh install.sh\` or \`node install.mjs\` in ${packageRoot} with network access.`);
    warn(`${reason}; using installed Pi ${version}. Will retry on the next launch.`);
    return cli;
  };
  if (offline) {
    if (!installedVersion()) return fallback("Offline mode cannot install Pi");
    return cli;
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const options = { cwd: packageRoot, shell: process.platform === "win32", encoding: "utf8" };
  const network = ["--fetch-retries=0", "--fetch-timeout=5000"];
  const check = run(npm, ["view", `${PACKAGE}@latest`, "version", "--json", ...network], {
    ...options, stdio: ["ignore", "pipe", "pipe"], timeout: 10000,
  });
  let latest;
  try {
    const value = check.status === 0 ? JSON.parse(check.stdout) : null;
    latest = Array.isArray(value) && value.length === 1 ? value[0] : value;
  } catch {
    latest = null;
  }
  if (typeof latest !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(latest)) {
    return fallback("Could not check the latest Pi release");
  }
  if (installedVersion() === latest) return cli;

  warn(`Updating Pi to ${latest}...`);
  const update = run(npm, [
    "update", PACKAGE, "--no-save", "--ignore-scripts", "--no-fund", "--no-audit", "--loglevel=error", ...network,
  ], { ...options, stdio: ["ignore", "ignore", "inherit"], timeout: 120000 });
  if (update.status !== 0 || installedVersion() !== latest) {
    return fallback(`Could not update Pi to ${latest}`);
  }
  return cli;
}
