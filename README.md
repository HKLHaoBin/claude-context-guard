# Claude Code integration

This repository is a community reference implementation. The commands, settings, hook payloads, and host tools described here depend on the Claude Code release and host that runs them. Verify behavior in your installation before using a blocking guard.

## Auto-compaction settings

Claude Code supports several different controls. They are not interchangeable:

| Control | Purpose | Notes |
| --- | --- | --- |
| `/autocompact 500k` or `/autocompact auto` | Set or restore the current model's compaction window | Applies immediately when no higher-priority setting overrides it. |
| `--autocompact 500k` | Set the window for one launch | Takes precedence over saved settings for that launch. |
| `autoCompactWindow` | Configure a general settings-file window | A model-specific saved value can take precedence within the same settings file. |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Set a plain integer token window | Takes precedence over `/autocompact`, `--autocompact`, and settings. Supported values are documented as roughly 100,000–1,000,000 and are capped by the active model. |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Request earlier compaction | It can lower the trigger percentage, but cannot raise the normal threshold. |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | Override the context size Claude Code assumes for a model | Especially relevant for gateways or custom model IDs; this is not the compaction target. |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Limit response output | A larger output allowance leaves less effective room before compaction. |

For example, a gateway known to accept only 200,000 tokens may use:

```powershell
$env:CLAUDE_CODE_AUTO_COMPACT_WINDOW = '160000'
$env:CLAUDE_CODE_MAX_CONTEXT_TOKENS = '200000'
```

`160000` is only a conservative example. Derive the target from the smallest confirmed provider/gateway limit, then reserve space for system prompts, tools, and the next response. Do not use a fixed value merely because a UI label says `1M`.

Verify the active model and setting with `/status` and `/autocompact`. If the environment variable wins, Claude Code reports that it overrides other changes. Observe an actual compaction boundary or a controlled, non-sensitive workload; do not intentionally overflow a valuable session.

## Hook boundary

The current Hook configuration shape is event → matcher group → nested handlers. `UserPromptSubmit` and `PostCompact` do not use matchers; `PreCompact` accepts `manual` and `auto`.

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
    ]
  }
}
```

A hook can reject a submitted prompt or block a compaction that was already requested. It cannot initiate `/compact`. `PostCompact` is observational and runs after compaction.

The standard `UserPromptSubmit` payload contains prompt/session fields, not a guaranteed token `usage` object. The included PowerShell guard accepts several usage aliases so a host or wrapper can inject them, and deliberately fails open when they are absent. Its offline fixtures are custom payloads, not a promise about the live event schema.

## Goal surfaces

Use the official session-scoped command for ordinary Claude Code work:

```text
/goal tests pass, `git diff --check` is clean, and only the intended files changed; stop after 20 turns if this cannot be achieved
```

The condition should have one measurable end state, a check that Claude runs and shows in the conversation, material constraints, and an optional turn/time bound. `/goal` is one condition per session; `/goal` shows it and `/goal clear` removes it. Resume restores an active condition but resets its timer and counters. Background work can defer evaluation and check-ins can retry or pause depending on the installed release.

See [Goal methodology](docs/goal-methodology.md) for evidence rules and the distinction between official `/goal`, this desktop host's optional Goal adapter, and Agent SDK progress tools. A Goal does not prove compaction or replace context diagnostics.

## MCP and Agent SDK

This project does not ship an MCP server. A desktop host may expose non-standard Goal ledger tools; use them only after capability detection and keep their IDs/evidence private. The Agent SDK does not provide a universal Goal CRUD API. If an SDK session exposes `/goal`, check the initialization capabilities first; otherwise use its documented hooks, session events, and an explicit external persistence layer when durable state is required.

## Available Skills

Each directory under `skills/` is a downloadable Skill package:

- [claude-context-guard](skills/claude-context-guard/SKILL.md) — diagnose context-window mismatches, compaction, and 413 request-size failures.
- [review-bugbot](skills/review-bugbot/SKILL.md) — run one bounded Bugbot subagent review; requires a host that provides `bugbot`.
- [diagnosing-bugs](skills/diagnosing-bugs/SKILL.md) — diagnose explicit errors and silent failures using sourced behavior contracts, correlated events, semantic anomaly checks, and a verified fix loop; see [the diagnosis guide](docs/diagnosing-bugs.md).

The formal file list and host dependencies are in [skills/manifest.json](skills/manifest.json). The skills are community packages, not official Claude Code or Bugbot components.

### Install a Skill

From a checkout of this repository, install one package into the current project:

```powershell
Copy-Item -Recurse skills/review-bugbot .claude/skills/review-bugbot
Copy-Item -Recurse skills/diagnosing-bugs .claude/skills/diagnosing-bugs
```

Or install for the current user:

```powershell
Copy-Item -Recurse skills/review-bugbot "$HOME/.claude/skills/review-bugbot"
Copy-Item -Recurse skills/diagnosing-bugs "$HOME/.claude/skills/diagnosing-bugs"
```

Keep both the `scripts` and `references` subdirectories when installing `diagnosing-bugs`. Existing target directories may contain local edits; back them up before replacement. A Skill install does not register the PowerShell Hook automatically. Hook installation remains opt-in; see [hooks/README.md](hooks/README.md).

You can also download the repository ZIP from GitHub and copy only the desired `skills/<name>` directory. For reproducible setups, pin a reviewed commit or release tag rather than tracking `main`.

## Diagnose and verify

- [Diagnosis decision tree](docs/diagnosis.md)
- [Verification checklist](docs/verification.md)
- [Claude Code integration boundaries](docs/claude-code-integration.md)
- [Hook guide and limitations](hooks/README.md)

Run repository checks from its root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.tests.ps1
```

On a shell-capable environment, also run:

```bash
bash -n skills/diagnosing-bugs/scripts/hitl-loop.template.sh
git diff --check
```

## Safety and privacy

Do not publish authentication tokens, proxy URLs, cookies, personal settings, complete transcripts, images, PDFs, private prompts, real session IDs, or private MCP/workbench documents. Redact captured diagnostics before sharing them.

This is a community reference implementation, not an official Claude Code component. See [NOTICE.md](NOTICE.md), [skills/NOTICE.md](skills/NOTICE.md), and [LICENSE](LICENSE).
