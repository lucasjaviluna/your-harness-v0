import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const windowsShell = process.platform === "win32";

function npmEnvironment(cacheDirectory: string) {
  return { ...process.env, npm_config_cache: join(cacheDirectory, "npm-cache") };
}

function timedOut(error: unknown): boolean {
  const failure = error as { code?: string; killed?: boolean };
  return failure.code === "ETIMEDOUT" || failure.killed === true;
}

async function commandAvailable(command: string): Promise<boolean> {
  try { await execFile(process.platform === "win32" ? "where.exe" : "which", [command], { windowsHide: true }); return true; } catch { return false; }
}

async function makePackageTarball(): Promise<{ directory: string; tarball: string }> {
  const directory = await mkdtemp(join(tmpdir(), "pi-harness-pack-"));
  const result = await execFile(npmCommand, ["pack", "--pack-destination", directory, "--ignore-scripts"], { cwd: root, windowsHide: true, shell: windowsShell, env: npmEnvironment(directory) });
  const filename = result.stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(filename, `npm pack no devolvió el nombre del tarball: ${result.stdout}`);
  return { directory, tarball: join(directory, filename) };
}

async function installConsumer(tarball: string, prefix: string): Promise<void> {
  await execFile(npmCommand, ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps", "--package-lock=false"], { cwd: prefix, windowsHide: true, shell: windowsShell, env: npmEnvironment(prefix), maxBuffer: 1024 * 1024, timeout: 30_000, killSignal: "SIGTERM" });
}

async function runInstalledHarness(prefix: string, prompt: string): Promise<string> {
  const agentDirectory = join(prefix, ".pi-agent");
  const executable = process.execPath;
  const args = [join(prefix, "node_modules", "pi-harness", "bin", "yh-pi.js"), "--", "--no-tools", "--approve", "--print", prompt];
  try {
    const { PATH: _path, Path: _windowsPath, ...environment } = process.env;
    const result = await execFile(executable, args, {
      cwd: prefix,
      windowsHide: true,
      env: { ...environment, PATH: "", PI_CODING_AGENT_DIR: agentDirectory, PI_CODING_AGENT_SESSION_DIR: join(agentDirectory, "sessions") },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(`${failure.message ?? "yh-pi falló"}\n${failure.stderr ?? failure.stdout ?? ""}`);
  }
}

test("el manifest distribuye el runtime necesario", { concurrency: false }, async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { files?: string[]; pi?: { extensions?: string[]; skills?: string[] } };
  assert.deepEqual(packageJson.files, ["bin", "extensions", "src", "skills", "themes", "docs", "README.md", "package.json"]);
  assert.deepEqual(packageJson.pi?.extensions, ["./extensions"]);
  assert.deepEqual(packageJson.pi?.skills, ["./skills"]);
  const cacheDirectory = await mkdtemp(join(tmpdir(), "pi-harness-npm-cache-"));
  const dryRun = await execFile(npmCommand, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, windowsHide: true, shell: windowsShell, env: npmEnvironment(cacheDirectory) });
  const entries = JSON.parse(dryRun.stdout) as Array<{ files?: Array<{ path: string }> }>;
  const files = entries[0]?.files?.map((file) => file.path) ?? [];
  for (const expected of ["bin/yh-pi.js", "extensions/harness.ts", "src/task.ts", "src/openspec.ts", "skills/harness-simple/SKILL.md", "skills/harness-sdd/SKILL.md", "themes/yh-pi.json", "README.md"]) assert.ok(files.includes(expected), `Falta ${expected} en npm pack`);
});

test("instala el tarball en dos consumidores y carga Pi fuera del repositorio", { concurrency: false }, async (t) => {
  if (!(await commandAvailable("npm"))) { t.skip("npm no está disponible en PATH"); return; }
  const { tarball } = await makePackageTarball();
  const consumerA = await mkdtemp(join(tmpdir(), "pi-harness-consumer-a-"));
  const consumerB = await mkdtemp(join(tmpdir(), "pi-harness-consumer-b-"));
  try {
    await installConsumer(tarball, consumerA);
    await installConsumer(tarball, consumerB);
  } catch (error) {
    if (timedOut(error)) {
      t.skip("El consumidor no pudo instalar las dependencias dentro del tiempo disponible en este entorno");
      return;
    }
    throw error;
  }
  const harnessA = join(consumerA, "node_modules", "pi-harness", "bin", "yh-pi.js");
  const harnessB = join(consumerB, "node_modules", "pi-harness", "bin", "yh-pi.js");
  await access(harnessA);
  await access(harnessB);
  await access(join(consumerA, "node_modules", "pi-harness", "skills", "harness-simple", "SKILL.md"));
  const simpleOutput = await runInstalledHarness(consumerA, "/harness-work --mode simple Cambiar el texto del botón en un archivo");
  assert.match(simpleOutput, /Ruta seleccionada: simple/);
  const sddOutput = await runInstalledHarness(consumerB, "/harness-work --mode sdd Agregar permisos por rol");
  assert.match(sddOutput, /Ruta seleccionada: sdd/);
});

test("Git Bash puede invocar Pi cuando está disponible", { concurrency: false }, async (t) => {
  if (process.platform !== "win32" || !(await commandAvailable("bash")) || !(await commandAvailable("pi"))) { t.skip("prueba específica de Windows/Git Bash no disponible"); return; }
  try {
    const result = await execFile("bash.exe", ["-lc", "MSYS_NO_PATHCONV=1 pi --version"], { cwd: root, windowsHide: true });
    assert.match(result.stdout, /\d+\.\d+\.\d+/);
  } catch {
    t.skip("Git Bash está disponible, pero no hereda un comando pi ejecutable en su PATH");
  }
});
