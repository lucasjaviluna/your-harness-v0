import { detectOpenSpec, type OpenSpecDetection } from "../openspec.ts";
import type { Capability } from "./capability.ts";

export interface OpenSpecCapabilityContext {
  cwd: string;
}

export interface OpenSpecCapabilityRequest {
  operation: "detect";
  probeCli?: boolean;
}

export class OpenSpecCapability implements Capability<OpenSpecCapabilityRequest, OpenSpecDetection, OpenSpecCapabilityContext> {
  readonly id = "openspec";
  readonly description = "Detecta la configuración de OpenSpec y los comandos de Pi disponibles en el proyecto.";

  async isAvailable(context: OpenSpecCapabilityContext): Promise<boolean> {
    const detection = await detectOpenSpec(context.cwd, { probeCli: false });
    return detection.configured;
  }

  async execute(request: OpenSpecCapabilityRequest, context: OpenSpecCapabilityContext): Promise<OpenSpecDetection> {
    if (request.operation !== "detect") throw new Error(`Operación OpenSpec desconocida: ${request.operation}`);
    return detectOpenSpec(context.cwd, { probeCli: request.probeCli });
  }
}
