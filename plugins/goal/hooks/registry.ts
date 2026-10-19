import { safeId, terminal, type AgentInfo, type AgentRecord, type AgentStatus, type Goal } from './model.ts'

const known = new Set(['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed'])
const MAX_AGENTS = 256
export function ensure(goal: Goal, id: string, now: number): AgentRecord | undefined {
  if (!safeId(id)) return
  if (!Object.hasOwn(goal.agents, id)) {
    if (Object.keys(goal.agents).length >= MAX_AGENTS) { goal.coverage = 'incomplete'; return }
    goal.agents[id] = { id, description: '', status: 'unknown', generation: 1, background: true,
      teammate: false, started_at: now, last_activity_at: now, tool_calls: 0, turns: 0, tokens: 0 }
  }
  return goal.agents[id]
}
function nextRun(record: AgentRecord, now: number): void {
  record.generation++
  record.started_at = now
  delete record.delivered_generation
  delete record.terminal_turn_id
  delete record.receipt_evidence
  delete record.turn_id
  delete record.last_reason
  delete record.handled_generation
  delete record.tool_use_id
}
export function spawned(goal: Goal, input: { id: string; parentId?: string; description?: string;
  background?: boolean; toolUseId?: string; name?: string }, now: number): void {
  const existed = Object.hasOwn(goal.agents, input.id)
  const r = ensure(goal, input.id, now)
  if (!r) return
  // turn.start can precede the return from agent.spawn; do not count that run twice.
  if (existed && input.toolUseId && r.tool_use_id && input.toolUseId !== r.tool_use_id) nextRun(r, now)
  r.parent_id = input.parentId ?? r.parent_id
  r.description = (input.description ?? r.description).slice(0, 1000)
  r.name = input.name ?? r.name
  r.background = input.background ?? r.background
  r.tool_use_id = input.toolUseId ?? r.tool_use_id
  if (!r.turn_id || !terminal(r.status)) r.status = 'running'
  r.last_activity_at = now
  delete r.restored
}
export function turnStarted(goal: Goal, id: string, turnId: string, now: number): void {
  const r = ensure(goal, id, now)
  if (!r || r.turn_id === turnId) return
  if (r.turn_id || terminal(r.status) || r.terminal_turn_id) nextRun(r, now)
  r.turn_id = turnId
  r.turns++
  r.status = 'running'
  r.last_activity_at = now
  delete r.restored
}
export function activity(goal: Goal, id: string, tool: string | undefined, now: number): void {
  const r = ensure(goal, id, now)
  if (!r) return
  if (terminal(r.status)) {
    if (!tool) return
    nextRun(r, now); r.status = 'running'
  }
  if (tool) { r.last_tool = tool.slice(0, 100); r.tool_calls++ }
  r.last_activity_at = now
}
export function turnEnded(goal: Goal, id: string, turnId: string, reason: string, now: number, tokens = 0): void {
  const r = ensure(goal, id, now)
  if (!r || (r.turn_id && r.turn_id !== turnId) || r.terminal_turn_id === turnId) return
  r.turn_id ??= turnId
  r.terminal_turn_id = turnId
  r.last_reason = reason
  r.tokens += Math.max(0, tokens)
  r.last_activity_at = now
  // An answer ends a turn, not necessarily an agent waiting on its own background work.
  if (reason !== 'answer') r.status = reason === 'aborted' ? 'killed' : 'failed'
}
export function snapshot(goal: Goal, agents: AgentInfo[] | undefined, now: number): void {
  if (!agents) { goal.coverage = 'unavailable'; return }
  if (goal.coverage !== 'incomplete') goal.coverage = 'available'
  const seen = new Set<string>()
  for (const info of agents) {
    const r = ensure(goal, info.id, now)
    if (!r) continue
    seen.add(info.id)
    const status: AgentStatus = known.has(info.status) ? info.status as AgentStatus : 'unknown'
    const teammate = !!info.teammateId || info.type === 'teammate'
    // A trusted terminal report outranks a stale roster; new turn/spawn events advance the run.
    const reported = terminal(r.status) && r.delivered_generation === r.generation && !r.restored
    if (terminal(r.status) && !terminal(status) && status !== 'unknown' && !reported && !(teammate && status === 'idle')) nextRun(r, now)
    r.parent_id = info.parentId ?? r.parent_id
    r.description = info.description.slice(0, 1000)
    r.name = info.name ?? r.name
    r.teammate = teammate
    // A snapshot after a reload cannot identify a run missed while the plugin was absent.
    r.status = reported && !terminal(status) && !(teammate && status === 'idle') ? r.status :
      r.restored && !terminal(r.status) && terminal(status) ? 'unknown' : status
    if (!terminal(status)) delete r.restored
    if (terminal(r.status) && !r.background && r.terminal_turn_id) r.delivered_generation = r.generation
  }
  for (const r of Object.values(goal.agents)) {
    if (!seen.has(r.id) && !terminal(r.status)) r.status = 'unknown'
  }
}
export function restore(goal: Goal): void {
  for (const r of Object.values(goal.agents)) {
    r.restored = true
    if (!terminal(r.status)) r.status = 'unknown'
  }
}
export function required(goal: Goal, roots = goal.dependencies): AgentRecord[] {
  const ids = new Set(roots)
  let changed = true
  while (changed) {
    changed = false
    for (const r of Object.values(goal.agents)) if (r.parent_id && ids.has(r.parent_id) && !ids.has(r.id)) {
      ids.add(r.id); changed = true
    }
  }
  return [...ids].map(id => Object.hasOwn(goal.agents, id) ? goal.agents[id] : undefined).filter((r): r is AgentRecord => !!r)
}
export const settled = (r: AgentRecord): boolean => terminal(r.status) ||
  (r.teammate && r.status === 'idle' && !!r.terminal_turn_id)
