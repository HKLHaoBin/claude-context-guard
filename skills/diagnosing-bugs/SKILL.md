---
name: diagnosing-bugs
description: Enforce an evidence-first diagnosis-and-fix loop for hard bugs and performance regressions. Use whenever the user asks to diagnose/debug or reports broken, failing, throwing, flaky, or slow behavior.
---

# Diagnosing Bugs — Evidence-First Protocol

This skill is a state machine, not a suggestion list. When this skill is invoked, follow every gate in order. Do not silently skip a phase, infer a root cause from static code inspection, or apply a production fix before runtime evidence identifies the cause.

The required lifecycle is:

`scope → hypotheses → instrumentation → build → first reproduction → evidence classification → actionable hypothesis → minimal fix → fixed reproduction → outcome classification → (confirm and clean up | revert and retry)`

The first reproduction is reconnaissance, not completion. After its log is returned, the next required state is a concrete fix attempt, not another generic logging pass. If a phase cannot be completed, stop at that phase and report the exact missing evidence or capability; do not advance by guessing or claim that better logging is a fix.

When exploring the codebase, read `CONTEXT.md` if it exists and check relevant ADRs before changing code. Exploration is allowed before runtime evidence; changing behavior is not.

## Non-negotiable rules

1. **No runtime evidence, no behavioral fix.** Static plausibility, a stack trace without a causal probe, a failing generic test, or a familiar error pattern is not enough to change product behavior. After at least one instrumented run, an `ACTIONABLE` hypothesis may justify one reversible fix experiment before it is fully confirmed.
2. **Always generate 3–5 falsifiable hypotheses first.** Every hypothesis must state both its prediction and the change that would make the symptom disappear if that hypothesis were true.
3. **Every evidence turn must lead to action.** Once the first log is returned, classify it and either apply a concrete minimal fix, run the relevant check, request the fixed reproduction, or report a real blocker. A log-only turn is not progress.
4. **Instrument before fixing.** Add exactly 2–6 targeted runtime probe points. Every probe must map to one or more hypotheses, and every hypothesis must be covered by at least one probe.
5. **Build the instrumented artifact before asking for reproduction.** Do not ask the user to reproduce against source code or an unverified build.
6. **Use NDJSON only for runtime diagnostics.** One complete JSON object per line; no multiline JSON, free-form dumps, secrets, or sensitive configuration values.
7. **Use one session-owned debug log.** The only file this skill may create, append to, clear, or delete is the current session's dedicated debug log. User-supplied logs are read-only inputs and must never be modified or deleted.
8. **Do not hide timing bugs.** Never add `sleep`, `setTimeout`, arbitrary delays, polling delays, retries intended to mask a race, or timing changes that are not part of the product behavior.
9. **Do not weaken safety checks to make a symptom disappear.** Preserve authentication, authorization, validation, compare-and-swap, encryption, backup, rollback, and integrity boundaries unless runtime evidence proves that exact boundary is faulty.
10. **Keep diagnostics safe.** Never record passwords, API keys, access tokens, OAuth credentials, cookies, authorization headers, full URIs, file contents, prompts, personal data, secret-bearing error strings, or raw provider configuration. Log only stable error codes, booleans, bounded counts, enum values, sizes, and timing-free state facts that are necessary to distinguish hypotheses.
11. **Do not claim confirmation from missing events.** An absent log event is evidence only that the instrumented path did not emit it; it is not proof that the path was never reached unless the probe's coverage is itself verified.
12. **One causal variable per attempt.** Each fix attempt gets an `attempt_id` and `change_id`, changes one causal variable, states a predicted observable result, and remains reversible until its fixed reproduction is classified.
13. **Retain instrumentation through verification.** Reuse the same probes and session log for the fixed run; add a probe only when it is necessary and the total remains within 2–6. Runtime evidence may confirm an effective fix before user confirmation, but cleanup is still gated by user confirmation.
14. **User confirmation gates cleanup.** Do not delete the session log or remove diagnostic code until the user has explicitly confirmed the verified fix. If no dedicated file-delete operation is available, stop and ask the user to delete it; never use a shell command or overwrite/truncate operation to clear it.

## Goal coordination

This skill coordinates with the current `goal` Skill; it does not create a substitute Goal.

At Phase 0:

- If the user already armed `/goal`, preserve its objective and use its `goal_id` when available. Treat the Goal's acceptance criteria as the completion contract; do not narrow them to “the logs look better.”
- If no Goal is armed, continue the diagnosis instead of waiting, but surface a ready-to-run command such as:

  `/goal The original symptom is gone in a second instrumented reproduction, the regression check passes, safety boundaries remain intact, and cleanup is completed only after my confirmation`

  Do not claim that command is armed and do not emulate Goal state with files, todos, plans, memory, or scheduled tasks.
