import { CapabilityRegistry } from "./registry.ts";
import { GitCapability } from "./git.ts";
import { OpenSpecCapability } from "./openspec.ts";
import { RepositoryCapability } from "./repository.ts";
import { RepositoryVerificationCapability } from "./verification.ts";

export type HarnessCapabilities = {
  repository: RepositoryCapability;
  git: GitCapability;
  openspec: OpenSpecCapability;
  verification: RepositoryVerificationCapability;
};

export function createHarnessCapabilityRegistry(): CapabilityRegistry<HarnessCapabilities> {
  const registry = new CapabilityRegistry<HarnessCapabilities>();
  registry.register("repository", new RepositoryCapability());
  registry.register("git", new GitCapability());
  registry.register("openspec", new OpenSpecCapability());
  registry.register("verification", new RepositoryVerificationCapability());
  return registry;
}

export type { Capability, CapabilityAvailability, CapabilityContext } from "./capability.ts";
export { CapabilityRegistry } from "./registry.ts";
export { GitCapability } from "./git.ts";
export { OpenSpecCapability } from "./openspec.ts";
export { RepositoryCapability } from "./repository.ts";
export { RepositoryVerificationCapability } from "./verification.ts";
