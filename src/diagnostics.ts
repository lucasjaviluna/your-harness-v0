import type { ConfigResult } from "./config.ts";
import type { OpenSpecDetection } from "./openspec.ts";
import type { RepositoryContext } from "./task.ts";
import type { RepositorySnapshot } from "./simple.ts";

export function formatDoctorReport(config: ConfigResult, context: RepositoryContext, openSpec: OpenSpecDetection, compatible: boolean): string {
  return [
    "pi-harness doctor", `Pi API compatible: ${compatible ? "sí" : "no"}`, formatConfigShort(config),
    `Repositorio: ${context.repoRoot ?? "no detectado"}`, `Git: ${context.git.available ? "disponible" : "no disponible"}`,
    `OpenSpec: ${openSpec.configured ? "configurado" : "no configurado"}`, `CLI OpenSpec: ${openSpec.cliAvailable ? "disponible" : "no disponible"}`,
    `Comandos OpenSpec detectados: ${Object.values(openSpec.commands).filter(Boolean).join(", ") || "ninguno"}`,
    ...context.warnings.map((warning) => `Advertencia: ${warning}`), ...config.warnings.map((warning) => `Advertencia: ${warning}`),
    ...openSpec.findings.map((finding) => `OpenSpec: ${finding}`),
  ].join("\n");
}

function formatConfigShort(result: ConfigResult): string {
  return `Config: ${result.source}; modo=${result.config.defaultMode}; perfil=${result.config.profile}; HIL approval=${result.config.hil.requireApproval ? "on" : "off"}; HIL review=${result.config.hil.requireReview ? "on" : "off"}`;
}

export function formatChangesReport(snapshot: RepositorySnapshot, openSpec: OpenSpecDetection): string {
  return ["pi-harness changes", `Git disponible: ${snapshot.available ? "sí" : "no"}`, `Archivos modificados: ${snapshot.files.join(", ") || "ninguno detectado"}`, `Changes OpenSpec activos: ${openSpec.activeChanges.join(", ") || "ninguno"}`, snapshot.error ? `Error Git: ${snapshot.error}` : ""].filter(Boolean).join("\n");
}
