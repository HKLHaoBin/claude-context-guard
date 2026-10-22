import type { Register } from 'claude-code'
import type { Host } from './host.ts'
import { createGoal, normalize, object, safeId, statuses, terminal, type Database, type Goal, type GoalStatus } from './model.ts'
import { acknowledge, activity, blockers, enterWait, failed, notified, parseNotification, required, restore, settleWait,
  snapshot, spawned, settled, turnEnded, turnStarted } from './registry.ts'
import { tools } from './schemas.ts'

const PREFIX = 'mcp__goal__'
const LEGACY_KEY = 'goals-v1'
const TTL = 7 * 24 * 60 * 60 * 1000
let showStatus = false
const json = (value: unknown) => ({ result: JSON.stringify(value) })
const text = (x: unknown): string => typeof x === 'string' ? x.trim() : ''
function visible(goal: Goal | undefined) {
  if (!goal) return { goal: null }
  return { goal: { ...goal, goal_id: goal.id }, blocked_on: blockers(goal),
    capabilities: { agent_list: goal.coverage, workflow_internal_agents: false },
    progress: required(goal).map(r => ({ id: r.id, parent_id: r.parent_id, name: r.name, description: r.description,
      status: r.status, generation: r.generation, last_activity_at: r.last_activity_at,
      last_tool: r.last_tool, tool_calls: r.tool_calls, turns: r.turns, tokens: r.tokens,
      result_received: r.delivered_generation === r.generation })) }
}
function status(host: Host, goal: Goal | undefined): void {
  // Display only: desktop/SDK hosts may append each status call to the transcript.
  if (!showStatus) return
  if (!goal || goal.status === 'complete') { host.ui.status(undefined); return }
  const agents = goal.agent_wait?.agent_ids ?? goal.dependencies
  const count = agents.filter(id => Object.hasOwn(goal.agents, id) && settled(goal.agents[id]) &&
    goal.agents[id]?.delivered_generation === goal.agents[id]?.generation).length
  const suffix = agents.length ? ` · results ${count}/${agents.length}` : ''
  host.ui.status(`Goal ${goal.status}${suffix} · ${goal.objective.replace(/\s+/g, ' ').slice(0, 64)}`)
}
async function sync(host: Host, goal: Goal, now: number): Promise<void> {
  try {
    // Host nouns must use direct calls; missing capabilities are caught below.
    const list = await host.agent!.list()
    if (list && (!Array.isArray(list) || list.some(r => !r || !safeId(r.id) || typeof r.status !== 'string' || typeof r.description !== 'string'))) {
      goal.coverage = 'incomplete'; return
    }
    snapshot(goal, list, now)
  } catch { snapshot(goal, undefined, now) }
}
function continuation(goal: Goal): string {
  return `Goal continuation ${goal.id} generation ${goal.control_generation}\n\nObjective: ${goal.objective}\n\n` +
    'Perform the next concrete work and preserve the full objective. Declare waiting_agents with exact required IDs only when no independent parent work remains. ' +
    'A direct external watcher uses waiting_external and its task ID, not an agent ID. ' +
    'Read worker reports, reconcile failures and unknown states, and verify objective evidence before completing the Goal.'
}

// Native admission follows the host only through module-level helper declarations.
// One worker serializes its read-modify-write operations; per-session keys isolate different sessions.
let tail: Promise<unknown> = Promise.resolve()
const pending = new Set<string>()
async function transaction<T>(host: Host, fn: (db: Database, goal: Goal | undefined, session: string, now: number) => T | Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    const session = await host.session.id()
    if (!safeId(session)) throw new Error('Unsupported session ID')
    const key = `goal-session-v2/${session}`
    const saved = await host.store.get(key)
    const value = saved ?? await host.store.get(LEGACY_KEY)
    if (value !== undefined && (!object(value) || value.version !== 1)) throw new Error('Unsupported Goal store; preserve it and migrate explicitly')
    const db = normalize(value)
    // Import this session only. Never rewrite another process's legacy database.
    for (const [id, record] of Object.entries(db.goals)) if (record.session_id !== session) delete db.goals[id]
    for (const id of Object.keys(db.current_by_session)) if (id !== session) delete db.current_by_session[id]
    for (const id of Object.keys(db.watcher_notifications_by_session)) if (id !== session) delete db.watcher_notifications_by_session[id]
    const goal = db.goals[db.current_by_session[session]]
    const result = await fn(db, goal, session, await host.clock.now())
    await host.store.set(key, db)
    status(host, db.goals[db.current_by_session[session]])
    return result
  })
  tail = run.catch(() => undefined)
  return run
}
const logFailure = (host: Host) => { host.ui.log('goal: host operation failed; no completion was inferred') }
async function queue(host: Host): Promise<void> {
  const ticket = await transaction(host, (_db, goal) => {
    if (!goal || goal.status !== 'active') return
    const key = `${goal.id}:${goal.control_generation}`
    if (pending.has(key)) return
    pending.add(key)
    return { key, id: goal.id, generation: goal.control_generation }
  })
  if (!ticket) return
  host.clock.after(150, async () => {
      try {
        const prompt = await transaction(host, (_db, goal) => {
          if (!goal || goal.id !== ticket.id || goal.status !== 'active' || goal.control_generation !== ticket.generation) return
          return continuation(goal)
        })
        // Never hold the persistence queue while calling a hook that re-enters it.
        if (prompt) await host.prompt.submit({ text: prompt })
      } catch { logFailure(host) }
      finally { pending.delete(ticket.key) }
  })
}

