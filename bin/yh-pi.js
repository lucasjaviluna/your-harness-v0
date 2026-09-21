#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const packageRoot = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "..", "package.json"), "utf8"));
const validModes = new Set(["auto", "simple", "task", "sdd"]);
const validProfiles = new Set(["developer", "functional-analyst", "product-owner", "marketing", "custom"]);

export function parseCliArgs(args) {
  const options = { mode: undefined, profile: undefined, passthrough: [], help: false, version: false };
  let passthrough = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (passthrough) { options.passthrough.push(arg); continue; }
    if (arg === "--") { passthrough = true; continue; }
    if (arg === "-h" || arg === "--help") { options.help = true; continue; }
    if (arg === "-v" || arg === "--version") { options.version = true; continue; }
    if (arg === "--mode" || arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requiere un valor.`);
      if (arg === "--mode" && !validModes.has(value)) throw new Error(`Modo inválido: ${value}. Usa auto, simple, task o sdd.`);
      if (arg === "--profile" && !validProfiles.has(value)) throw new Error(`Perfil inválido: ${value}. Usa developer, functional-analyst, product-owner, marketing o custom.`);
      options[arg === "--mode" ? "mode" : "profile"] = value;
      index += 1;
      continue;
    }
    throw new Error(`Opción desconocida: ${arg}. Usa --help o separa opciones de Pi con --.`);
  }
  return options;
}

export function buildPiArgs(options, extensionPath) {
  const themePath = fileURLToPath(new URL("../themes/yh-pi.json", import.meta.url));
  return ["-e", extensionPath, "--theme", themePath, "--use-theme", "yh-pi", ...options.passthrough];
}

function resolveBundledPi() {
  const resolvedMain = require.resolve("@earendil-works/pi-coding-agent");
  const root = dirname(dirname(resolvedMain));
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.pi;
  if (!bin) throw new Error("La instalación de Pi no declara un binario pi.");
  return join(root, bin);
}

function resolvePiInvocation() {
  try { return { command: process.execPath, prefix: [resolveBundledPi()], shell: false }; }
  catch {
    const command = process.platform === "win32" ? "pi.cmd" : "pi";
    return { command, prefix: [], shell: process.platform === "win32" };
  }
}

export function helpText() {
  return [
    "yh-pi — Your Harness para Pi",
    "",
    "Uso:",
    "  yh-pi [opciones] [-- opciones-de-pi]",
    "",
    "Opciones:",
    "  --profile <perfil>  Perfil de usuario de la sesión",
    "  --mode <modo>       Ruta default: auto, simple, task o sdd",
    "  -h, --help          Mostrar esta ayuda",
    "  -v, --version       Mostrar la versión",
  ].join("\n");
}

export function run(options) {
  const extensionPath = fileURLToPath(new URL("../extensions/harness.ts", import.meta.url));
  const invocation = resolvePiInvocation();
  const child = spawn(invocation.command, [...invocation.prefix, ...buildPiArgs(options, extensionPath)], {
    cwd: process.cwd(),
    env: { ...process.env, PI_HARNESS_CAPTURE_INPUT: "1", ...(options.mode ? { PI_HARNESS_MODE: options.mode } : {}), ...(options.profile ? { PI_HARNESS_PROFILE: options.profile } : {}) },
    shell: invocation.shell,
    stdio: "inherit",
    windowsHide: false,
  });
  child.on("error", (error) => { console.error(`No se pudo iniciar Pi: ${error.message}`); });
  child.on("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) console.log(helpText());
    else if (options.version) console.log(packageJson.version);
    else run(options);
  } catch (error) {
    console.error(`yh-pi: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
