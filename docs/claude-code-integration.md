# Claude Code integration

This repository is a community reference implementation. Commands, settings, Hook payloads, and host tools depend on the Claude Code release and host that runs them. Verify behavior in your installation before enabling a blocking guard.

## Auto-compaction controls

Claude Code exposes several controls with different meanings:

| Control | Purpose | Important boundary |
| --- | --- | --- |
| `/autocompact 500k` / `/autocompact auto` | Set or restore the current model's compaction window | Applies immediately unless a higher-priority setting wins. |
| `--autocompact 500k` | Set the window for one launch | Overrides saved settings for that launch. |
| `autoCompactWindow` | Set a general settings-file window | A model-specific saved value can take precedence in the same settings file. |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Set the compaction target as a plain integer token count | Takes precedence over `/autocompact`, `--autocompact`, and settings; documented range is roughly 100,000–1,000,000 and the active model still caps it. |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Request earlier compaction | It can lower the trigger percentage, not raise it above the default. |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | Override the context size Claude Code assumes for the active model | Useful for a gateway or custom model ID; it is not the auto-compaction target. |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Limit response output | A larger output allowance leaves less effective room before compaction. |

For a gateway confirmed to accept only 200,000 tokens, a conservative starting point might be:

```powershell
$env:CLAUDE_CODE_AUTO_COMPACT_WINDOW = '160000'
$env:CLAUDE_CODE_MAX_CONTEXT_TOKENS = '200000'
```

The value `160000` is an example, not a universal recommendation. Derive the target from the smallest confirmed provider/gateway limit, then reserve space for system prompts, tools, and the next response. A native 1M model may not need such an aggressive target.

Use `/status` and `/autocompact` to inspect the active model and effective setting. If an environment variable wins, Claude Code reports that it overrides other changes. Confirm behavior with a controlled, non-sensitive workload and a visible compaction boundary. Do not intentionally overflow the only copy of a valuable session.

## Hook boundary

The current Hook shape is event → matcher group → nested handlers. `UserPromptSubmit` and `PostCompact` do not use matchers; `PreCompact` accepts `manual` and `auto`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/context-guard.ps1",
            "args": [],
            "timeout": 30
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "manual|auto",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/before-compact.ps1"
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/after-compact.ps1"
          }
        ]
      }
    ]
  }
}
```

A Hook can reject a submitted prompt or block a compaction that was already requested. No documented Hook output initiates `/compact`. `PostCompact` is observational and runs after compaction.

The standard `UserPromptSubmit` payload contains prompt/session fields, not a guaranteed token `usage` object. The included PowerShell guard accepts usage aliases for a compatible host or wrapper and deliberately fails open when they are absent. Its offline fixtures are custom payloads, not a universal live-event contract.

## Goal surfaces

### Official `/goal`

Use `/goal <condition>` for substantial work with a measurable end state:

```text
/goal tests pass, git diff --check is clean, and only the intended files changed; stop after 20 turns if this cannot be achieved
```

The condition should contain one measurable end state, the command or runtime check Claude must run and show in the conversation, material constraints, and an optional turn/time bound. One Goal is active per session; setting another replaces it. `/goal` displays status and `/goal clear` removes it. Resuming restores an active condition but resets its timer and counters. Background work can defer evaluation; check-ins and retry behavior depend on the installed release.

The evaluator only judges evidence already surfaced in the conversation. It does not independently read files or execute commands. Treat `met`, `impossible`, and unrecoverable errors as different outcomes, and show sanitized evidence before claiming completion. On releases that support it, `CLAUDE_CODE_GOAL_CHECKIN_MINUTES` controls the first background check-in interval; `0` disables check-ins and automatic retries. See [goal-methodology.md](goal-methodology.md).

### Optional host adapter

Some desktop workbenches expose `CreateGoal`/`UpdateGoal`-style ledger tools. They are not a standard Claude Code or Agent SDK API. Detect them before use:

1. create one objective for the continuous deliverable;
2. keep the returned identifier and update the same Goal;
3. use `active` for work in progress;
4. use `waiting_external` only with a real watcher/task identifier;
5. use `paused` when user input, access, authorization, credentials, or a reproduction environment is required;
6. use `complete` only with non-empty, verified evidence.

If the adapter is absent, report that fact and use a manual acceptance checklist. Do not emulate its state with a file, todo, plan, memory, or scheduled task. Host Goal state still does not prove compaction or a provider accepted a request.

### Agent SDK

The Agent SDK provides Claude Code's agent loop, hooks, sessions, and MCP integration, but not a universal Goal CRUD API. If a bundled Claude Code session exposes `/goal`, check its initialization capabilities before dispatching it. Use documented session/result events and an explicit SessionStore or custom MCP/database for cross-process persistence; do not assume `TaskCreate`/`TaskUpdate` is a durable Goal.

## MCP and safety boundary

This repository does not implement a new MCP server. Do not publish credentials, private prompts, complete transcripts, real session IDs, personal paths, MCP URLs, or workbench documents. Label undocumented variables and transcript fields as experimental and pin the Claude Code version when reproducing a report.

## Official references

- [Goal](https://code.claude.com/docs/en/goal)
- [Hooks](https://code.claude.com/docs/en/hooks)
- [Model configuration](https://code.claude.com/docs/en/model-config)
- [Environment variables](https://code.claude.com/docs/en/env-vars)
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
