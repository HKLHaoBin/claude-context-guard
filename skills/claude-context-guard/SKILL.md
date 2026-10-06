---
name: claude-context-guard
description: Diagnose Claude Code context-window mismatches, automatic compaction behavior, and request-size 413 errors. Use when a provider accepts less context than the UI label, compaction seems late, a long session risks overflow, or attachments trigger a request-size failure.
disable-model-invocation: true
---

# Claude Context Guard

Use this workflow to diagnose and protect a Claude Code session without mutating its transcript.

## Workflow

1. **Classify the failure.** Separate token/context errors from byte/request-body/attachment errors. A `32MB` attachment error is not fixed by lowering a token target.
2. **Inspect current evidence.** Prefer host-provided usage/status and sanitized transcript records. Do not trust a UI ring alone when a proxy or compatibility layer is involved.
3. **Find the effective limit.** Use the smallest confirmed provider limit, reserve space for system prompts, tools, and output, and choose a target below that budget.
4. **Prefer runtime compaction.** If the installation supports `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, configure a conservative value and verify that the running process loaded it. Treat the variable and transcript field names as version-sensitive.
5. **Use Hooks only as guards.** A prompt hook can warn, inject a short diagnostic message, or stop the next request. Do not claim that `UserPromptSubmit` or `PreCompact` can launch the current session's `/compact` command.
6. **Verify behavior.** Look for a compaction boundary and usage evidence, then run a controlled workload. For `413`, inspect the sanitized response source and remove repeated attachments or adjust the gateway when appropriate.
7. **Protect privacy.** Never place credentials, proxy endpoints, full transcripts, images, PDFs, session IDs, or private MCP/workbench data in a report or repository.

## Decision rules

- `context window exceeded` / `prompt is too long` → reduce the runtime target and reserve overhead.
- `Request too large (max 32MB)` / `Request Entity Too Large` → investigate accumulated attachments or an intermediary body limit.
- Unknown source → capture status and sanitized error details before changing configuration.
- No usage/transcript evidence → report uncertainty; do not invent precision.

## Goal and MCP tools

If the host exposes a Goal tool, create one complete objective and update it only with verified evidence. If the host exposes a session usage tool, read it before and after configuration changes. These integrations are optional and do not replace the diagnosis above.

## Output format

Report:

1. classification;
2. evidence;
3. effective-limit assumption and safety margin;
4. smallest configuration change;
5. verification result;
6. unresolved uncertainty and rollback step.

See the repository's `docs/` files for detailed diagnosis and verification guidance.
