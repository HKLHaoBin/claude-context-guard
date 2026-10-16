# Notice

This repository is a community reference implementation, not an official Claude Code, Bugbot, Claude Agent SDK, or Goal component. Claude Code command syntax, Skill discovery, Hook schemas, environment variables, UI reporting, host adapters, and internal transcript fields may change between releases.

The bundled `review-bugbot` Skill is an independent community-compatible rewrite. It requires a host that actually provides a `bugbot` subagent and does not implement or impersonate an official Bugbot service.

The bundled `diagnosing-bugs` Skill includes third-party material identified in [skills/NOTICE.md](skills/NOTICE.md). Its attribution and license are separate from this repository's own MIT-licensed files.

Examples intentionally omit credentials, proxy endpoints, private prompts, transcripts, attachments, and personal paths. The included Hook is a guard and diagnostic aid; it is not a supported mechanism for launching `/compact` in the active session. The current standard `UserPromptSubmit` event does not guarantee usage fields, so the Hook's usage fixtures represent a compatible host or wrapper payload rather than a universal event contract.
