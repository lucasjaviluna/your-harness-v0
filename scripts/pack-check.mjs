import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temp = await mkdtemp(join(tmpdir(), "pi-harness-pack-check-"));
try {
  const result = await execFileAsync(npm, ["pack", "--dry-run"], {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    env: { ...process.env, npm_config_cache: join(temp, "npm-cache") },
    windowsHide: true,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
} finally {
  await rm(temp, { recursive: true, force: true });
}
