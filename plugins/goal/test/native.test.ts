import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const CREATE = 'mcp__goal__CreateGoal'
const UPDATE = 'mcp__goal__UpdateGoal'
const STATUS = 'mcp__goal__GetGoalStatus'

function setup(on: On) {
  const names: string[] = []
  mock.store(on)
  const clock = mock.clock(on, { now: 1000 })
  on('session.id', () => ({ value: 'native-test-session' }))
  on('session.usage', () => ({ value: {
    startedAt: 0, context: { window: 1000000 }, rateLimits: [], cost: { usd: 0 },
  } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('tool.register', ($, e) => {
    const tool = `mcp__goal__${e.name}`
    names.push(tool)
    return { value: { tool } }
  })
  on('tool.describe', ($, e) => ({ description: e.description, isDeferred: e.isDeferred }))
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  return { names, clock }
}
function result(call: { result?: unknown }): Record<string, any> {
  if (typeof call.result !== 'string') throw new Error('Missing registered Goal tool result')
  return JSON.parse(call.result)
}

test('native admission registers all three Goal tools and exposes status', async ($, on) => {
  const { names } = setup(on)
  await $.session.start({ cwd: 'C:/goal-test', surface: null, isInteractive: false })
  expect(names).toContain(CREATE)
  expect(names).toContain(UPDATE)
  expect(names).toContain(STATUS)
  expect(result(await $.tool.call({ tool: STATUS })).goal).toBe(null)
  const description = await $.tool.describe({ tool: STATUS, description: 'fallback', isDeferred: true,
    provider: { plugin: 'goal', tier: 'user' } })
  expect(description.isDeferred).toBe(false)
})

test('native registered tools create a Goal and preserve unresolved agent waits', async ($, on) => {
  setup(on)
  await $.session.start({ cwd: 'C:/goal-test', surface: null, isInteractive: false })
  const created = result(await $.tool.call({ tool: CREATE, objective: 'Verify native tool registration and waits' }))
  expect(created.goal.status).toBe('active')
  const waited = result(await $.tool.call({ tool: UPDATE, status: 'waiting_agents', agent_ids: ['worker-1'], summary: 'Wait for the required report' }))
  expect(waited.goal.status).toBe('waiting_agents')
  const current = result(await $.tool.call({ tool: STATUS }))
  expect(current.goal.goal_id).toBe(created.goal.goal_id)
  expect(current.blocked_on).toContain('worker-1:unknown')
  const completed = await $.tool.call({ tool: UPDATE, status: 'complete', summary: 'Unsupported claim', evidence: ['claimed'] })
  expect(completed.deny).toMatch(/unresolved/)
})

test('native timer continues active work but does not continue a paused Goal', async ($, on) => {
  const { clock } = setup(on)
  const prompts: string[] = []
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text, context: e.context, origin: e.origin }
  })
  await $.session.start({ cwd: 'C:/goal-test', surface: null, isInteractive: false })
  await $.tool.call({ tool: CREATE, objective: 'Verify native continuation and pause' })
  await $.turn.complete({ turnId: 'native-active', answer: 'Continue the next step', reason: 'answer', durationMs: 1, isAborted: false })
  await clock.advance(150)
  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('Goal continuation')
  await $.tool.call({ tool: UPDATE, status: 'paused', summary: 'User paused' })
  await $.turn.complete({ turnId: 'native-paused', answer: 'Keep pause', reason: 'answer', durationMs: 1, isAborted: false })
  await clock.advance(150)
  expect(prompts.length).toBe(1)
})
