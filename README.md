# Claude Context Guard

Practical diagnostics and safe guardrails for Claude Code sessions whose **effective context window differs from the UI label**, or that fail with a request-size `413`.

This repository is intentionally conservative: it documents supported behavior, labels version-sensitive internals, and provides a hook that can warn or stop before a risky request. It does **not** modify conversation databases, launch a second Claude process against the active session, or pretend that a hook can invoke the current session's `/compact` command.

## The short version

1. Find the evidence behind the failure. A token/context error and an HTTP body/attachment error are different problems.
2. Treat the smallest confirmed provider limit as the hard limit. Leave room for system prompts, tools, and the next response.
3. Prefer Claude Code's runtime auto-compaction. An environment override can lower the runtime's target on versions that support it:

   ```json
   {
     "env": {
       "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "160000"
     }
   }
   ```

   `160000` is an example, not a universal answer. Choose it from your provider's confirmed limit and verify the result in the transcript.
4. Use the included Skill for a repeatable diagnosis and the Hook only as a guard. A `UserPromptSubmit` hook can inspect input and block or explain; it is not a supported `/compact` launcher.
5. If the error says `Request too large (max 32MB)` and mentions accumulated images or attachments, remove or avoid re-sending those attachments. Token compaction alone may not remove them.

## Contents

- [Diagnosis](docs/diagnosis.md)
- [Claude Code integration](docs/claude-code-integration.md)
- [Verification](docs/verification.md)
- [Reusable Skill](skills/claude-context-guard/SKILL.md)
- [Hook guide and limitations](hooks/README.md)
- [PowerShell Hook](hooks/powershell/context-guard.ps1)
- [Configuration examples](examples/)

## Install the Skill

Project-local installation:

```powershell
Copy-Item -Recurse skills/claude-context-guard .claude/skills/claude-context-guard
```

User-wide installation:

```powershell
Copy-Item -Recurse skills/claude-context-guard "$HOME/.claude/skills/claude-context-guard"
```

Then invoke it explicitly when diagnosing a session, for example:

```text
/claude-context-guard Diagnose the current session before the next request.
```

Skill discovery and invocation syntax can vary by Claude Code release; the files are plain Markdown and can also be used as a checklist manually.

## Install the Hook

The example is deliberately opt-in. Copy the script and add an appropriate `UserPromptSubmit` entry to the Claude Code hook configuration for your installation. Start with `MODE=warn` behavior; use blocking only after testing it with your provider and workflow. See [hooks/README.md](hooks/README.md).

The Hook reads JSON from stdin and writes a supported `hookSpecificOutput` response. It does not print transcript contents, credentials, or request payloads.

## MCP and Goal integration

This project does not ship a new MCP server. Claude Code already exposes session-level tools in some environments for reading usage and persisting a Goal. When available, use them as follows:

- read the current usage/status before changing a threshold;
- use a Goal for durable completion criteria and verification evidence;
- use transcript evidence such as a compact boundary rather than trusting a UI ring alone.

The exact tool names and availability are host/version dependent. See [docs/claude-code-integration.md](docs/claude-code-integration.md) for a supported-boundary matrix and a fallback path when those tools are absent.

## Safety and privacy

Do not commit:

- authentication tokens, proxy URLs, cookies, or personal settings;
- full JSONL transcripts, images, PDFs, or attachments;
- real session IDs when they are not needed for a reproducible example;
- copied system prompts or private MCP/workbench documents.

Before publishing, run the repository validation script and inspect `git diff --cached`.

## License

MIT. See [LICENSE](LICENSE).