export const failed = (r: AgentRecord): boolean => ['failed', 'killed'].includes(r.status) ||
  ['error', 'refusal', 'aborted'].includes(r.last_reason ?? '')
export function blockers(goal: Goal, roots = goal.dependencies): string[] {
  const reasons: string[] = []
  for (const id of roots) if (!Object.hasOwn(goal.agents, id)) reasons.push(`${id}:unknown`)
  for (const r of required(goal, roots)) {
    if (!settled(r)) reasons.push(`${r.id}:${r.status}`)
    else if (roots.includes(r.id) && r.delivered_generation !== r.generation) reasons.push(`${r.id}:result_pending`)
  }
  if (goal.coverage === 'incomplete' && roots.length) reasons.push('registry:incomplete')
  return reasons
}
export function enterWait(goal: Goal, ids: string[], now: number): void {
  if (!ids.length || ids.length > MAX_AGENTS || ids.some(id => !safeId(id))) throw new Error('agent_ids must contain 1-256 valid agent IDs')
  goal.dependencies = [...new Set([...goal.dependencies, ...ids])]
  for (const id of ids) ensure(goal, id, now)
  goal.control_generation++
  goal.wait_generation++
  goal.agent_wait = { generation: goal.wait_generation, agent_ids: [...new Set(ids)], entered_at: now }
  goal.status = 'waiting_agents'
  settleWait(goal)
}
export function settleWait(goal: Goal): boolean {
  if (goal.status !== 'waiting_agents' || !goal.agent_wait || blockers(goal, goal.agent_wait.agent_ids).length) return false
  goal.status = 'active'
  goal.control_generation++
  delete goal.agent_wait
  goal.summary = 'Required agent results received. Reconcile failures and verify the original objective; execution ending is not Goal completion.'
  return true
}
export type Notification = { id: string; status: 'completed' | 'failed' | 'killed'; toolUseId?: string }
export function parseNotification(text: string): Notification | undefined {
  // Only called for engine-stamped task-notification provenance, never arbitrary tool output.
  const id = text.match(/<task-id>\s*([^<]+?)\s*<\/task-id>/)?.[1]
  const raw = text.match(/<status>\s*(completed|failed|killed|stopped)\s*<\/status>/)?.[1]
  if (!safeId(id) || !raw) return
  const toolUseId = text.match(/<tool-use-id>\s*([^<]+?)\s*<\/tool-use-id>/)?.[1]
  if (toolUseId !== undefined && !safeId(toolUseId)) return
  return { id, status: raw === 'stopped' ? 'killed' : raw as Notification['status'], toolUseId }
}
export function notified(goal: Goal, n: Notification, now: number): 'accepted' | 'duplicate' | 'ambiguous' | 'unrelated' {
  const r = Object.hasOwn(goal.agents, n.id) ? goal.agents[n.id] : undefined
  if (!r) return 'unrelated'
  if (n.toolUseId && r.tool_use_id && n.toolUseId !== r.tool_use_id) return 'ambiguous'
  // Reused IDs without a run reference cannot disambiguate an old notification from a new one.
  if (r.generation > 1 && (!n.toolUseId || !r.tool_use_id)) return 'ambiguous'
  const exactRun = !!n.toolUseId && n.toolUseId === r.tool_use_id
  if (goal.coverage === 'available' && !terminal(r.status) && r.status !== 'unknown' &&
      !(r.status === 'running' && exactRun)) return 'ambiguous'
  if (r.delivered_generation === r.generation && terminal(r.status)) return 'duplicate'
  if (r.restored) return 'ambiguous'
  r.status = n.status
  r.delivered_generation = r.generation
  r.last_activity_at = now
  settleWait(goal)
  return 'accepted'
}
export function acknowledge(goal: Goal, id: string, generation: number, evidence: string): void {
  const r = Object.hasOwn(goal.agents, id) ? goal.agents[id] : undefined
  if (!r || r.generation !== generation || !settled(r) || !evidence.trim()) {
    throw new Error('A receipt requires the current generation, a known terminal agent, and evidence that its result was read')
  }
  r.delivered_generation = generation
  r.receipt_evidence = evidence.trim().slice(0, 1000)
  settleWait(goal)
}
