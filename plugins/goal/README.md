# Subagent-aware Goal plugin

Version **0.3.0** adds a durable agent registry and explicit joins to the community Goal adapter. It is separate from Claude Code's built-in `/goal` evaluator and from Context Guard's compaction hook.

Version **0.3.1** makes UI status messages opt-in with `showStatus` (default `false`), preserves Goal execution, and includes native hook-module admission checks.

## Host requirements and installation

This plugin targets hosts that implement the **hooks-module API**: `hooks/hooks.json` with `modules`, `register(on)`, `$.tool.register`, `$.store`, `$.clock`, `$.prompt.submit`, `agent.spawn`, and agent-aware turn events. A classic command-hook-only host cannot load this implementation. Check the installed host's generated `claude-code` declarations; do not assume every Claude Code or Agent SDK version has this API.

For a compatible host:

```text
/plugin marketplace add HKLHaoBin/claude-context-guard
/plugin install goal@claude-context-guard
```

For a checkout, the plugin directory is `plugins/goal`; a compatible host can load that directory with `--plugin-dir`. Use the qualified `goal:goal` skill when it would otherwise collide with the built-in `/goal` command. Installing the standalone Context Guard skill does not install this plugin.

The plugin registers:

- `mcp__goal__CreateGoal`: create one Goal and keep its ID.
- `mcp__goal__UpdateGoal`: update work/wait/pause/completion state.
- `mcp__goal__GetGoalStatus`: an on-demand registry/status snapshot.

Missing module support means no plugin Goal was armed. Missing `$.agent.list()` is reported as degraded coverage rather than silently claiming full tracking.

## Quiet status output

The optional `Goal active · ...` UI status line is **off by default**. Some desktop/SDK hosts append every `$.ui.status` call as a `system/ui_status` transcript message rather than replacing a pinned line. Quiet mode makes no status calls, including empty clears, so routine Goal reads and updates do not add these messages. Existing transcript entries are not removed.

This is a display preference only: Goal persistence, continuation prompts, agent/external-watcher waits, explicit pause, failure diagnostics and completion evidence gates remain enabled. Ask for `GetGoalStatus` when an on-demand snapshot is needed.

To restore the optional status line, set this plugin's `showStatus` option to `true` in `/config`. For the local skills-folder installation, the equivalent user-settings fragment is:

```json
{
  "pluginConfigs": {
    "goal": { "options": { "showStatus": true } }
  }
}
```

Merge that fragment into existing settings, do not replace them. Marketplace installations use their qualified plugin ID. Set `showStatus` to `false` (or remove the override) to return to quiet output. Reload the plugin or restart the host session if its file watcher is not enabled. Quiet mode does not hide tool results, errors or the continuation prompts required to keep working.

## Parent work and explicit dependencies

Starting an Agent records its identity and activity without pausing its parent. Continue independent work while workers run. Once the phase only needs worker results, declare exactly those agent IDs:

```json
{
  "status": "waiting_agents",
  "agent_ids": ["actual-worker-a-id", "actual-worker-b-id"],
  "summary": "Independent edits are finished; waiting for both required reports"
}
```

The first implementation joins **all** declared IDs, including known descendants. Unrelated agents and session activity do not block this join. Dependencies remain attached to the Goal after the join so later completion cannot ignore a resumed required worker.

The state machine distinguishes:

- `active`: parent work can continue and fallback continuation is allowed.
- `waiting_agents`: required executions or result deliveries remain unresolved; no fallback loop.
- `waiting_external`: one direct harness-tracked watcher owns the next wake.
- `paused`: explicit user/blocker pause, preserving suspended waits.
- `complete`: original acceptance evidence was supplied and required dependencies reconciled.

Worker events do not move a paused Goal back to active. An explicit resume restores an unresolved suspended wait rather than discarding it. A watcher is a direct background task, not an Agent.

## Registry and progress

Each Goal persists agent ID, parent ID, short task description/name, lifecycle state, background mode, run generation, current spawn reference, turn identity, last activity/tool, tool/turn counts, cumulative reported output tokens and result-receipt generation. Raw prompts, complete reports, tool arguments and transcripts are not copied into the registry. Summaries and receipt evidence are caller-supplied persistent data; keep them sanitized.

The lifecycle includes pending, running, waiting, idle, completed, failed, killed and unknown. Progress is event-driven, not a model polling loop or inferred percentage. `GetGoalStatus.progress` describes required workers/descendants; the full registry is in `goal.agents`.

`turn.complete(answer)` alone cannot end a worker waiting on its own children. Normal native background task notifications deliver reports; the child-end hook does not separately submit another parent prompt. A terminal run with an undelivered report remains `result_pending`.

## Run identity, receipts and ordering

Stable agent identity and run identity are different. A resumed agent keeps its ID; the registry advances its generation and fences the old invocation. Old turn endings, duplicate notifications, concurrent sibling updates, completion before wait registration, and spawn callbacks arriving after turn events are handled independently.

Notifications are considered only when the host stamps `origin.kind = task-notification`, with exact bounded task IDs and terminal statuses. Quoted notifications in user/tool text cannot satisfy a wait. An old invocation cannot end a new one.

