# Claude Context Guard

A small, conservative playbook for diagnosing Claude Code context mismatches, automatic compaction, and request-size `413` failures.

## Principles

- Confirm whether the failure is token context or HTTP body/attachment size.
- Use the provider's smallest confirmed limit and leave output/tool overhead.
- Prefer runtime auto-compaction over unsupported external session manipulation.
- Treat `CLAUDE_CODE_AUTO_COMPACT_WINDOW` as version-sensitive and verify it in the transcript.
- Do not commit credentials, transcripts, attachments, or private MCP data.

Start with [README.md](README.md), then use:

- [Diagnosis](docs/diagnosis.md)
- [Integration](docs/claude-code-integration.md)
- [Verification](docs/verification.md)
- [Reusable Skill](skills/claude-context-guard/SKILL.md)
- [Hook guide](hooks/README.md)
