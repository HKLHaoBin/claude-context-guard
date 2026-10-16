---
name: diagnosing-bugs
description: Enforce an evidence-first diagnosis loop for hard bugs and performance regressions. Use whenever the user asks to diagnose/debug or reports broken, failing, throwing, flaky, or slow behavior.
---

# Diagnosing Bugs — Evidence-First Protocol

This skill is a state machine, not a suggestion list. When this skill is invoked, follow every gate in order. Do not silently skip a phase, infer a root cause from static code inspection, or apply a production fix before runtime evidence identifies the cause.

The required lifecycle is:

`scope → hypotheses → instrumentation → build → user reproduction → evidence classification → regression test → evidence-backed fix → second reproduction → comparison → user confirmation → cleanup`

If a phase cannot be completed, stop at that phase and report the exact missing evidence or capability. Do not advance by guessing.

When exploring the codebase, read `CONTEXT.md` if it exists and check relevant ADRs before changing code. Exploration is allowed before runtime evidence; changing behavior is not.

## Non-negotiable rules

1. **No evidence, no fix.** Static plausibility, a stack trace without a causal probe, a failing generic test, or a familiar error pattern is not enough to fix the user's bug.
2. **Always generate 3–5 falsifiable hypotheses first.** Every hypothesis must state both its prediction and the change that would make the symptom disappear if that hypothesis were true.
3. **Instrument before fixing.** Add exactly 2–6 targeted runtime probe points. Every probe must map to one or more hypotheses, and every hypothesis must be covered by at least one probe.
4. **Build the instrumented artifact before asking for reproduction.** Do not ask the user to reproduce against source code or an unverified build.
5. **Use NDJSON only for runtime diagnostics.** One complete JSON object per line; no multiline JSON, free-form dumps, secrets, or sensitive configuration values.
6. **Use one session-owned debug log.** The only file this skill may create, append to, clear, or delete is the current session's dedicated debug log. User-supplied logs are read-only inputs and must never be modified or deleted.
7. **Do not hide timing bugs.** Never add `sleep`, `setTimeout`, arbitrary delays, polling delays, retries intended to mask a race, or timing changes that are not part of the product behavior.
8. **Do not weaken safety checks to make a symptom disappear.** Preserve authentication, authorization, validation, compare-and-swap, encryption, backup, rollback, and integrity boundaries unless runtime evidence proves that exact boundary is faulty.
9. **Keep diagnostics safe.** Never record passwords, API keys, access tokens, OAuth credentials, cookies, authorization headers, full URIs, file contents, prompts, personal data, secret-bearing error strings, or raw provider configuration. Log only stable error codes, booleans, bounded counts, enum values, sizes, and timing-free state facts that are necessary to distinguish hypotheses.
10. **Do not claim confirmation from missing events.** An absent log event is evidence only that the instrumented path did not emit it; it is not proof that the path was never reached unless the probe's coverage is itself verified.
11. **Retain instrumentation through verification.** Do not remove probes or delete the session log after the first apparent fix. The fixed artifact must be reproduced and compared with the failing artifact.
12. **User confirmation gates cleanup.** Do not delete the session log or remove diagnostic code until the user has explicitly confirmed the verified fix. If no dedicated file-delete operation is available, stop and ask the user to delete it; never use a shell command or overwrite/truncate operation to clear it.

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

Do not test or fix a hypothesis before the complete list is written. The list may be shown to the user, but do not block waiting for a response when the user is unavailable; continue only with instrumentation, never with a fix.

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

## Phase 5: Reproduce, minimize, and write the regression test

Do not enter this phase until at least one instrumented run is red-capable and the evidence classification is complete.

1. Confirm the runtime sequence is the user's exact bug, not an adjacent error.
2. Repeat the trigger when possible to establish determinism; do not use `sleep`, `setTimeout`, artificial delays, or masking retries.
3. Minimize the scenario one input/state transition at a time while preserving the same probe evidence.
4. If a correct test seam exists, write the regression test **before** the fix and run it so it fails for the minimized pattern.
5. If no correct seam exists, record that as an architectural limitation and keep the runtime loop as the verification seam.

## Phase 6: Evidence-gated fix

Only apply a product fix when all of the following are true:

- one hypothesis is `CONFIRMED`;
- the evidence directly identifies the causal boundary;
- every competing hypothesis is `REJECTED` or independently ruled out;
- the proposed change is the exact change named in that hypothesis's prediction;
- the regression test or runtime loop is red before the change;
- confidence is effectively certain from the available evidence. If any doubt remains, classify the hypothesis `INCONCLUSIVE` and gather another run instead.

Do not make unrelated refactors, bypass validation, remove security checks, add delays, or change multiple causal variables in one attempt. Preserve all `[DEBUG-...]` instrumentation and the session log during the fix.

If no hypothesis meets this gate, stop and ask for another instrumented reproduction or add/revise only the probes needed to distinguish the remaining hypotheses. Do not patch.

## Phase 7: Verify the fix with instrumentation still present

After the fix:

1. Run the regression test and show it turns green.
2. Build a new artifact that still contains the same probes.
3. Ask the user to reproduce the original scenario again using the fixed artifact.
4. Parse the new session log and compare it with the failing run structurally, not by visual impression.
5. Confirm the causal event is gone or corrected, the expected success event occurs, and no safety boundary was bypassed.
6. Reclassify all hypotheses from the fixed run and state the before/after probe records in collapsed NDJSON blocks.

Do not delete instrumentation or claim completion until this second runtime verification has succeeded and the user has explicitly confirmed that the original symptom is gone.

If the fixed run still fails or produces a different failure:

- mark the attempted hypothesis outcome honestly;
- revert only the unverified/falsified product change, while retaining the probes and session log;
- do not hide the failed attempt with a delay or retry;
- generate a new ranked set of 3–5 falsifiable hypotheses and return to Phase 1 or Phase 2.

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
- the user has not supplied a reproduction log;
- the returned log is not valid NDJSON or lacks verified probe coverage;
- any hypothesis remains `INCONCLUSIVE` while a fix is being proposed;
- the environment has no safe dedicated file-delete operation for final cleanup.