If a resumed notification lacks a current invocation reference, it is ambiguous. The parent can read the current report, obtain the generation from GetGoalStatus, then acknowledge that exact known-terminal run:

```json
{
  "status": "active",
  "summary": "Read the current run report",
  "received_results": [
    { "agent_id": "actual-worker-id", "generation": 2, "evidence": "Describe the current report inspected" }
  ]
}
```

A receipt does not make unknown/running work terminal. An idle persistent teammate can settle an assignment only after its turn ended and the specific report is acknowledged; the teammate itself remains idle, not terminated.

Failed/cancelled executions return control for a parent decision. Completion is rejected until these outcomes are explicitly reconciled using a current-generation receipt with `handled: true`. This records that the parent actually reviewed a retry, replacement, cancellation or other objective-preserving resolution; it is not a declaration that the failed worker succeeded.

## Persistence and migration

The plugin reads legacy `goals-v1` records for the current session, adding registry fields without changing objective, usage, watcher ID or watcher generation. It writes the upgraded record under `goal-session-v2/<session-id>`, isolating sessions so they do not overwrite one shared read-modify-write document. The legacy key is left untouched.

Within one host plugin worker, a serial transaction queue prevents sibling callbacks from losing each other's updates. This does not promise cross-process compare-and-swap for two independent hosts deliberately reusing the same session ID.

On reload, nonterminal registry rows become unconfirmed/unknown until current host events or a live snapshot reconcile them. Missing roster entries are never success evidence. A terminal snapshot without live confirmation of a restored in-flight run stays unknown: obtain authoritative current evidence or deliberately resume/replace the worker instead of inventing a result.

Downgrading to an older plugin will read its old legacy snapshot, not the new session records. Export acceptance evidence before changing plugin versions; do not run both versions against the same session. A legacy `paused/subagent_wait` summary is not automatically converted into an agent join: redeclare exact dependencies after checking current state.

## Completion and capability boundaries

All required executions ending is only a gate to **reconciliation**, never automatic Goal completion. A complete update requires nonempty original-objective evidence and rejects live/unknown dependencies, missing receipts, unreconciled failed/cancelled results and pending watcher waits. The plugin validates this protocol; it cannot independently prove the truth of arbitrary business evidence supplied by the caller.

Important limitations:

- `agent.list()` does not include Workflow-internal agents. GetGoalStatus reports this explicitly. Track a Workflow's own terminal result through an appropriate direct watcher/host integration; do not pretend its internal roster is visible.
- Forked skills without a spawn event can be discovered in a host snapshot and selected by ID.
- Independent teammate panes may retain a stale running/idle roster value after a crash. No elapsed-time rule turns that into success.
- Registry capacity is 256 agents per Goal. Overflow marks coverage incomplete and blocks dependency completion rather than silently evicting live work.
- Timers schedule an ordinary active continuation once, not status polling. State and generation are checked before scheduling, before submission, and at prompt ingress to suppress already-queued stale continuations.
- No mtime-based liveness, transcript scraping, OSC parser, guessed percentages, cancellation of workers on pause, or lease expiry treated as successful completion.

## Verification

GitHub Actions runs production registry code and the actual `register` hooks against a deterministic structural host harness on Node 24, on Windows and Linux, plus strict TypeScript checking. It also runs the existing repository and PowerShell-hook checks. These are protocol/adapter tests, **not** a claim that a vendor-host integration or model run was executed.

The type-only `test/host-contract.d.ts` maps `claude-code` to the deliberately small structural boundary in `hooks/host.ts`. It is not a copy of generated vendor types. A compatible host's native `claude plugin validate` / plugin test suite remains an additional integration check when that host is available.

Before installing changed hooks, run both native checks in a compatible host:

```text
claude plugin validate <plugin-directory>
claude plugin test <plugin-directory>
```

The native tests in `test/native.test.ts` verify module admission, registration/callability of all three Goal tools, explicit waits, and continuation/pause behavior without model calls. Portable tests cannot substitute for these loading checks. The host requires host-aware helpers at module scope and direct `$.noun.method(...)` calls; optional chaining on a host noun can reject the entire module. A visible Skill without Goal tools is therefore not, by itself, proof that the host lacks Goal support: inspect native validation and loading errors before reinstalling or weakening the capability check.

The `goal-plugin-source` Actions artifact contains the source distribution, not a desktop/mobile binary. This repository has no desktop or mobile application build target. No model credentials are required by the portable CI suite.

Design references: [Orca child decoder](https://github.com/stablyai/orca/blob/5be871e537047fb0af50f3fb2d17aa02eef306e7/src/main/claude/claude-child-work-decoder.ts), [stable task IDs](https://github.com/stablyai/orca/blob/5be871e537047fb0af50f3fb2d17aa02eef306e7/src/main/claude/claude-subagent-id-aliases.ts), and [notification delivery tracking](https://github.com/stablyai/orca/blob/5be871e537047fb0af50f3fb2d17aa02eef306e7/src/shared/claude-owed-task-notifications.ts). The implementation here is independent and uses the host's native IDs/events rather than copying Orca's transport or UI code.
