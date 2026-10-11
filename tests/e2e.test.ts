import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const windowsShell = process.platform === "win32";
const requiredInstall = process.env.PI_HARNESS_E2E_REQUIRE_INSTALL === "1";
const configuredInstallTimeout = Number.parseInt(process.env.PI_HARNESS_E2E_INSTALL_TIMEOUT_MS ?? "", 10);
const installTimeout = Number.isFinite(configuredInstallTimeout) && configuredInstallTimeout > 0
  ? configuredInstallTimeout
  : requiredInstall ? 300_000 : 30_000;
const rpcShutdownGrace = Number.parseInt(process.env.PI_HARNESS_E2E_RPC_SHUTDOWN_GRACE_MS ?? "", 10);

function npmEnvironment(cacheDirectory: string) {
  // Windows treats environment variable names case-insensitively. Remove an
  // inherited NPM_CONFIG_CACHE variant so the isolated cache wins reliably.
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_config_cache"),
  );
  return {
    ...environment,
    npm_config_cache: process.env.PI_HARNESS_E2E_NPM_CACHE || join(cacheDirectory, "npm-cache"),
    npm_config_prefer_offline: "true",
  };
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
  await execFile(npmCommand, ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps", "--package-lock=false"], { cwd: prefix, windowsHide: true, shell: windowsShell, env: npmEnvironment(prefix), maxBuffer: 1024 * 1024, timeout: installTimeout, killSignal: "SIGTERM" });
}

async function runInstalledHarness(prefix: string, prompt: string, assessment: "deterministic" | "model" = "deterministic"): Promise<string> {
  const agentDirectory = join(prefix, ".pi-agent");
  const executable = process.execPath;
  const args = [join(prefix, "node_modules", "pi-harness", "bin", "yh-pi.js"), "--", "--no-tools", "--approve", "--print", prompt];
  const {
    PATH: _path,
    Path: _windowsPath,
    PI_HARNESS_DETERMINISTIC_ASSESSMENT: _deterministicAssessment,
    PI_HARNESS_ALLOW_PRINT_MODEL: _allowPrintModel,
    ...environment
  } = process.env;
  const result = await new Promise<{ stdout: string; stderr: string }>((resolveResult, rejectResult) => {
    const child = spawn(executable, args, {
      cwd: prefix,
      windowsHide: true,
      // Pi's print mode consumes piped stdin before it handles the prompt.
      // `ignore` gives it EOF immediately; execFile leaves that pipe open.
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...environment,
        PATH: "",
        PI_CODING_AGENT_DIR: agentDirectory,
        PI_CODING_AGENT_SESSION_DIR: join(agentDirectory, "sessions"),
        ...(assessment === "deterministic"
          ? { PI_HARNESS_DETERMINISTIC_ASSESSMENT: "1" }
          : { PI_HARNESS_ALLOW_PRINT_MODEL: "1" }),
      },
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectResult(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveResult({ stdout, stderr });
        return;
      }
      const output = [stdout, stderr].filter(Boolean).join("\n");
      rejectResult(new Error(`yh-pi falló (${signal ? `signal=${signal}` : `code=${code}`})${output ? `\n${output}` : "\nPi no produjo salida capturada."}`));
    });
  });
  // Pi print mode reserves stdout for model output; extension notifications are written to stderr.
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

type RpcUiRequest = {
  type?: string;
  id?: string;
  command?: string;
  method?: string;
  title?: string;
  options?: string[];
  message?: string;
};

function rpcSelection(request: RpcUiRequest, route: "task" | "sdd", planDecision: "approve" | "cancel"): string | undefined {
  if (request.method !== "select") return undefined;
  if (request.title?.startsWith("Evaluación de la tarea")) return "Elegir otra ruta";
  if (request.title === "Elige una ruta") return route;
  if (request.title === "Revisión humana del plan") {
    if (planDecision === "cancel") return "Cancelar tarea";
    return request.options?.includes("Aprobar plan") ? "Aprobar plan" : "Autorizar inicio de implementación";
  }
  return undefined;
}

