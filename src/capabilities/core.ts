import { CapabilityRegistry } from "./registry.ts";
import { RepositoryCapability } from "./repository.ts";
import type { GitCapability } from "./git.ts";
import type { OpenSpecCapability } from "./openspec.ts";
import type { RepositoryVerificationCapability } from "./verification.ts";

/** Capabilities needed by the regular yh-pi workflow, without optional MCP SDK code. */
export type CoreHarnessCapabilities = {
  repository: RepositoryCapability;
  git: GitCapability;
  openspec: OpenSpecCapability;
  verification: RepositoryVerificationCapability;
};

export function createCoreHarnessCapabilityRegistry(): CapabilityRegistry<CoreHarnessCapabilities> {
  const registry = new CapabilityRegistry<CoreHarnessCapabilities>();
  registry.register("repository", new RepositoryCapability());
  return registry;
}

/** Registers workflow-only capabilities after the user invokes a related command. */
export async function registerDeferredWorkflowCapabilities(
  registry: CapabilityRegistry<CoreHarnessCapabilities>,
): Promise<void> {
  if (registry.get("git") && registry.get("openspec") && registry.get("verification")) return;
  const [{ GitCapability }, { OpenSpecCapability }, { RepositoryVerificationCapability }] = await Promise.all([
    import("./git.ts"),
    import("./openspec.ts"),
    import("./verification.ts"),
  ]);
  if (!registry.get("git")) registry.register("git", new GitCapability());
  if (!registry.get("openspec")) registry.register("openspec", new OpenSpecCapability());
  if (!registry.get("verification")) registry.register("verification", new RepositoryVerificationCapability());
}
