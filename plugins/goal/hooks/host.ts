import type { AgentInfo } from './model.ts'

// Structural host boundary used by the portable tests. No provider SDK or Node APIs run in hooks.
export type Host = {
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
  session: { id(): Promise<string>; usage(): Promise<{ cost?: { usd: number } }> }
  clock: { now(): Promise<number>; after(ms: number, fn: () => void): unknown }
  agent?: { list(): Promise<AgentInfo[]> }
  prompt: { submit(input: { text: string }): Promise<{ drop?: string }> }
  tool: { register(input: { name: string; description: string; inputSchema: Record<string, unknown> }): Promise<unknown> }
  ui: { status(text: string | undefined): unknown; log(text: string): unknown }
}
export type Origin = { kind: string; name?: string }
export type Events = {
  'session.start': Record<string, unknown>
  'tool.describe': { tool: string; isDeferred: boolean; [key: string]: unknown }
  'tool.call': { tool: string; agentId?: string; [key: string]: unknown }
  'agent.spawn': { tool_use_id: string; parentAgentId?: string; background: boolean;
    description: string; name?: string; resume?: { agentId: string }; [key: string]: unknown }
  'turn.start': { agentId?: string; turnId: string; text: string }
  'turn.step': { agentId?: string; turnId: string; [key: string]: unknown }
  'turn.complete': { agentId?: string; turnId: string; answer: string; reason: string; durationMs: number;
    usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number;
      cache_creation_input_tokens: number; model: string } }
  'prompt.submit': { text: string; origin: Origin; context?: readonly string[]; turnId?: string; wait?: boolean }
}
export type Results = {
  'session.start': Record<string, unknown>
  'tool.describe': Record<string, unknown>
  'tool.call': { result?: unknown; deny?: string; [key: string]: unknown }
  'agent.spawn': { agentId?: string; deny?: string; [key: string]: unknown }
  'turn.start': { turnId: string }
  'turn.step': Record<string, unknown>
  'turn.complete': { text: string; [key: string]: unknown }
  'prompt.submit': { text?: string; drop?: string; context?: readonly string[]; origin?: Origin }
}
export type Handler<K extends keyof Events> = (host: Host, event: Events[K],
  next: (event: Events[K]) => Promise<Results[K]>) => Results[K] | Promise<Results[K]>
export type On = {
  <K extends keyof Events>(event: K, hook: Handler<K>): void
  <K extends keyof Events>(event: K, matcher: Partial<Events[K]>, hook: Handler<K>): void
}
export type Register = (on: On) => void
