---
name: review-bugbot
description: Review a bounded set of code changes with one Bugbot subagent and report only reproducible bugs. Use when a user asks for Bugbot, review-bugbot, or a focused regression review.
disable-model-invocation: true
---

# Review Bugbot

Use this skill when the user explicitly asks for `/review-bugbot`.

## Review contract

1. Confirm the repository path and review mode before launching the reviewer.
2. Launch exactly one `bugbot` subagent with `run_in_background: false` unless the user explicitly requests background work.
3. Give it the absolute repository path and one of these diff modes:
   - `branch changes`: the default; compare the current branch with its base and include committed, staged, and unstaged changes;
   - `uncommitted changes`: only when the user says dirty, local, staged, or not-yet-committed changes;
   - `natural language`: only as a last resort when diff metadata cannot be computed.
4. Do not compute or summarize the diff before launching Bugbot. The reviewer derives its primary scope from the selected diff.
5. Require a bounded scope made only from changed paths, changed hunks, changed operations, and the minimum direct causal data flow. A containing directory, shared helper, enum collection, branch name, or commit subject does not expand responsibility.
6. If the user names a specific PR, read its metadata first and pass only a compact scope contract: intended goal, changed behavior/files, acceptance criteria, and explicit exclusions. The diff remains authoritative.

The reviewer must report only high-confidence, reproducible bugs caused by the in-scope changes. Do not turn a style preference, an unrelated pre-existing issue, or a whole-repository audit into a finding.

## Failure handling

- If the host does not expose a `bugbot` subagent, report that the skill is unavailable. Do not pretend that a generic review was Bugbot.
- If the subagent was called with a malformed prompt, correct the prompt and retry once.
- If diff computation fails, retry once with `Diff: natural language` and a `Change Description` listing only known changed files and regions. Never use this fallback to broaden the review.
- For another failure, retry once with the same contract. Stop after the second failure and report the short blocker.

Use this prompt shape:

```text
Full Repository Path: <absolute repository path>
Diff: <branch changes | uncommitted changes | natural language>
Base Branch: <only when a specific non-default base is required>
Change Description: <only for natural language; changed file blocks>
Custom Instructions: review only the diff-derived bounded scope; report reproducible bugs with file and line locations; do not modify files
```

## Report and follow-up

- An empty diff is reported as “there was no diff to review.”
- With no findings, report `Bugbot found no bugs`.
- With findings, list severity, `file:line`, failure scenario, and the smallest explanation, ordered by severity.
- Do not fix, commit, push, or rerun the review unless the user explicitly asks. If fixes are requested, preserve the original scope contract and review the resulting diff again.