- In every progress update, show a compact **Acceptance progress** block: current phase, completed gates, remaining gates, current attempt/hypothesis, and the single next action. This is a visible reminder, not Goal state.
- When an active Goal is available, update it at phase transitions: `active` after concrete progress, `paused` only for user-owned blockers, `waiting_external` only for a real watcher, and `complete` only after evidence and the user's confirmation satisfy every requirement. Never mark a Goal complete because a new log was emitted or a hypothesis was written.

## Session log contract

At the beginning of the skill, choose and record one session-owned debug log path, for example:

`<session-debug-log>.ndjson`

Do not use an existing application log as the writable session log. Do not rotate, truncate, append to, or delete any other log. If the runtime cannot write directly to the session log, emit the same NDJSON records through the platform's approved debug channel and collect them into the one session log without changing unrelated logs.

Each record must be a single line with this minimum shape:

```json
{"schema":"diagnosing-bugs.v1","session_id":"<opaque-session-id>","run_id":"<opaque-run-id>","probe_id":"P1","hypothesis_ids":["H1"],"event":"<stable-event-name>","outcome":"<enum>","safe":{"key":"value"},"ts":"<timestamp>"}
```

Rules for records:

- `session_id`, `run_id`, `probe_id`, and `hypothesis_ids` are required.
- `event` and `outcome` must be bounded enums chosen before the run.
- `safe` may contain only allowlisted, non-sensitive facts such as `bytes`, `count`, `present`, `matched`, `error_code`, `mode`, or `stage`.
- Never place raw exception text in `safe`; map it to a stable error code or redacted class.
- Never include arbitrary user-controlled strings, paths, URI authorities, identifiers, secrets, document bodies, or credential material.
- Use a unique prefix/tag in source code, such as `[DEBUG-MIGRATION-1192]`, so cleanup can verify that all diagnostic code is gone.
- Do not use timers or sleeps to create or order events. Use real callbacks, lifecycle events, return values, and error paths.

Whenever NDJSON records or excerpts are shown to the user, put the complete excerpt inside a collapsed Markdown block and redact it first:

```html
<details>
<summary>NDJSON evidence — run &lt;opaque-run-id&gt;</summary>

```ndjson
{"schema":"diagnosing-bugs.v1", "...":"<REDACTED>"}
```

</details>
```

Never print raw diagnostic lines outside the collapsed block.

## Phase 0: Scope and gate the symptom

Record, without changing behavior:

- the user's exact symptom and expected behavior;
- the build/version/device/runtime where it occurred;
- the smallest known trigger and the expected pass/fail signal;
- the session debug-log path;
- whether a real feedback loop already exists.

Inspect user-supplied artifacts read-only and redact before showing anything. If the artifact does not contain the failing path, say so; do not relabel a generic startup error as the reported bug.

A generic test that merely completes, a log containing only startup messages, or a static match is not a red-capable feedback loop.

## Phase 1: Generate falsifiable hypotheses before instrumentation

Before adding a probe or changing product behavior, produce **3–5 ranked hypotheses**. Use this exact table shape in the working report:

| ID | Hypothesis | Falsifiable prediction | If true, what change would make the bug disappear? | Probe IDs |
|---|---|---|---|---|
| H1 | ... | If ..., runtime records will show ... | Change ... and the symptom should disappear without changing ... | P1 |

Every hypothesis must satisfy all of these:

- It names a concrete suspected boundary or state transition.
- It predicts an observable runtime sequence or value.
- It names one specific variable/change that would make the symptom disappear if the hypothesis is true.
- It can be marked `CONFIRMED`, `REJECTED`, or `INCONCLUSIVE` from the planned records.
- It is not merely “some platform issue,” “a race,” or “bad data.”

Do not change product behavior before the complete list is written. This first list is the map, not the stopping point: once the first runtime log is returned, use Phase 4A to select one actionable hypothesis and start a fix attempt. Do not block waiting for a response when the user is unavailable; continue only with the evidence-backed action loop, never with an unbounded logging pass.

## Phase 2: Add targeted runtime instrumentation

Add **exactly 2–6 probe points total**, not an unbounded logging sweep. A probe is a runtime boundary, not every line in a function. Examples include:

- input accepted / rejected at the external boundary;
- bounded read or decode result;
- validation or preflight result;
- state/generation observed and compared;
- write/rollback result;
- user-visible result/error mapping.

Each probe must:

1. Have a stable `probe_id` (`P1`–`P6`).
2. Name its `hypothesis_ids` in the source and emitted records.
3. Emit one or more safe NDJSON records only on the relevant boundary.
4. Record enough facts to distinguish the mapped hypotheses, but no sensitive data.
5. Avoid changing ordering, timing, retry counts, locking, persistence, or error handling.

