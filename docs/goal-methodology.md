# Goal methodology

This repository documents two different mechanisms that are easy to confuse:

1. **Official `/goal`**: a session-scoped Claude Code command that keeps the session working toward a completion condition.
2. **Host Goal adapters**: optional application or plugin tools such as `CreateGoal`/`UpdateGoal`. These are not a general Claude Code or Agent SDK contract.

Goal records progress toward a verifiable end state. It does not change the provider context limit, trigger compaction, or prove that a request stayed below a gateway's byte limit.

## When to use a Goal

Use a Goal for substantial work with a checkable end state, such as:

- every call site compiles and the relevant tests pass;
- a migration satisfies all listed acceptance criteria;
- a queue or backlog reaches an explicitly defined empty state;
- a diagnostic report contains the required evidence and has passed validation.

A Goal is a poor fit for an open-ended discussion, a single lookup, or a task whose success cannot be demonstrated from the session's surfaced output.

## Write one strong condition

Write one condition with four parts:

1. **One measurable end state.** Name the result, not the activity.
2. **A visible check.** Name the command, exit code, file count, runtime signal, or external status that Claude must run and show in the conversation.
3. **Material constraints.** State what must remain unchanged, what is out of scope, and any safety boundary.
4. **A stopping bound.** Add a turn or time clause when an unbounded loop would be costly.

Example:

```text
/goal The migration is complete when `npm test -- --runInBand` and `npm run lint` both exit 0, the changed files are limited to `src/` and `test/`, and `git diff --check` is clean; stop after 20 turns if those checks cannot pass.
```

The condition can be at most 4,000 characters. Prefer one end state over a list of loosely related wishes. The evaluator judges what Claude has already surfaced in the transcript; it does not independently read files or execute commands. Claude must therefore run the checks and show their relevant results.

## Official `/goal` lifecycle

There is one active Goal per session. Setting a new one replaces the old condition.

| Command or verdict | Meaning |
| --- | --- |
| `/goal <condition>` | Set the condition and start the next work turn immediately. |
| `/goal` | Show the current or most recently achieved condition and status. |
| `/goal clear` | Clear the active condition. `/clear` also removes it. |
| `Not yet met` | Continue working; the evaluator's reason guides the next turn. |
| `Met` | Clear the active Goal and record the achieved result. |
| `Impossible` | Clear the Goal and record why the condition cannot be satisfied. |

Resuming a session restores an active condition, but resets its timer, turn count, and token-spend baseline. A completed or cleared Goal is not restored. Background processes can defer evaluation until no work is still running; check-ins and automatic retries are controlled by the installed Claude Code version and its settings. `CLAUDE_CODE_GOAL_CHECKIN_MINUTES` controls the first check-in interval when supported; `0` disables check-ins and automatic retries.

`/goal` does not change permission mode. Auto mode can remove approval prompts within a turn, while `/goal` supplies the cross-turn completion evaluator. Trust and hook settings can make `/goal` unavailable, including disabled hooks or managed-hook restrictions; report that state instead of pretending that a Goal was created.

## Make evidence visible

Before declaring success, surface the evidence that the evaluator and a human can inspect:

- the exact command and relevant exit status;
- the files or runtime state that were checked;
- the observed usage, compaction boundary, or sanitized error when context behavior is involved;
- the external status URL or identifier when an external system is part of the acceptance criteria;
- the remaining uncertainty and rollback path.

A plan, an intention, a guessed output, or an unrun command is not completion evidence. Keep credentials, private prompts, complete transcripts, cookies, and personal paths out of the conversation and repository.

## Optional host adapter

Some desktop workbenches expose non-standard Goal tools with a ledger-like lifecycle. Use them only after checking that the current host actually exposes the tool and schema.

- Create exactly one Goal for one continuous deliverable, then reuse its returned identifier.
- `active` means work is in progress.
- `waiting_external` means a real background watcher is running; provide its actual watcher/task identifier.
- `paused` means progress requires user input, access, authorization, credentials, or a reproduction environment; do not disguise this as an external wait.
- `complete` requires non-empty, verified evidence covering the acceptance criteria.

If the adapter is unavailable, continue with the session's manual acceptance checklist. Do not emulate a Goal with a file, todo list, plan, memory entry, or scheduled task. Those can support the work, but they are not the host's Goal state.

## Context Guard boundary

Use the Context Guard workflow separately to establish:

- the active model/provider and the smallest confirmed context limit;
- the configured auto-compaction target and its precedence;
- usage and `compact_boundary` evidence;
- whether a `413` is a token problem or a request-body/attachment limit.

A Goal can require those checks and preserve their results, but a Goal status alone never proves that compaction occurred or that a gateway accepted the request.

## References

- [Claude Code `/goal`](https://code.claude.com/docs/en/goal)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars)
- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
