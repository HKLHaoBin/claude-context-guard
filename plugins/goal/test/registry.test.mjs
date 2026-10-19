import test from 'node:test'
import assert from 'node:assert/strict'
import { createGoal, normalize } from '../hooks/model.ts'
import { acknowledge, blockers, enterWait, notified, parseNotification, snapshot, spawned, turnEnded,
  turnStarted, restore, settleWait } from '../hooks/registry.ts'

const goal = () => createGoal('goal-1', 'session-1', 'verified objective', 1)
const info = (id, status = 'running', extra = {}) => ({ id, status, type: 'general-purpose', description: 'work', ...extra })
function launch(g, id = 'a', tool = `spawn-${id}`) {
  spawned(g, { id, toolUseId: tool }, 2)
  turnStarted(g, id, `turn-${id}`, 3)
}
function finish(g, id = 'a', status = 'completed', tool = `spawn-${id}`) {
  turnEnded(g, id, `turn-${id}`, status === 'failed' ? 'error' : 'answer', 4)
  snapshot(g, [info(id, status)], 5)
  return notified(g, { id, status, toolUseId: tool }, 6)
}

test('starting workers leaves independent parent work active', () => {
  const g = goal(); launch(g)
  assert.equal(g.status, 'active')
  assert.deepEqual(g.dependencies, [])
})
test('join waits for all required results, not unrelated workers', () => {
  const g = goal(); launch(g, 'a'); launch(g, 'b'); launch(g, 'unrelated')
  enterWait(g, ['a', 'b'], 3)
  finish(g, 'a')
  assert.equal(g.status, 'waiting_agents')
  assert.notDeepEqual(blockers(g), [])
  finish(g, 'b')
  assert.equal(g.status, 'active')
  assert.notEqual(g.status, 'complete')
})
test('terminal execution waits for the report delivery', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3)
  turnEnded(g, 'a', 'turn-a', 'answer', 4)
  snapshot(g, [info('a', 'completed')], 5)
  assert.deepEqual(blockers(g), ['a:result_pending'])
  assert.equal(g.status, 'waiting_agents')
})
test('completion and delivery before wait registration cannot deadlock', () => {
  const g = goal(); launch(g); finish(g)
  enterWait(g, ['a'], 8)
  assert.equal(g.status, 'active')
})
test('answer while agent owns background work is not terminal', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3)
  turnEnded(g, 'a', 'turn-a', 'answer', 4)
  snapshot(g, [info('a', 'waiting')], 5)
  assert.equal(notified(g, { id: 'a', status: 'completed', toolUseId: 'spawn-a' }, 6), 'ambiguous')
  assert.deepEqual(blockers(g), ['a:waiting'])
})
test('required descendants gate the result even when the root stopped', () => {
  const g = goal(); launch(g)
  spawned(g, { id: 'nested', parentId: 'a' }, 3)
  enterWait(g, ['a'], 3); finish(g)
  assert.equal(g.status, 'waiting_agents')
  assert.ok(blockers(g).some(x => x.startsWith('nested:')))
})
test('cycles in parent relations terminate traversal', () => {
  const g = goal(); launch(g, 'a'); launch(g, 'b')
  g.agents.a.parent_id = 'b'; g.agents.b.parent_id = 'a'
  enterWait(g, ['a'], 4)
  assert.equal(blockers(g).length, 2)
})
test('failed execution resumes reconciliation, never Goal completion', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3); finish(g, 'a', 'failed')
  assert.equal(g.status, 'active')
  assert.equal(g.agents.a.status, 'failed')
  assert.equal(g.agents.a.handled_generation, undefined)
})
test('user pause survives child completion', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3)
  g.status = 'paused'; g.pause_reason = 'user'
  finish(g)
  assert.equal(g.status, 'paused')
  g.status = 'waiting_agents'; settleWait(g)
  assert.equal(g.status, 'active')
})
test('same ID resume fences old invocation and permits the new result', () => {
  const g = goal(); launch(g); finish(g)
  spawned(g, { id: 'a', toolUseId: 'resume-a' }, 10)
  turnStarted(g, 'a', 'turn-a-2', 11)
  assert.equal(g.agents.a.generation, 2)
  enterWait(g, ['a'], 12)
  assert.equal(notified(g, { id: 'a', status: 'completed', toolUseId: 'spawn-a' }, 13), 'ambiguous')
  turnEnded(g, 'a', 'turn-a-2', 'answer', 14)
  snapshot(g, [info('a', 'completed')], 15)
  assert.equal(notified(g, { id: 'a', status: 'completed', toolUseId: 'resume-a' }, 16), 'accepted')
  assert.equal(g.status, 'active')
  assert.equal(notified(g, { id: 'a', status: 'completed', toolUseId: 'resume-a' }, 17), 'duplicate')
})
test('unversioned resumed notification remains pending until an explicit current receipt', () => {
  const g = goal(); launch(g); finish(g)
  turnStarted(g, 'a', 'turn-a-2', 10)
  turnEnded(g, 'a', 'turn-a-2', 'answer', 11)
  snapshot(g, [info('a', 'completed')], 12)
  enterWait(g, ['a'], 13)
  assert.equal(notified(g, { id: 'a', status: 'completed' }, 14), 'ambiguous')
  acknowledge(g, 'a', 2, 'Read the report from turn-a-2')
  assert.equal(g.status, 'active')
  assert.throws(() => acknowledge(g, 'a', 1, 'old report'))
})
test('late old turn.complete cannot terminate a resumed run', () => {
  const g = goal(); launch(g); finish(g); turnStarted(g, 'a', 'new-turn', 10)
  turnEnded(g, 'a', 'turn-a', 'error', 11)
  assert.equal(g.agents.a.status, 'running')
  assert.equal(g.agents.a.turn_id, 'new-turn')
})
test('spawn callback after turn.start does not increment the generation twice', () => {
  const g = goal(); turnStarted(g, 'a', 'turn-a', 2)
  spawned(g, { id: 'a', toolUseId: 'spawn-a' }, 3)
  assert.equal(g.agents.a.generation, 1)
})
test('missing agents and unsupported snapshots remain unknown, never complete', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3)
  snapshot(g, [], 4)
  assert.equal(g.agents.a.status, 'unknown')
  snapshot(g, undefined, 5)
  assert.equal(g.coverage, 'unavailable')
  assert.equal(g.status, 'waiting_agents')
  assert.throws(() => acknowledge(g, 'a', 1, 'a file exists'))
})
test('restore needs live confirmation and does not trust an old working row', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3); restore(g)
  snapshot(g, [info('a', 'completed')], 4)
  assert.equal(g.agents.a.status, 'unknown')
  assert.equal(notified(g, { id: 'a', status: 'completed', toolUseId: 'spawn-a' }, 5), 'ambiguous')
  snapshot(g, [info('a', 'running')], 6)
  assert.equal(g.agents.a.status, 'running')
})
test('idle teammate is not a terminal agent, but its delivered assignment can settle', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3)
  snapshot(g, [info('a', 'idle', { teammateId: 'worker@team' })], 4)
  assert.deepEqual(blockers(g), ['a:idle'])
  turnEnded(g, 'a', 'turn-a', 'answer', 5)
  acknowledge(g, 'a', 1, 'Read the assigned result from the idle teammate')
  assert.equal(g.agents.a.status, 'idle')
  assert.equal(g.status, 'active')
})
test('bounded registry reports incomplete coverage rather than silently losing dependencies', () => {
  const g = goal()
  for (let i = 0; i < 257; i++) launch(g, `agent-${i}`)
  enterWait(g, ['agent-256'], 4)
  assert.equal(g.coverage, 'incomplete')
  assert.ok(blockers(g).includes('registry:incomplete'))
})
test('legacy v1 goals gain registry fields without discarding watcher state or usage', () => {
  const old = goal()
  delete old.agents; delete old.dependencies; delete old.control_generation; delete old.wait_generation; delete old.coverage
  old.status = 'waiting_external'; old.waiting_on = { watcher_id: 'watch-1', entered_at: 1, generation: 3 }
  old.usage.turns = 12
  const db = normalize({ version: 1, goals: { 'goal-1': old }, current_by_session: { 'session-1': 'goal-1' } })
  assert.deepEqual(db.goals['goal-1'].agents, {})
  assert.equal(db.goals['goal-1'].waiting_on.generation, 3)
  assert.equal(db.goals['goal-1'].usage.turns, 12)
})
test('only exact bounded notification IDs and terminal statuses are parsed', () => {
  assert.equal(parseNotification('task_id: a status: completed'), undefined)
  assert.equal(parseNotification('<task-id>__proto__</task-id><status>completed</status>'), undefined)
  assert.equal(parseNotification('<task-id>a</task-id><status>running</status>'), undefined)
  assert.deepEqual(parseNotification('<task-id>a</task-id><status>stopped</status>'), { id: 'a', status: 'killed', toolUseId: undefined })
})
test('terminal teammate returning to idle retains its assignment generation and receipt', () => {
  const g = goal(); launch(g); finish(g)
  snapshot(g, [info('a', 'idle', { teammateId: 'worker@team' })], 8)
  enterWait(g, ['a'], 9)
  assert.equal(g.agents.a.generation, 1)
  assert.equal(g.agents.a.status, 'idle')
  assert.equal(g.status, 'active')
})
test('current-run terminal evidence remains valid after a roster row is cleaned up', () => {
  const g = goal(); launch(g); enterWait(g, ['a'], 3)
  snapshot(g, [], 4)
  assert.equal(notified(g, { id: 'a', status: 'completed', toolUseId: 'spawn-a' }, 5), 'accepted')
  assert.equal(g.status, 'active')
})
test('reload invalidates an old receipt when a completed identity is now live again', () => {
  const g = goal(); launch(g); finish(g); restore(g)
  snapshot(g, [info('a', 'running')], 9)
  enterWait(g, ['a'], 10)
  assert.equal(g.agents.a.generation, 2)
  assert.equal(g.agents.a.delivered_generation, undefined)
  assert.equal(g.status, 'waiting_agents')
})
test('error/refusal/cancellation cannot be erased by a lagging running roster', () => {
  for (const [reason, state] of [['error', 'failed'], ['refusal', 'failed'], ['aborted', 'killed']]) {
    const g = goal(); launch(g); enterWait(g, ['a'], 3)
    turnEnded(g, 'a', 'turn-a', reason, 4)
    snapshot(g, [info('a', 'running')], 5)
    assert.equal(g.agents.a.generation, 1)
    assert.equal(g.agents.a.status, state)
    assert.equal(notified(g, { id: 'a', status: state, toolUseId: 'spawn-a' }, 6), 'accepted')
    assert.equal(g.status, 'active')
  }
})