The probe plan must cover every hypothesis. If the hypotheses cannot be distinguished with 2–6 probes, revise the hypotheses or report that the architecture lacks a diagnostic seam; do not add a seventh probe and do not fix by speculation.

After editing, verify the source contains all planned probe IDs and no unplanned debug logging. Run the narrowest available static/contract check before building.

## Phase 3: Build the instrumented artifact and request reproduction

Build the actual artifact that contains the probes. Record:

- the exact source revision;
- artifact name, checksum, and build/run URL if available;
- the probe IDs included;
- the session-log path and how the user should return it.

Do not remove the probes before the user runs the artifact.

The handoff must contain the exact sentence:

> **请你复现 bug**

It must end with numbered reproduction steps. Include only steps that exercise the user's reported symptom, for example:

1. Install the instrumented artifact.
2. Open the relevant feature.
3. Perform the smallest trigger sequence.
4. Wait for the visible failure or success result; do not repeat extra actions that could alter state.
5. Export or send only the session debug log, without editing or clearing it.

Do not claim a diagnosis, root cause, or fix at this point. Wait for the user's reproduction artifact. If the user cannot reproduce, mark the run `INCONCLUSIVE`, preserve the instrumentation, and refine the trigger or hypotheses; do not fix.

## Phase 4: Classify the returned NDJSON evidence

When the user returns the session log, read only the session-owned log plus the minimum read-only source needed to interpret probe IDs. Parse it as NDJSON. Reject or report malformed records; do not silently treat missing or malformed data as success.

For **each** hypothesis, produce exactly one status:

- `CONFIRMED`: all required probe events are present, the predicted sequence/value is present, the sequence directly explains the exact symptom, and competing hypotheses are ruled out by the same run.
- `REJECTED`: a required prediction is contradicted by a valid probe event, or the suspected boundary demonstrably succeeded while the symptom still occurred elsewhere.
- `INCONCLUSIVE`: the needed event is absent without verified coverage, records are malformed/incomplete, multiple hypotheses remain possible, or the log shows a nearby but different failure.

Every status must cite concrete NDJSON evidence by `run_id`, `probe_id`, and record line number. Put those excerpts in one collapsed block. Never upgrade `INCONCLUSIVE` to `CONFIRMED` because it is the most plausible explanation.

A hypothesis is not confirmed by a log message that merely repeats the UI error. Confirmation requires the probe sequence connecting cause to the user's exact symptom.

## Phase 4A: Turn first evidence into a fix attempt

A first log is a decision point, not a deliverable. After parsing it:

1. Identify the exact symptom in the run and cite the relevant `run_id`, `probe_id`, and line numbers.
2. Classify every hypothesis as `ACTIONABLE`, `REJECTED`, or `INCONCLUSIVE`. `ACTIONABLE` means the log supports a concrete, reversible change that can test the hypothesis; it does not mean the root cause is proven.
3. Select exactly one best-supported `ACTIONABLE` hypothesis. Record the uncertainty, the `attempt_id`, the `change_id`, and the observable result that would show the change helped.
4. If source and build access exist, apply that minimal change in the same work cycle. Do not stop at “the likely cause is ...” or produce another broad logging pass.
5. If no hypothesis is actionable, add only the smallest probe or read-only inspection needed to make one actionable. If that is impossible, report the specific blocker and the next access or artifact required.

A successful first classification therefore ends in one of three states: a changed artifact ready for verification, one narrowly justified evidence addition, or an explicit blocker. It must never end in hypotheses alone.

## Phase 5: Execute one fix attempt

Do not end the turn after Phase 4A. If source/build access exists, perform the selected change now.

1. Confirm the runtime sequence is the user's exact bug, not an adjacent error.
2. Minimize the scenario one input/state transition at a time while preserving the same probe evidence.
3. If a correct test seam exists, write the regression test **before** the fix and run it so it fails for the minimized pattern.
4. Select exactly one causal variable and assign the `attempt_id` and `change_id`.
5. Apply the smallest reversible fix named by the selected hypothesis. Do not combine unrelated refactors, cleanup, or speculative improvements.
6. Reuse the existing probes and session log. Add a probe only when it distinguishes the predicted fix outcome and the total remains 2–6.
7. Build the fixed artifact and run the regression or narrowest available check before asking for reproduction.
8. Record the expected fixed-run event and the failure event it must replace. Hand off the fixed artifact with numbered reproduction steps and the exact sentence **请你用修复版复现 bug**.

The attempt is not complete until its fixed-run log is classified in Phase 6. A regression test passing without the instrumented reproduction is useful evidence, not final confirmation.