async function runInstalledHarnessRpc(prefix: string, options: {
  prompt: string;
  route?: "task" | "sdd";
  planDecision?: "approve" | "cancel";
  expectedNotification: RegExp;
  followUp?: { afterNotification: RegExp; prompt: string; beforePrompt?: () => Promise<void> };
  followUps?: Array<{ afterNotification: RegExp; prompt: string; beforePrompt?: () => Promise<void> }>;
}): Promise<string[]> {
  const agentDirectory = join(prefix, ".pi-agent");
  const executable = process.execPath;
  const args = [join(prefix, "node_modules", "pi-harness", "bin", "yh-pi.js"), "--", "--no-tools", "--approve", "--no-session", "--mode", "rpc"];
  const { PATH: _path, Path: _windowsPath, ...environment } = process.env;
  return new Promise<string[]>((resolveResult, rejectResult) => {
    const child = spawn(executable, args, {
      cwd: prefix,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...environment,
        PATH: "",
        PI_CODING_AGENT_DIR: agentDirectory,
        PI_CODING_AGENT_SESSION_DIR: join(agentDirectory, "sessions"),
        PI_HARNESS_DETERMINISTIC_ASSESSMENT: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    let completed = false;
    const followUps = options.followUps ?? (options.followUp ? [options.followUp] : []);
    let followUpIndex = 0;
    let pendingFollowUp: { prompt: string; beforePrompt?: () => Promise<void> } | undefined;
    let completionRequested = false;
    let shutdownFallback = false;
    let shutdownTimer: NodeJS.Timeout | undefined;
    const notifications: string[] = [];
    // A task route can open three sequential HIL dialogs. Allow the RPC
    // transport to settle each request on slower consumer environments.
    const timeout = setTimeout(() => child.kill("SIGTERM"), 90_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      if (shutdownTimer) clearTimeout(shutdownTimer);
      if (error) rejectResult(error);
      else resolveResult(notifications);
    };
    const closeAfterExpectedResult = () => {
      if (completed) return;
      completed = true;
      // EOF is Pi's documented orderly shutdown signal. Some CI runners keep
      // the RPC child alive after an extension command has already completed;
      // retain the functional result and terminate only that idle child after
      // a short grace period.
      child.stdin?.end();
      const grace = Number.isFinite(rpcShutdownGrace) && rpcShutdownGrace > 0 ? rpcShutdownGrace : 5_000;
      shutdownTimer = setTimeout(() => {
        shutdownFallback = true;
        child.kill("SIGTERM");
      }, grace);
    };
    const send = (message: object) => child.stdin?.write(`${JSON.stringify(message)}\n`);
    const handleRecord = (record: string) => {
      let event: RpcUiRequest;
      try { event = JSON.parse(record) as RpcUiRequest; } catch { return; }
      if (event.type === "extension_ui_request" && event.method === "notify" && event.message) {
        notifications.push(event.message);
        const followUp = followUps[followUpIndex];
        const followUpTriggered = followUp?.afterNotification.test(event.message) ?? false;
        if (followUpTriggered) {
          followUpIndex += 1;
          pendingFollowUp = followUp;
        }
        if (options.expectedNotification.test(event.message) && !completed) {
          completionRequested = true;
          // The notification is the terminal result of this RPC scenario.
          // Installed consumers do not consistently emit a later `prompt`
          // response, so do not wait for one before closing stdin.
          if (!followUpTriggered) {
            closeAfterExpectedResult();
          }
        }
        return;
      }
      if (event.type === "response" && event.command === "prompt") {
        if (pendingFollowUp) {
          const followUp = pendingFollowUp;
          pendingFollowUp = undefined;
          Promise.resolve(followUp.beforePrompt?.())
            .then(() => send({ id: `prompt-${followUpIndex + 1}`, type: "prompt", message: followUp.prompt }))
            .catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
        } else if (completionRequested) {
          closeAfterExpectedResult();
        }
        return;
      }
      if (event.type !== "extension_ui_request") return;
      const selection = rpcSelection(event, options.route ?? "task", options.planDecision ?? "approve");
      if (selection && event.id) send({ type: "extension_ui_response", id: event.id, value: selection });
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      pending += chunk;
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const record = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (record) handleRecord(record);
        newline = pending.indexOf("\n");
      }
      if (!completed && options.expectedNotification.test(`${stdout}\n${stderr}`) && !pendingFollowUp) {
        completionRequested = true;
        closeAfterExpectedResult();
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      if (!completed && options.expectedNotification.test(`${stdout}\n${stderr}`) && !pendingFollowUp) {
        completionRequested = true;
        closeAfterExpectedResult();
      }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      // Pi can leave the last RPC record without a trailing newline. Process
      // that buffered record before deciding whether the watchdog exposed a
      // real failure or merely closed an already-complete scenario.
      if (pending.trim()) {
        handleRecord(pending.replace(/\r$/, ""));
        pending = "";
      }
      // Keep the assertion tied to the RPC protocol even when a transport
      // buffering edge case prevented the incremental parser from observing
      // the final record before the child was terminated.
      if (completionRequested || options.expectedNotification.test(`${stdout}\n${stderr}`)) { finish(); return; }
      if (completed && (code === 0 || shutdownFallback)) { finish(); return; }
      const output = [stdout, stderr].filter(Boolean).join("\n");
      finish(new Error(`yh-pi RPC falló (${signal ? `signal=${signal}` : `code=${code}`})${output ? `\n${output}` : "\nPi no produjo salida capturada."}`));
    });
    send({ id: "prompt-1", type: "prompt", message: options.prompt });
  });
}

async function verifyInstalledMcpUnknown(prefix: string): Promise<void> {
  const installedPackage = join(prefix, "node_modules", "pi-harness");
  const runtimeCopy = join(prefix, ".harness", "installed-pi-harness");
  await cp(installedPackage, runtimeCopy, { recursive: true });
  const integration = await import(pathToFileURL(join(runtimeCopy, "extensions", "mcp-adapter-integration.ts")).href);
  const config = structuredClone(integration.DEFAULT_CONFIG ?? (await import("../src/config.ts")).DEFAULT_CONFIG);
  config.mcp = {
    enabled: true,
    defaultApproval: "automatic",
    allowlist: [{ server: "demo", tools: ["write"], approval: "automatic" }],
  };
  let adapterCalls = 0;
  let registered: { execute: (...args: any[]) => Promise<any> } | undefined;
  const pi = {
    events: {
      emit: (_channel: string, request: { result?: Promise<never> }) => {
        adapterCalls += 1;
        request.result = Promise.reject(new Error("resultado no confirmado"));
      },
    },
    registerTool: (tool: { execute: (...args: any[]) => Promise<any> }) => { registered = tool; },
    appendEntry: () => {},
  } as any;
  integration.setHarnessMcpConfig(config);
  integration.resetHarnessMcpActivity();
  integration.registerHarnessMcpTool(pi);
  const result = await registered.execute(
    "installed-mcp-call",
    { server: "demo", tool: "write", arguments: { value: "x" } },
    new AbortController().signal,
    undefined,
    { cwd: prefix, hasUI: false },
  );
  assert.equal(adapterCalls, 1, "La integración instalada no debe reintentar un resultado MCP ambiguo.");
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no confirmó el resultado/);
  const history = integration.formatMcpActivity().join("\n");
  assert.match(history, /demo\/write · automatic · unknown/);
  assert.match(history, /confirma el efecto antes de reintentar/);
  integration.resetHarnessMcpActivity();
}

