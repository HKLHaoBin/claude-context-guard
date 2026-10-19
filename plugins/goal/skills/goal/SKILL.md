---
name: goal
description: Pursue one durable, verifiable objective with subagent-aware waits and explicit evidence.
disable-model-invocation: true
---
# Goal

This is the community **goal plugin**, not the built-in Claude Code `/goal` evaluator. Use the host's qualified skill name when both are installed.

## Start

1. Read the objective as a completion contract: outcome, constraints, acceptance evidence and safety boundaries. An empty objective shows usage instead of creating state.
2. Confirm the host exposes `mcp__goal__CreateGoal`, `mcp__goal__UpdateGoal` and `mcp__goal__GetGoalStatus`. If unavailable, report that no plugin Goal was armed. Continue manually when appropriate; files, plans and scheduled prompts are not substitutes for Goal state.
3. Call CreateGoal exactly once with the full objective, keep its goal_id, and start a concrete unit of work in the same turn. Reuse that identifier throughout the deliverable.

## Work and delegate

Keep the original scope. Inspect authoritative source and external state, implement, verify, inspect the result, and close goal-relevant gaps. Report actual checks, blockers and uncertainty.

Starting an Agent leaves the Goal active: finish independent parent work while workers run. Record which exact agent IDs and results the current phase needs. Names are labels, not identities.

## Wait for agents

When only required worker results remain:

1. Call UpdateGoal with status `waiting_agents`, `agent_ids` containing the exact necessary IDs, and a summary of the expected results. The registry discovers agents automatically; the parent declares the dependency set.
2. End the turn. The native completion notifications deliver reports. The plugin suppresses fallback continuations while the join is unresolved. Leave workers running.
3. Process partial deliveries while preserving the remaining wait. Progress, silence, a parent answer, a missing roster entry and a worker waiting on its own children do not prove completion.
4. When all required execution/results settle, the Goal returns to active for reconciliation, never directly to complete. Inspect every required report, handle failures/cancellations, then continue work or perform the completion audit.

`GetGoalStatus` is an on-demand snapshot, not a polling loop. It includes per-agent generation, state, parent, last activity/tool, reported output tokens, capability limits and unresolved dependencies. The registry does not expose Workflow-internal agents. Unknown or incomplete coverage needs reconciliation, not a success claim.

### Resumed or ambiguous deliveries

A resumed agent keeps its ID but has a new run generation. Prefer the host's current-run report and exact invocation reference. An unversioned resumed notification is deliberately ambiguous.

After actually reading a known-terminal run's report, acknowledge it through UpdateGoal's `received_results`:

```json
{
  "status": "active",
  "summary": "Read and reconciled the current worker report",
  "received_results": [
    { "agent_id": "actual-agent-id", "generation": 2, "evidence": "Identify the report and checks actually inspected" }
  ]
}
```

Use the generation returned by GetGoalStatus, not a guess. Set `handled: true` only after reconciling a failed/cancelled result with the objective. A receipt cannot promote a running/unknown agent into a terminal one. An idle persistent teammate can satisfy an assignment only after its turn ended and the specific report was acknowledged; idle alone is insufficient.

## Wait for an external watcher

Start one direct harness-tracked background command that exits on success, failure, cancellation or premature process exit. Immediately call UpdateGoal with status `waiting_external` and its exact `watcher_id`, then yield. The matching terminal task notification is the wake source.

An Agent ID is not a watcher ID. Preserve the watcher contract until it resolves; an active progress update is rejected while that wait is current. A watcher ending means inspect its result, not that the external operation succeeded.

## Pause and recovery

For a user pause or a genuine user-owned blocker, call UpdateGoal with status `paused`, a concrete summary and `pause_reason: user` or `blocked`. Suspended wait contracts and arriving results are retained. Worker events never override this pause.

Resume only after the user resumes or resolves the blocker, using the same Goal. UpdateGoal(active) restores any still-unresolved suspended wait. A queued fallback is rechecked at prompt ingress and cannot override a pause.

On reload, inspect the registry's capability and unknown states once. A missing live confirmation is not success. Reconcile through authoritative host events/current reports; retry or replace workers only as a deliberate parent decision.

## Completion audit

Verify every original requirement against current evidence. Execution ending is necessary for declared dependencies, but insufficient for business completion. Known failed/cancelled results require explicit reconciliation. Unknown/live dependencies, missing reports and current watcher waits block completion.

Only after every acceptance criterion is proven, call UpdateGoal with status `complete`, a verified summary and non-empty evidence covering the full objective. Report unrun checks and remaining limitations truthfully. Keep credentials and complete transcripts out of evidence and repository artifacts.