## Phase 6: Classify the fix attempt and iterate

When the fixed-run log arrives, parse it as NDJSON and classify the selected attempt:

- `EFFECTIVE`: the expected success event occurs, the original symptom is absent in the same trigger, the regression check passes, and no safety boundary was bypassed.
- `INEFFECTIVE`: the original symptom persists, the predicted event is absent or wrong, or the change moved the failure without satisfying the expected result.
- `INCONCLUSIVE`: the log is malformed/incomplete, probe coverage is not verified, or the run exercised a different path.

For `EFFECTIVE`, mark the selected hypothesis `CONFIRMED` for this attempt, show the before/after evidence, and proceed to Phase 7. Runtime confirmation is allowed here; user confirmation is still required before cleanup.

For `INEFFECTIVE`:

1. State exactly what the attempt disproved and cite the fixed-run evidence.
2. Revert only the unverified or falsified product change when it is safe to do so; retain the session log and probes.
3. Generate a new ranked set of 3–5 falsifiable hypotheses using the new evidence, then immediately select the next actionable one and return to Phase 5.

For `INCONCLUSIVE`, do not call the attempt effective and do not repeat the same logging pass. Add or revise only the probe needed to distinguish the remaining candidates, or report the missing reproduction/access as a blocker before another attempt.

Repeat the fix loop until an attempt is `EFFECTIVE`, a real blocker prevents the next concrete action, or the active Goal's explicit stopping bound is reached. Competitor hypotheses may remain `INCONCLUSIVE`; the selected attempt must always have one concrete change and one predicted verification result.

## Phase 7: Confirm the effective fix

For an `EFFECTIVE` attempt:

1. Compare the failing and fixed runs structurally by `attempt_id`, `change_id`, probe sequence, and user-visible outcome.
2. Run the regression and relevant checks once more, and show their actual result.
3. Confirm that the causal event is gone or corrected, the expected success event occurs, and authentication, authorization, validation, rollback, and other safety boundaries remain intact.
4. Surface an **Acceptance progress** block showing runtime confirmation, remaining user confirmation, and the single cleanup action still gated on that confirmation.

Do not confuse runtime confirmation with user confirmation: the evidence may establish that the fix is effective, but the diagnostic trail remains until the user explicitly confirms the original symptom is gone.

If a later fixed run is not effective, return to Phase 6 and continue the loop. Do not declare completion because an earlier attempt looked promising.

## Phase 8: User-confirmed cleanup

Cleanup is a separate gated action. After presenting the before/after evidence, explicitly request user confirmation that the original bug is fixed. Until confirmation:

- keep the instrumentation in the artifact/source;
- keep the session NDJSON log;
- do not commit a cleanup that removes the diagnostic trail;
- do not delete or truncate any log.

Only after explicit confirmation:

1. Remove all diagnostic code and probe IDs.
2. Run a source search for every unique debug prefix and verify zero remaining instrumentation matches.
3. Run the regression and relevant checks once more without diagnostics.
4. Delete the **session-owned debug log file** using a dedicated file-delete operation, never a shell command, truncation, overwrite, or log-clearing API. If no file-delete operation is available, stop and tell the user exactly what remains; do not improvise.
5. Summarize the confirmed hypothesis, the exact causal evidence, the fix, the before/after result, tests, and any device/build limitations.

The final summary must not contain passwords, tokens, raw credentials, full sensitive paths, or unredacted diagnostic payloads.

## Performance regressions

For performance bugs, preserve the same gates. Replace broad logging with a deterministic measurement probe and a baseline/after comparison. Use profiler or monotonic measurements at the real boundary; do not use arbitrary sleeps, `setTimeout`, artificial load, or logging volume as a substitute for measurement. A performance hypothesis still needs a falsifiable prediction, a mapped probe, an evidence classification, and a second instrumented run.

## Required stopping conditions

Stop and report rather than guessing when any of these occurs:

- fewer than 3 or more than 5 hypotheses can be stated;
- the hypotheses cannot be distinguished with 2–6 safe probes;
- the artifact cannot be built with the probes;
- the log required for the current attempt is missing: request that log and show the next concrete action, rather than declaring the work complete;
- the returned log is not valid NDJSON or lacks verified probe coverage;
- no `ACTIONABLE` hypothesis can be selected and no safe probe, source access, or reproduction artifact can make one actionable;
- the selected attempt has no concrete one-variable change and predicted verification result;
- a fix attempt is `INEFFECTIVE` or `INCONCLUSIVE`: continue the loop or report the specific blocker, never claim success;
- an active Goal requirement remains unproven;
- the environment has no safe dedicated file-delete operation for final cleanup.
