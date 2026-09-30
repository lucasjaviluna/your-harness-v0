import type { Capability, CapabilityContext, CapabilityAvailability } from "./capability.ts";

export class CapabilityRegistry<Capabilities extends { [Id in keyof Capabilities]: Capability<any, any, any> }> {
  private readonly capabilities = new Map<string, Capabilities[keyof Capabilities]>();

  register<Id extends keyof Capabilities>(id: Id, capability: Capabilities[Id]): void {
    if (capability.id !== String(id)) {
      throw new Error(`El id declarado por la capability ("${capability.id}") no coincide con la clave "${String(id)}".`);
    }
    if (this.capabilities.has(String(id))) {
      throw new Error(`Ya existe una capability registrada con id "${String(id)}".`);
    }
    this.capabilities.set(String(id), capability);
  }

  get<Id extends keyof Capabilities>(id: Id): Capabilities[Id] | undefined {
    return this.capabilities.get(String(id)) as Capabilities[Id] | undefined;
  }

  list(): Array<Capabilities[keyof Capabilities]> {
    return [...this.capabilities.values()];
  }

  async available(context: CapabilityContext): Promise<CapabilityAvailability[]> {
    return Promise.all(this.list().map(async (capability) => ({
      id: capability.id,
      available: await capability.isAvailable(context),
    })));
  }
}
