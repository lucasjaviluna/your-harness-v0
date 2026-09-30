export interface CapabilityContext {
  cwd: string;
}

export interface Capability<Request, Result, Context extends CapabilityContext = CapabilityContext> {
  readonly id: string;
  readonly description: string;
  isAvailable(context: Context): Promise<boolean>;
  execute(request: Request, context: Context): Promise<Result>;
}

export interface CapabilityAvailability {
  id: string;
  available: boolean;
}