function toGitBashPath(path: string): string {
  return path.replaceAll("\\", "/");
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
    if (timedOut(error) && !requiredInstall) {
      t.skip(`El consumidor no pudo instalar las dependencias dentro de ${installTimeout} ms en este entorno`);
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
  const modelFallbackOutput = await runInstalledHarness(consumerA, "/harness-work --mode task Preparar una migración de datos", "model");
  assert.match(modelFallbackOutput, /Ruta seleccionada: task \(fallback\)/);
  assert.match(modelFallbackOutput, /Se usó la clasificación determinista: (no hay un modelo activo en el contexto de la extensión|el modelo terminó con stopReason=error|falló la llamada al modelo)/);
  assert.match(modelFallbackOutput, /Clasificación pendiente:/);
  const sddOutput = await runInstalledHarness(consumerB, "/harness-work --mode sdd Agregar permisos por rol");
  assert.match(sddOutput, /Ruta seleccionada: sdd/);
  await verifyInstalledMcpUnknown(consumerA);

  const creationNotifications = await runInstalledHarnessRpc(
    consumerA,
    {
      prompt: "/harness-work --mode task Actualizar el formulario de perfil y sus validaciones",
      expectedNotification: /Inicio de implementación autorizado\./,
    },
  );
  assert.ok(creationNotifications.some((message) => message.includes("Plan aprobado.")), "La tarea instalada no pasó por la aprobación del plan.");
  const tasksDirectory = join(consumerA, ".harness", "tasks");
  const taskFiles = (await readdir(tasksDirectory)).filter((entry) => entry.endsWith(".md"));
  assert.equal(taskFiles.length, 1, "La tarea instalada no dejó exactamente un artefacto recuperable.");

  const recoveryNotifications = await runInstalledHarnessRpc(
    consumerA,
    { prompt: "/harness-task-resume", expectedNotification: /Tarea ligera recuperada desde / },
  );
  assert.ok(recoveryNotifications.some((message) => /Tarea ligera recuperada desde .*\.harness[\\/]tasks[\\/].+\.md/.test(message)), "El segundo proceso no recuperó el artefacto de tarea instalado.");

  let reconciliationArtifact = "";
  const reconciliationNotifications = await runInstalledHarnessRpc(
    consumerA,
    {
      prompt: "/harness-work --mode task Reconciliar estado de sesión y archivo",
      expectedNotification: /fuente elegida: artifact/,
      followUps: [
        {
          afterNotification: /Inicio de implementación autorizado\./,
          prompt: "/harness-task-resume",
          beforePrompt: async () => {
            const files = (await readdir(tasksDirectory)).filter((entry) => entry.endsWith(".md")).sort();
            reconciliationArtifact = join(tasksDirectory, files.at(-1)!);
            const content = await readFile(reconciliationArtifact, "utf8");
            await writeFile(reconciliationArtifact, content.replace('"scope": "Reconciliar estado de sesión y archivo"', '"scope": "Estado divergente en artefacto"'), "utf8");
          },
        },
        { afterNotification: /no coinciden\./, prompt: "/harness-task-resume --source session" },
        {
          afterNotification: /reconciliada desde la sesión/,
          prompt: "/harness-task-resume",
          beforePrompt: async () => {
            const content = await readFile(reconciliationArtifact, "utf8");
            await writeFile(reconciliationArtifact, content.replace('"scope": "Reconciliar estado de sesión y archivo"', '"scope": "Estado elegido desde artefacto"'), "utf8");
          },
        },
        { afterNotification: /no coinciden\./, prompt: "/harness-task-resume --source artifact" },
      ],
    },
  );
  assert.equal(reconciliationNotifications.filter((message) => /no coinciden\./.test(message)).length, 2, "El consumidor instalado no expuso ambos conflictos de estado.");
  assert.ok(reconciliationNotifications.some((message) => /reconciliada desde la sesión/.test(message)), "El consumidor instalado no permitió elegir la sesión.");
  assert.ok(reconciliationNotifications.some((message) => /fuente elegida: artifact/.test(message)), "El consumidor instalado no permitió elegir el artefacto.");
  assert.match(await readFile(reconciliationArtifact, "utf8"), /"scope": "Estado elegido desde artefacto"/);

  const corruptArtifact = join(tasksDirectory, taskFiles[0]!);
  const corruptContent = "# tarea dañada\n\n<!-- pi-harness-state\n{estado-inválido}\n-->\n";
  await writeFile(corruptArtifact, corruptContent, "utf8");
  const corruptRecoveryNotifications = await runInstalledHarnessRpc(
    consumerA,
    { prompt: "/harness-task-resume", expectedNotification: /El estado JSON del artefacto está corrupto\./ },
  );
  assert.ok(corruptRecoveryNotifications.some((message) => message.includes("El estado JSON del artefacto está corrupto.")), "El consumidor instalado no explicó que el artefacto está corrupto.");
  assert.equal(await readFile(corruptArtifact, "utf8"), corruptContent, "La recuperación de un artefacto corrupto no debe modificarlo.");

  const missingOpenSpecNotifications = await runInstalledHarnessRpc(
    consumerB,
    {
      prompt: "/harness-work --mode sdd Agregar permisos por rol",
      route: "sdd",
      followUp: { afterNotification: /Inicio de implementación autorizado\./, prompt: "/harness-sdd" },
      expectedNotification: /OpenSpec no está configurado para Pi\./,
    },
  );
  assert.ok(missingOpenSpecNotifications.some((message) => message.includes("No se encontró openspec/.")), "El consumidor instalado no explicó que OpenSpec está ausente.");
  assert.ok(missingOpenSpecNotifications.some((message) => message.includes("Inicialización sugerida:")), "El consumidor instalado no indicó cómo inicializar OpenSpec.");
  await assert.rejects(access(join(consumerB, "openspec")), "El flujo SDD sin OpenSpec no debe crear artefactos del proyecto.");

  const cancellationNotifications = await runInstalledHarnessRpc(
    consumerB,
    {
      prompt: "/harness-work --mode task Cancelar una migración antes de implementarla",
      planDecision: "cancel",
      expectedNotification: /Tarea cancelada por decisión humana\./,
    },
  );
  assert.ok(cancellationNotifications.some((message) => message.includes("Tarea cancelada por decisión humana.")), "La tarea instalada no quedó cancelada.");
  const cancelledTasksDirectory = join(consumerB, ".harness", "tasks");
  const cancelledTaskFiles = (await readdir(cancelledTasksDirectory)).filter((entry) => entry.endsWith(".md"));
  assert.equal(cancelledTaskFiles.length, 1, "La cancelación debe conservar un único artefacto de tarea.");
  assert.match(await readFile(join(cancelledTasksDirectory, cancelledTaskFiles[0]!), "utf8"), /Status: \*\*cancelled\*\*/);

  const cancelledResumeNotifications = await runInstalledHarnessRpc(
    consumerB,
    { prompt: "/harness-task-resume", expectedNotification: /está cancelada y no se puede reactivar/ },
  );
  assert.ok(cancelledResumeNotifications.some((message) => message.includes("está cancelada y no se puede reactivar")), "Una sesión nueva no bloqueó la reactivación de la tarea cancelada.");

  const scopeChangeNotifications = await runInstalledHarnessRpc(
    consumerB,
    {
      prompt: "/harness-work --mode task Actualizar el formulario de perfil",
      followUp: { afterNotification: /Inicio de implementación autorizado\./, prompt: "/harness-task-scope Añadir una migración de datos y compatibilidad hacia atrás" },
      expectedNotification: /Cambio de alcance registrado\. Debe aprobarse con \/harness-decide approve\./,
    },
  );
  assert.ok(scopeChangeNotifications.some((message) => message.includes("Cambio de alcance registrado.")), "El consumidor instalado no informó el cambio de alcance.");
  const scopedTaskFiles = (await readdir(cancelledTasksDirectory)).filter((entry) => entry.endsWith(".md"));
  assert.equal(scopedTaskFiles.length, 2, "El cambio de alcance debe crear y conservar un segundo artefacto de tarea.");
  const scopedContents = await Promise.all(scopedTaskFiles.map((file) => readFile(join(cancelledTasksDirectory, file), "utf8")));
  assert.ok(scopedContents.some((content) => content.includes("Añadir una migración de datos y compatibilidad hacia atrás")), "El artefacto instalado no persistió el alcance reevaluado.");

  const promptDirectory = join(consumerB, ".pi", "prompts");
  await mkdir(promptDirectory, { recursive: true });
  await writeFile(join(promptDirectory, "opsx-propose.md"), "# OpenSpec propose\n", "utf8");
  const configuredOpenSpecNotifications = await runInstalledHarnessRpc(
    consumerB,
    {
      prompt: "/harness-work --mode sdd Agregar permisos por rol con propuesta formal",
      route: "sdd",
      followUp: { afterNotification: /Inicio de implementación autorizado\./, prompt: "/harness-sdd" },
      expectedNotification: /Delegando a OpenSpec: \/opsx-propose/,
    },
  );
  assert.ok(configuredOpenSpecNotifications.some((message) => message.includes("Delegando a OpenSpec: /opsx-propose")), "El consumidor instalado no delegó propose al prompt OpenSpec detectado.");
  await assert.rejects(access(join(consumerB, "openspec", "changes")), "La delegación propose no debe crear artefactos OpenSpec antes de que OpenSpec responda.");
});

test("Git Bash puede invocar yh-pi instalado sin Pi global", { concurrency: false }, async (t) => {
  if (process.platform !== "win32" || !(await commandAvailable("bash")) || !(await commandAvailable("npm"))) { t.skip("prueba específica de Windows/Git Bash no disponible"); return; }
  const { tarball } = await makePackageTarball();
  const consumer = await mkdtemp(join(tmpdir(), "pi-harness-git-bash-"));
  try {
    await installConsumer(tarball, consumer);
  } catch (error) {
    if (timedOut(error) && !requiredInstall) {
      t.skip(`El consumidor no pudo instalar las dependencias dentro de ${installTimeout} ms en este entorno`);
      return;
    }
    throw error;
  }
  const harness = toGitBashPath(join(consumer, "node_modules", ".bin", "yh-pi"));
  const result = await execFile("bash.exe", ["-lc", `MSYS_NO_PATHCONV=1 '${harness}' --version`], { cwd: consumer, windowsHide: true });
  assert.match(result.stdout, /0\.1\.0/);
});
