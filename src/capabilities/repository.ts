import { stat } from "node:fs/promises";
import { collectRepositoryContext } from "../intake.ts";
import type { RepositoryContext } from "../task.ts";
import type { Capability } from "./capability.ts";

export interface RepositoryCapabilityContext {
  cwd: string;
}

export interface RepositoryCapabilityRequest {
  operation: "inspect";
}

export class RepositoryCapability implements Capability<RepositoryCapabilityRequest, RepositoryContext, RepositoryCapabilityContext> {
  readonly id = "repository";
  readonly description = "Recopila instrucciones, metadatos, archivos principales y verificaciones sugeridas del repositorio.";

  async isAvailable(context: RepositoryCapabilityContext): Promise<boolean> {
    try { return (await stat(context.cwd)).isDirectory(); } catch { return false; }
  }

  async execute(_request: RepositoryCapabilityRequest, context: RepositoryCapabilityContext): Promise<RepositoryContext> {
    return collectRepositoryContext(context.cwd);
  }
}
