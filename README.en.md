# Claude Context Guard

A conservative, Windows-friendly reference kit for diagnosing Claude Code context mismatches, automatic compaction, and request-size `413` failures. It also packages two reusable Skills for bounded Bugbot reviews and hard-bug diagnosis.

## Principles

- Separate token/context failures from HTTP body or attachment-size failures.
- Use the smallest confirmed provider or gateway limit and reserve output/tool overhead.
- Prefer documented runtime auto-compaction over unsupported transcript manipulation.
- Treat Hook payloads and host Goal tools as capability- and version-dependent.
- Keep credentials, transcripts, attachments, and private MCP data out of reports and repositories.

## Goal workflow

Use the official session-scoped `/goal <condition>` when a substantial task has a measurable end state:

```text
/goal all auth tests pass, lint exits 0, and git diff --check is clean; stop after 20 turns if not achieved
```

The evaluator can only judge evidence Claude has surfaced in the conversation. `/goal` shows the condition, `/goal clear` removes it, and resume restores an active condition with fresh timing and counters. See [Goal methodology](docs/goal-methodology.md) for condition design, evidence, check-ins, and the distinction between official `/goal` and non-standard host Goal adapters.

## Available Skills

- [claude-context-guard](skills/claude-context-guard/SKILL.md) — context, compaction, and 413 diagnosis.
- [review-bugbot](skills/review-bugbot/SKILL.md) — bounded Bugbot review when the host provides a `bugbot` subagent.
- [diagnosing-bugs](skills/diagnosing-bugs/SKILL.md) — debug workflow with reproduction, hypotheses, probes, regression tests, and cleanup.

See [skills/manifest.json](skills/manifest.json) for package files and dependencies. These are community Skills, not official Claude Code or Bugbot components.

## Install

Project-level installation from a repository checkout:

```powershell
Copy-Item -Recurse skills/claude-context-guard .claude/skills/claude-context-guard
Copy-Item -Recurse skills/review-bugbot .claude/skills/review-bugbot
Copy-Item -Recurse skills/diagnosing-bugs .claude/skills/diagnosing-bugs
```

User-level installation:

```powershell
Copy-Item -Recurse skills/claude-context-guard "$HOME/.claude/skills/claude-context-guard"
Copy-Item -Recurse skills/review-bugbot "$HOME/.claude/skills/review-bugbot"
Copy-Item -Recurse skills/diagnosing-bugs "$HOME/.claude/skills/diagnosing-bugs"
```

The diagnosis Skill must keep its `scripts` directory. A Skill install does not register the optional PowerShell Hook. Downloading the GitHub ZIP and copying only the required `skills/<name>` directory is also supported; pin a reviewed commit or tag for reproducible installations.

## Context and Hook integration

Claude Code currently exposes `/autocompact`, `--autocompact`, `autoCompactWindow`, and `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. The environment variable accepts a plain integer and has higher precedence than the other window controls. `CLAUDE_CODE_MAX_CONTEXT_TOKENS` changes the assumed model context size (especially for gateways), while `CLAUDE_CODE_MAX_OUTPUT_TOKENS` limits output and consumes part of the available budget. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` can request earlier, not later, compaction. See [integration boundaries](docs/claude-code-integration.md).

The Hook example uses the current nested event/matcher/handler shape. `PreCompact` may inspect or block a compaction already requested; it cannot start `/compact`. `PostCompact` observes completed compaction. Standard `UserPromptSubmit` input does not guarantee usage fields, so the PowerShell guard fails open unless a host or wrapper supplies a supported usage payload. See [hooks/README.md](hooks/README.md).

## Verification

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.tests.ps1
```

```bash
bash -n skills/diagnosing-bugs/scripts/hitl-loop.template.sh
git diff --check
```

Read [docs/verification.md](docs/verification.md) for runtime, Goal, Hook, and 413 verification boundaries.

## Safety and license

Do not publish credentials, cookies, proxy endpoints, private prompts, complete transcripts, attachments, personal paths, or private MCP/workbench data. This is a community reference implementation; it is not an official Claude Code component. Third-party Skill attribution is in [skills/NOTICE.md](skills/NOTICE.md). See [LICENSE](LICENSE) for this repository's license and [NOTICE.md](NOTICE.md) for support boundaries.
