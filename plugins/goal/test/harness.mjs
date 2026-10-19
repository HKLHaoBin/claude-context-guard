import { register } from '../hooks/register.ts'

export function harness(options = {}) {
  const store = options.store ?? new Map()
  const hooks = new Map()
  const timers = []
  const accepted = []
  const logs = []
  let agents = options.agents ?? []
  let now = 1000
  const clone = value => value === undefined ? undefined : structuredClone(value)
  const host = {
    store: { get: async key => clone(store.get(key)), set: async (key, value) => { store.set(key, clone(value)) } },
    session: { id: async () => options.session ?? 'test-session', usage: async () => ({ cost: { usd: 0 } }) },
    clock: { now: async () => now, after: (ms, fn) => { timers.push(fn) } },
    agent: options.noAgentList ? undefined : { list: async () => clone(agents) },
    tool: { register: async () => undefined },
    ui: { status: () => undefined, log: text => { logs.push(text) } },
    prompt: { submit: async ({ text }) => emit('prompt.submit', { text, origin: { kind: 'plugin', name: 'goal' } }) },
  }
  register((name, matcher, hook) => {
    if (typeof matcher === 'function') { hook = matcher; matcher = {} }
    const handlers = hooks.get(name) ?? []
    handlers.push({ matcher, hook })
    hooks.set(name, handlers)
  })
  async function emit(name, input, core) {
    const chain = hooks.get(name) ?? []
    async function run(index, event) {
      if (index === chain.length) {
        if (core) return core(event)
        if (name === 'prompt.submit') { accepted.push(event); return { text: event.text, context: event.context, origin: event.origin } }
        if (name === 'turn.complete') return { text: event.answer }
        if (name === 'turn.start') return { turnId: event.turnId }
        return {}
      }
      const { matcher, hook } = chain[index]
      if (Object.entries(matcher).some(([key, value]) => event[key] !== value)) return run(index + 1, event)
      return hook(host, event, changed => run(index + 1, changed))
    }
    return run(0, input)
  }
  async function call(tool, input = {}, agentId) {
    const response = await emit('tool.call', { ...input, tool: `mcp__goal__${tool}`, ...(agentId ? { agentId } : {}) })
    return typeof response.result === 'string' ? JSON.parse(response.result) : response
  }
  async function start() { await emit('session.start', {}) }
  async function status() { return call('GetGoalStatus') }
  async function create() { await start(); return call('CreateGoal', { objective: 'Implement and verify the complete objective' }) }
  async function spawn(id, overrides = {}) {
    const info = { id, status: 'running', description: 'worker', type: 'general-purpose', ...overrides }
    agents = [...agents.filter(a => a.id !== id), info]
    await emit('agent.spawn', { tool_use_id: overrides.tool_use_id ?? `spawn-${id}`, description: 'worker', background: true,
      ...overrides }, async event => {
      if (overrides.startBeforeReturn) await emit('turn.start', { agentId: id, turnId: `turn-${id}`, text: 'worker' })
      return { agentId: id }
    })
    if (!overrides.startBeforeReturn) await emit('turn.start', { agentId: id, turnId: overrides.turnId ?? `turn-${id}`, text: 'worker' })
  }
  async function end(id, status = 'completed', turnId = `turn-${id}`, reason = 'answer') {
    agents = agents.map(a => a.id === id ? { ...a, status } : a)
    await emit('turn.complete', { agentId: id, turnId, reason, answer: 'report', durationMs: 10,
      usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'fixture' } })
  }
  async function notify(id, status = 'completed', toolUseId = `spawn-${id}`) {
    return emit('prompt.submit', { text: `<task-notification><task-id>${id}</task-id><status>${status}</status>${toolUseId ? `<tool-use-id>${toolUseId}</tool-use-id>` : ''}</task-notification>`,
      origin: { kind: 'task-notification' } })
  }
  return { host, store, accepted, logs, emit, call, start, status, create, spawn, end, notify,
    setAgents: value => { agents = value },
    advance: async () => { now += 150; const batch = timers.splice(0); for (const fn of batch) await fn() },
    turn: (id = 'parent-turn') => emit('turn.complete', { turnId: id, reason: 'answer', answer: 'parent', durationMs: 10 }),
  }
}
