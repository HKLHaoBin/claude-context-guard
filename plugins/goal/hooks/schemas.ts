const string = { type: 'string', minLength: 1, maxLength: 4000 }
export const createSchema = {
  type: 'object', additionalProperties: false,
  properties: { objective: { ...string, maxLength: 32000 } }, required: ['objective'],
}
export const statusSchema = { type: 'object', additionalProperties: false, properties: {} }
export const updateSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    goal_id: string,
    status: { type: 'string', enum: ['active', 'waiting_agents', 'waiting_external', 'paused', 'complete'] },
    summary: { ...string, maxLength: 20000 },
    watcher_id: { ...string, maxLength: 256 },
    agent_ids: { type: 'array', minItems: 1, maxItems: 256, uniqueItems: true, items: { ...string, maxLength: 256 },
      description: 'Exact agent IDs whose results are required. Only waiting_agents uses this field; independent parent work remains active.' },
    pause_reason: { type: 'string', enum: ['user', 'blocked'] },
    received_results: { type: 'array', maxItems: 256, items: {
      type: 'object', additionalProperties: false,
      properties: { agent_id: { ...string, maxLength: 256 }, generation: { type: 'integer', minimum: 1 }, evidence: string,
        handled: { type: 'boolean', description: 'True only after reconciling a failed/cancelled result with the objective.' } },
      required: ['agent_id', 'generation', 'evidence'],
    }, description: 'Acknowledge reports actually read, especially ambiguous same-ID resume deliveries. Does not turn an unknown/live agent into a terminal one.' },
    evidence: { type: 'array', minItems: 1, maxItems: 50, items: string },
  },
  required: ['status', 'summary'],
}
export const tools = [
  { name: 'CreateGoal', description: 'Create one durable Goal for this session and reuse its goal_id. Start concrete work immediately.', inputSchema: createSchema },
  { name: 'UpdateGoal', description: 'Update the existing Goal. Use waiting_agents with exact required IDs only when the parent has no independent work; waiting_external accepts one direct watcher task ID. Completion requires objective evidence and reconciled dependencies.', inputSchema: updateSchema },
  { name: 'GetGoalStatus', description: 'Read Goal state, required agents, run generations, progress and capability limits without arming a poll or continuation.', inputSchema: statusSchema },
]
