import { CapabilityRegistry } from "./registry.ts";
import { OpenSpecCapability } from "./openspec.ts";
import { RepositoryVerificationCapability } from "./verification.ts";

export type HarnessCapabilities = {
  openspec: OpenSpecCapability;
  verification: RepositoryVerificationCapability;
};

export function createHarnessCapabilityRegistry(): CapabilityRegistry<HarnessCapabilities> {
  const registry = new CapabilityRegistry<HarnessCapabilities>();
  registry.register("openspec", new OpenSpecCapability());
  registry.register("verification", new RepositoryVerificationCapability());
  return registry;
}

export type { Capability, CapabilityAvailability, CapabilityContext } from "./capability.ts";
export { CapabilityRegistry } from "./registry.ts";
export { OpenSpecCapability } from "./openspec.ts";
export { RepositoryVerificationCapability } from "./verification.ts";
