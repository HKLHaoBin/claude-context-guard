# Verification

The goal is to prove behavior, not merely prove that a settings file parses. Keep all captured output redacted.

## 1. Validate the repository locally

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1
```

This checks the Skill manifest, every Skill's metadata and line limit, JSON examples, PowerShell syntax, tracked-file sensitive patterns, and required package files. It does not call a live Goal, Bugbot, provider, or MCP server.

## 2. Verify the runtime target

1. Record the Claude Code version and model/provider class without credentials.
2. Confirm the provider or gateway context limit.
3. Choose a runtime target below that limit after reserving system, tool, and output overhead.
4. Set the supported control (`/autocompact`, `--autocompact`, `autoCompactWindow`, or the documented environment variable).
5. Restart only when the installed release requires it.
6. Use `/status` and `/autocompact` to confirm the active model and effective setting.
7. Send a controlled workload without private attachments.
8. Inspect sanitized output or transcript evidence for a compaction boundary and trigger.

Keep `CLAUDE_CODE_MAX_CONTEXT_TOKENS` separate from the compaction target, especially for gateway aliases. Treat a 413 that names bytes or attachments as a request-body investigation, not a token-window result.

## 3. Verify the official Goal workflow

In a disposable or low-risk session:

1. Set a condition with one measurable end state, a visible check, a material constraint, and a turn/time bound.
2. Run the check and show its exit status in the conversation so the evaluator can inspect it.
3. Use `/goal` to inspect status and `/goal clear` to test the explicit stop path.
4. If the session is resumed, confirm the condition returns while the timer/turn/token baseline is fresh.
5. If background work is running, confirm evaluation is deferred rather than treating the Goal as complete.
6. If the host exposes a Goal adapter, separately smoke-test `active`, an actual watcher-backed wait, `paused`, and `complete` with non-empty evidence.

Do not use a Goal status as evidence that compaction or a provider request succeeded. If `/goal` is unavailable because of trust or hook policy, record that and use the manual checklist.

## 4. Verify the Hook offline

The included test harness passes representative custom usage payloads to the script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.tests.ps1
```

Cover these cases:

- usage below the warning threshold: allow/no warning;
- usage at or above the threshold: warning or block according to mode;
- missing usage/transcript: safe fail-open behavior;
- malformed JSON: deterministic failure behavior;
- no credential, transcript, or raw payload content printed to stdout/stderr.

The fixtures are not the standard live `UserPromptSubmit` contract; test a sanitized real event before relying on the guard.

## 5. Verify the downloadable Skills

In a clean temporary project, install each `skills/<name>` directory and confirm:

- the host discovers the expected `SKILL.md` name;
- `diagnosing-bugs` retains its `scripts/hitl-loop.template.sh` helper and all three `references/semantic-*` files;
- `review-bugbot` reports an unavailable `bugbot` subagent instead of claiming a review ran;
- relative links stay inside the installed Skill package;
- the install does not register or alter the optional Hook automatically.

For the shell template:

```bash
bash -n skills/diagnosing-bugs/scripts/hitl-loop.template.sh
```

## 6. Classify a 413

Save the status and a sanitized response body. A provider token error should identify tokens/context; a gateway body error often identifies bytes, ingress, or request entity size. Test attachment handling with a disposable clean session, not the only copy of a valuable conversation.

## 7. Reproducibility report

A useful report includes:

- Claude Code and Skill versions or commit;
- model/provider class, not secrets or private URLs;
- configured target and when it was loaded;
- observed usage/compaction evidence;
- sanitized error status/body;
- operating system and PowerShell version for Hook tests;
- Goal condition, visible checks, and evidence status when a Goal was used;
- the exact files and commands that were verified.

## 8. Verify semantic diagnosis on GitHub Actions

The Validate workflow runs the semantic package and reproduction-helper checks on the exact pushed commit, alongside the existing repository and Hook checks. Record the branch, commit SHA, run URL, and actual result; use GitHub Actions rather than local test/build execution when the workspace policy requires remote verification.

The added checks validate contract/reference packaging, the thirteen synthetic cases and their counterexample relationships, and outcome/error-independent shell captures (including late overwrites, unknown input, rejected free text, and EOF). They do not call a model or measure agent diagnostic accuracy.

For a separately authorized behavioral comparison, follow [the packaged evaluation protocol](../skills/diagnosing-bugs/references/semantic-evaluation.md). Withhold answer keys and case labels from the diagnosing agent, compare old/new Skills under equivalent conditions, and report misses, false positives, unsupported causal claims, and coverage errors separately. Keep real product-fix reproduction and user-confirmed cleanup gates intact.
