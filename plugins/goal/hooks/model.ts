export type AgentStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed' | 'unknown'
export type GoalStatus = 'active' | 'waiting_agents' | 'waiting_external' | 'paused' | 'complete'
export type AgentInfo = {
  id: string; parentId?: string; status: string; description: string
  name?: string; type: string; teammateId?: string
}
export type AgentRecord = {
  id: string; parent_id?: string; description: string; name?: string
  status: AgentStatus; generation: number; background: boolean; teammate: boolean
  started_at: number; last_activity_at: number; tool_use_id?: string
  turn_id?: string; last_tool?: string; tool_calls: number; turns: number
  tokens: number; delivered_generation?: number; terminal_turn_id?: string
  handled_generation?: number; last_reason?: string; restored?: boolean; receipt_evidence?: string
}
export type AgentWait = { generation: number; agent_ids: string[]; entered_at: number }
export type WatcherWait = { watcher_id: string; entered_at: number; generation: number }
export type Usage = {
  turns: number; continuations: number; duration_ms: number; input_tokens: number
  output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number
  last_turn_id?: string; last_model?: string; cost_usd?: number
}
export type Goal = {
  id: string; session_id: string; objective: string; status: GoalStatus
  created_at: number; updated_at: number; completed_at?: number
  summary?: string; evidence?: string[]; usage: Usage; cost_baseline_usd?: number
  waiting_on?: WatcherWait; last_wake?: { watcher_id: string; woken_at: number; generation: number }
  agents: Record<string, AgentRecord>; dependencies: string[]; agent_wait?: AgentWait
  control_generation: number; wait_generation: number; pause_reason?: 'user' | 'blocked' | 'subagent_wait'
  coverage: 'available' | 'unavailable' | 'incomplete'
}
export type Database = {
  version: 1; goals: Record<string, Goal>; current_by_session: Record<string, string>
  watcher_notifications_by_session: Record<string, Record<string, number>>
}
export const terminal = (status: string): boolean => ['completed', 'failed', 'killed'].includes(status)
export const safeId = (id: unknown): id is string => typeof id === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(id) && !['constructor', 'prototype'].includes(id)
export const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
export const statuses: GoalStatus[] = ['active', 'waiting_agents', 'waiting_external', 'paused', 'complete']
const count = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 256 && value.every(safeId)
function validateRegistry(raw: Record<string, unknown>): void {
  if ((raw.agents !== undefined && !object(raw.agents)) ||
      (raw.dependencies !== undefined && !ids(raw.dependencies)) ||
      (raw.control_generation !== undefined && !count(raw.control_generation)) ||
      (raw.wait_generation !== undefined && !count(raw.wait_generation))) throw new Error('Invalid persisted Goal registry; preserve it for recovery')
  if (object(raw.agents)) {
    if (Object.keys(raw.agents).length > 256) throw new Error('Persisted Goal registry exceeds capacity')
    for (const [id, record] of Object.entries(raw.agents)) {
      if (!safeId(id) || !object(record) || record.id !== id ||
          !['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed', 'unknown'].includes(String(record.status)) ||
          !count(record.generation) || record.generation === 0 || typeof record.description !== 'string' ||
          typeof record.background !== 'boolean' || typeof record.teammate !== 'boolean' ||
          !count(record.tool_calls) || !count(record.turns) || !count(record.tokens) ||
          (record.parent_id !== undefined && !safeId(record.parent_id)) ||
          (record.delivered_generation !== undefined && !count(record.delivered_generation)) ||
          (record.handled_generation !== undefined && !count(record.handled_generation))) {
        throw new Error('Invalid persisted agent record; preserve it for recovery')
      }
    }
  }
  if (raw.agent_wait !== undefined) {
    if (!object(raw.agent_wait) || !ids(raw.agent_wait.agent_ids) || !raw.agent_wait.agent_ids.length ||
        !count(raw.agent_wait.generation) || !count(raw.agent_wait.entered_at)) throw new Error('Invalid persisted agent wait')
  }
  if (raw.waiting_on !== undefined) {
    if (!object(raw.waiting_on) || !safeId(raw.waiting_on.watcher_id) ||
        !count(raw.waiting_on.generation) || !count(raw.waiting_on.entered_at)) throw new Error('Invalid persisted watcher wait')
  }
  if (raw.status === 'waiting_agents' && raw.agent_wait === undefined) throw new Error('Persisted agent wait is missing its dependency set')
  if (raw.status === 'waiting_external' && raw.waiting_on === undefined) throw new Error('Persisted watcher wait is missing its watcher')
}
export function normalize(value: unknown): Database {
  const db: Database = { version: 1, goals: {}, current_by_session: {}, watcher_notifications_by_session: {} }
  if (!object(value) || value.version !== 1 || !object(value.goals)) return db
  for (const [id, raw] of Object.entries(value.goals)) {
    if (!safeId(id) || !object(raw) || !safeId(raw.session_id) || typeof raw.objective !== 'string' ||
        !statuses.includes(raw.status as GoalStatus) || !object(raw.usage) || raw.id !== id) {
      throw new Error('Invalid persisted Goal; preserve it for recovery')
    }
    validateRegistry(raw)
    const goal = raw as unknown as Goal
    goal.agents ??= {}
    goal.dependencies ??= []
    goal.control_generation ??= 0
    goal.wait_generation ??= 0
    goal.coverage ??= 'unavailable'
    db.goals[id] = goal
  }
  if (object(value.current_by_session)) for (const [session, id] of Object.entries(value.current_by_session)) {
    if (safeId(session) && safeId(id) && db.goals[id]?.session_id === session) db.current_by_session[session] = id
  }
  if (object(value.watcher_notifications_by_session)) {
    for (const [session, notifications] of Object.entries(value.watcher_notifications_by_session)) {
      if (!safeId(session) || !object(notifications)) continue
      const valid: Record<string, number> = {}
      for (const [id, at] of Object.entries(notifications)) if (safeId(id) && count(at)) valid[id] = at
      db.watcher_notifications_by_session[session] = valid
    }
  }
  return db
}
export function createGoal(id: string, session: string, objective: string, now: number): Goal {
  return {
    id, session_id: session, objective, status: 'active', created_at: now, updated_at: now,
    agents: {}, dependencies: [], control_generation: 0, wait_generation: 0, coverage: 'unavailable',
    usage: { turns: 0, continuations: 0, duration_ms: 0, input_tokens: 0, output_tokens: 0,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }
}
