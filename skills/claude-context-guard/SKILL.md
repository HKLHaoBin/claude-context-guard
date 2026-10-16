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
3. **Find the effective limit.** Use the smallest confirmed provider or gateway limit, reserve space for system prompts, tools, and output, and choose a target below that budget. Distinguish the compaction target from `CLAUDE_CODE_MAX_CONTEXT_TOKENS` and the output cap.
4. **Prefer documented runtime controls.** Use `/autocompact`, `--autocompact`, `autoCompactWindow`, or `CLAUDE_CODE_AUTO_COMPACT_WINDOW` when supported by the installed release. Treat `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, model settings, and gateway overrides as separate controls. Verify which setting won.
5. **Use Hooks only as guards and observers.** A prompt hook can warn, inject a short diagnostic message, or stop the next request. `PreCompact` can inspect or block a compaction that is already requested, and `PostCompact` can observe a completed compaction. No Hook output starts `/compact`.
6. **Verify behavior.** Look for a compaction boundary and usage evidence, then run a controlled workload. For `413`, inspect the sanitized response source and remove repeated attachments or adjust the gateway when appropriate.
7. **Protect privacy.** Never place credentials, proxy endpoints, full transcripts, images, PDFs, session IDs, or private MCP/workbench data in a report or repository.

## Decision rules

- `context window exceeded` / `prompt is too long` → confirm the active model/gateway limit, reserve overhead, and lower the documented runtime target if needed.
- `Request too large (max 32MB)` / `Request Entity Too Large` → investigate accumulated attachments or an intermediary body limit.
- Unknown source → capture status and sanitized error details before changing configuration.
- No usage/transcript evidence → report uncertainty; do not invent precision.

## Goal and MCP tools

For a substantial task with a measurable end state, use the official session-scoped `/goal <condition>` when the host exposes it. The condition must name a visible check and any turn/time bound because its evaluator judges only evidence already surfaced in the conversation. `/goal` is not compaction state.

Some desktop hosts expose non-standard Goal ledger tools. Detect them before use, create one objective per continuous deliverable, and update it only with verified evidence. Use `waiting_external` only with a real watcher identifier, `paused` for required human input or access, and `complete` only with non-empty evidence. If these tools are absent, report that fact and use the manual acceptance checklist; do not emulate a Goal with files, todos, plans, memory, or scheduled tasks.

## Output format

Report:

1. classification;
2. evidence;
3. effective-limit assumption and safety margin;
4. smallest configuration change;
5. verification result;
6. unresolved uncertainty and rollback step.

See the repository's `docs/` files for detailed diagnosis and verification guidance.