export const register: Register = (on, options) => {
  showStatus = options.showStatus === true
  on('session.start', async (host, event, next) => {
    for (const tool of tools) await host.tool.register(tool)
    const result = await next(event)
    await transaction(host, async (_db, goal, _session, now) => {
      if (!goal || goal.status === 'complete') return
      goal.control_generation++
      restore(goal)
      await sync(host, goal, now)
    })
    await queue(host)
    return result
  })
  on('tool.describe', (host, event, next) => next(event.tool.startsWith(PREFIX) ? { ...event, isDeferred: false } : event))

  on('tool.call', async (host, event, next) => {
    if (!event.tool.startsWith(PREFIX)) {
      if (event.agentId) await transaction(host, (_db, goal, _s, now) => { if (goal && goal.status !== 'complete') activity(goal, event.agentId!, event.tool, now) })
      const result = await next(event)
      if (event.agentId) await transaction(host, (_db, goal, _s, now) => { if (goal && goal.status !== 'complete') activity(goal, event.agentId!, undefined, now) })
      return result
    }
    if (!tools.some(t => PREFIX + t.name === event.tool)) return next(event)
    if (event.agentId && event.tool !== PREFIX + 'GetGoalStatus') return { deny: 'Only the parent loop may change its Goal' }
    try {
      return await transaction(host, async (db, current, session, now) => {
        if (event.tool === PREFIX + 'GetGoalStatus') {
          if (current && current.status !== 'complete') { await sync(host, current, now); settleWait(current) }
          return json(visible(current))
        }
        if (event.tool === PREFIX + 'CreateGoal') {
          const objective = text(event.objective)
          if (!objective || objective.length > 32000) throw new Error('objective must contain 1-32000 characters')
          if (current && current.status !== 'complete') throw new Error('A Goal already exists; reuse its goal_id')
          const goal = createGoal(`goal_${now.toString(36)}_${crypto.randomUUID().slice(0, 8)}`, session, objective, now)
          try { goal.cost_baseline_usd = (await host.session.usage()).cost?.usd } catch { /* Optional host accounting. */ }
          db.goals[goal.id] = goal
          db.current_by_session[session] = goal.id
          return json({ created: true, ...visible(goal) })
        }
        const id = text(event.goal_id) || current?.id
        const goal = id && safeId(id) ? db.goals[id] : undefined
        if (!goal || goal.session_id !== session) throw new Error('No Goal exists for this session')
        if (goal.status === 'complete') return event.status === 'complete' ? json({ updated: false, ...visible(goal) }) : { deny: 'A completed Goal cannot be resumed' }
        const target = event.status as GoalStatus
        if (!statuses.includes(target)) throw new Error('Invalid Goal status')
        const summary = text(event.summary)
        if (!summary || summary.length > 20000) throw new Error('summary must contain 1-20000 characters')
        await sync(host, goal, now)
        if (event.received_results !== undefined) {
          if (!Array.isArray(event.received_results) || event.received_results.length > 256) throw new Error('Invalid received_results')
          for (const receipt of event.received_results) {
            if (!object(receipt) || !safeId(receipt.agent_id) || !Number.isInteger(receipt.generation) || !text(receipt.evidence)) throw new Error('Invalid result receipt')
            acknowledge(goal, receipt.agent_id, receipt.generation as number, text(receipt.evidence))
            if (receipt.handled === true) goal.agents[receipt.agent_id].handled_generation = receipt.generation as number
          }
        }
        if (goal.status === 'waiting_external' && target !== 'waiting_external' && target !== 'paused') {
          throw new Error('Preserve the current watcher contract until its matching completion; pause explicitly to suspend it')
        }
        if (event.agent_ids !== undefined && target !== 'waiting_agents') throw new Error('agent_ids belongs to waiting_agents')
        if (target === 'complete') {
          const evidence = event.evidence
          if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 50 || evidence.some(x => !text(x))) throw new Error('Completion requires concrete objective evidence')
          const blocked = blockers(goal)
          const failures = required(goal).filter(r => failed(r) && r.handled_generation !== r.generation)
          if (blocked.length || failures.length || goal.waiting_on) throw new Error(`Dependencies are unresolved: ${[...blocked, ...failures.map(r => `${r.id}:failure_not_reconciled`)].join(', ') || 'watcher'}`)
          goal.evidence = evidence.map(x => text(x).slice(0, 4000))
          goal.completed_at = now
          goal.status = 'complete'
          delete goal.agent_wait
        } else if (target === 'waiting_agents') {
          if (!Array.isArray(event.agent_ids) || event.agent_ids.some(x => typeof x !== 'string')) throw new Error('waiting_agents requires exact agent_ids')
          if (goal.waiting_on) throw new Error('The external watcher contract must be resolved first')
          enterWait(goal, event.agent_ids as string[], now)
          delete goal.pause_reason
        } else if (target === 'waiting_external') {
          const watcher = text(event.watcher_id)
          if (!safeId(watcher) || Object.hasOwn(goal.agents, watcher)) throw new Error('watcher_id must name a direct background task, never an agent')
          if (goal.waiting_on && goal.waiting_on.watcher_id !== watcher) throw new Error('Resolve the existing watcher before replacing it')
          const received = db.watcher_notifications_by_session[session]?.[watcher]
          if (received !== undefined && now - received < TTL) {
            goal.status = 'active'
            goal.last_wake = { watcher_id: watcher, generation: ++goal.wait_generation, woken_at: received }
            delete goal.waiting_on
          } else {
            goal.status = 'waiting_external'
            goal.waiting_on ??= { watcher_id: watcher, entered_at: now, generation: ++goal.wait_generation }
          }
          delete goal.agent_wait
          delete goal.pause_reason
        } else if (target === 'paused') {
          goal.status = 'paused'
          goal.pause_reason = event.pause_reason === 'blocked' ? 'blocked' : 'user'
          // Keep suspended wait contracts; a notification cannot override the pause.
        } else {
          if (goal.status === 'paused' && goal.waiting_on) {
            const received = db.watcher_notifications_by_session[session]?.[goal.waiting_on.watcher_id]
            if (received !== undefined && now - received < TTL) {
              goal.last_wake = { watcher_id: goal.waiting_on.watcher_id, generation: goal.waiting_on.generation, woken_at: received }
              delete goal.waiting_on
              goal.status = 'active'
            } else goal.status = 'waiting_external'
          } else if (goal.agent_wait && (goal.status === 'paused' || goal.status === 'waiting_agents')) {
            goal.status = 'waiting_agents'
            settleWait(goal)
          } else { goal.status = 'active'; delete goal.agent_wait }
          delete goal.pause_reason
        }
        goal.summary = summary
        goal.updated_at = now
        goal.control_generation++
        return json({ updated: true, ...visible(goal) })
      })
    } catch (error) { return { deny: error instanceof Error ? error.message : 'Goal update failed' } }
  })

  on('agent.spawn', async (host, event, next) => {
    const prepared = event.resume ? await transaction(host, (_db, goal, _s, now) => {
      if (!goal || goal.status === 'complete') return
      const before = Object.hasOwn(goal.agents, event.resume!.agentId) ? goal.agents[event.resume!.agentId] : undefined
      const saved = before ? JSON.parse(JSON.stringify(before)) as typeof before : undefined
      spawned(goal, { id: event.resume!.agentId, toolUseId: event.tool_use_id,
        parentId: event.parentAgentId, description: event.description, background: event.background, name: event.name }, now)
      return { goal_id: goal.id, before: saved }
    }) : undefined
    const rollback = async () => {
      if (!prepared || !event.resume) return
      await transaction(host, (_db, goal) => {
        const record = goal?.agents[event.resume!.agentId]
        if (!goal || !record || goal.id !== prepared.goal_id || record.tool_use_id !== event.tool_use_id) return
        if (prepared.before) goal.agents[record.id] = prepared.before
        else delete goal.agents[record.id]
      })
    }
    let result: Awaited<ReturnType<typeof next>>
    try { result = await next(event) } catch (error) { await rollback(); throw error }
    if (result.deny) await rollback()
    if (result.agentId) await transaction(host, (_db, goal, _s, now) => {
      if (!goal || goal.status === 'complete') return
      const record = Object.hasOwn(goal.agents, result.agentId!) ? goal.agents[result.agentId!] : undefined
      if (record?.tool_use_id && record.tool_use_id !== event.tool_use_id) return
      spawned(goal, { id: result.agentId!, toolUseId: event.tool_use_id,
        parentId: event.parentAgentId, description: event.description, background: event.background, name: event.name }, now)
    })
    return result
  })
  on('turn.start', async (host, event, next) => {
    await transaction(host, (_db, goal, _s, now) => {
      if (!goal || goal.status === 'complete') return
      if (event.agentId) turnStarted(goal, event.agentId, event.turnId, now)
      else goal.control_generation++
    })
    return next(event)
  })
  on('turn.complete', async (host, event, next) => {
    const result = await next(event)
    await transaction(host, async (_db, goal, _s, now) => {
      if (!goal || goal.status === 'complete') return
      if (event.agentId) {
        turnEnded(goal, event.agentId, event.turnId, event.reason, now, event.usage?.output_tokens)
        await sync(host, goal, now)
        // The native background notification, not this hook, wakes the parent exactly once.
        return
      }
      if (goal.usage.last_turn_id !== event.turnId) {
        goal.usage.last_turn_id = event.turnId
        goal.usage.turns++
        goal.usage.duration_ms += event.durationMs
        if (event.usage) {
          for (const field of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const) goal.usage[field] += event.usage[field]
          goal.usage.last_model = event.usage.model
        }
        try {
          const cost = (await host.session.usage()).cost?.usd
          if (cost !== undefined && goal.cost_baseline_usd !== undefined) goal.usage.cost_usd = Math.max(0, cost - goal.cost_baseline_usd)
        } catch { /* Token accounting remains available without cost accounting. */ }
      }
      goal.updated_at = now
    })
    if (!event.agentId && event.reason === 'answer') await queue(host)
    return result
  })

  on('prompt.submit', async (host, event, next) => {
    const decision = await transaction<{ drop?: string; context?: string[] }>(host, async (db, goal, session, now) => {
      const notification = event.origin.kind === 'task-notification' ? parseNotification(event.text) : undefined
      if (notification) {
        const remembered = db.watcher_notifications_by_session[session] ??= {}
        remembered[notification.id] = now
        for (const [id, at] of Object.entries(remembered)) if (now - at > TTL) delete remembered[id]
        for (const [id] of Object.entries(remembered).sort((a, b) => b[1] - a[1]).slice(100)) delete remembered[id]
      }
      const own = event.origin.kind === 'plugin' && event.origin.name === 'goal'
      if (!goal || goal.status === 'complete') return own ? { drop: 'Stale or completed Goal continuation' } : {}
      if (own) {
        const match = event.text.match(/^Goal continuation ([A-Za-z0-9_]+) generation (\d+)\n/)
        if (!match || match[1] !== goal.id || Number(match[2]) !== goal.control_generation || goal.status !== 'active') return { drop: 'Stale or suspended Goal continuation' }
        goal.control_generation++
        goal.usage.continuations++
      }
      let notice = ''
      if (notification) {
        await sync(host, goal, now)
        const outcome = notified(goal, notification, now)
        if (outcome === 'duplicate') return { drop: 'Duplicate result for this agent run' }
        if (outcome === 'ambiguous') notice = 'This notification does not identify the current agent run. Read the current report and acknowledge its exact generation; preserve the waiting/paused state.'
        const wait = goal.waiting_on
        if (goal.status === 'waiting_external' && wait?.watcher_id === notification.id) {
          goal.status = 'active'
          goal.last_wake = { watcher_id: wait.watcher_id, generation: wait.generation, woken_at: now }
          delete goal.waiting_on
        } else if (goal.last_wake?.watcher_id === notification.id && outcome === 'unrelated' && !wait) return { drop: 'Duplicate watcher completion' }
      }
      if (!own) goal.control_generation++
      return { context: [`Persistent Goal ${goal.id} is ${goal.status}. Objective: ${goal.objective}`,
        `Required dependencies still unresolved: ${blockers(goal).join(', ') || 'none'}. Execution ending never proves objective completion.`,
        goal.status === 'paused' ? 'Preserve this explicit pause until the user resumes it.' :
          goal.status.startsWith('waiting_') ? 'Preserve the current wait. Process delivered results without polling, duplicate workers or fallback continuations.' :
          'Continue concrete work; verify evidence before completing.', notice].filter(Boolean) }
    })
    if (decision.drop) return { drop: decision.drop }
    return next({ ...event, context: [...(event.context ?? []), ...(decision.context ?? [])] })
  })
}
