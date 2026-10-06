# Diagnosis

先记录错误的完整文本（脱敏后），再决定是否需要降低上下文窗口。不要只看桌面端的 Context ring。

## Decision tree

### 1. Does the error describe tokens or the model context?

Signals include:

- `context window exceeded`
- `prompt is too long`
- a provider response identifying a maximum number of tokens
- a transcript usage record whose input plus cached input is near the provider limit

This is a **token/context problem**. Use the smallest confirmed provider limit, subtract a safety margin for system prompts, tools, and output, and let the runtime compact before the next request reaches that point.

### 2. Does the error describe bytes, attachments, or request body size?

Signals include:

- `Request too large (max 32MB)`
- `Request Entity Too Large`
- `413` from nginx, an ingress, LiteLLM, or another gateway
- text saying accumulated images or attachments pushed the request over the limit

This is an **HTTP body/attachment problem**. Remove old images or attachments, start a clean conversation when appropriate, or raise the gateway limit if you operate it. Lowering the token threshold does not necessarily remove binary attachments from a request.

### 3. Is the source unclear?

Capture the response status and sanitized error body. Check whether the 413 came from the provider or an intermediary. Do not paste tokens, cookies, authorization headers, full transcripts, or private proxy URLs into an issue.

## Why the UI can mislead

A desktop client can display a nominal model context while the actual provider, proxy, compatibility layer, or selected model accepts less. The UI label is not proof of the effective limit. Measure from the runtime usage/transcript when that evidence is available, and use a conservative local target when it is not.

A useful accounting model is:

```text
usable target < confirmed provider limit
usable target - system/tool overhead - expected output reserve = history budget
```

The exact overhead is installation- and model-dependent. Do not copy a universal percentage from another provider.

## Evidence to collect

- selected model and provider type (without credentials or private endpoint URLs);
- error status and sanitized response body;
- latest usage fields exposed by the runtime;
- whether a `compact_boundary` record exists and its `trigger`/`preTokens` metadata, if your installation writes those fields;
- whether the conversation contains repeated images, PDFs, archives, or other binary attachments;
- configured compaction override and when the process started.

## Common mistakes

- Treating a `32MB` body limit as a `200K token` limit.
- Assuming `/compact` deletes old images or PDFs.
- Setting a target equal to the provider maximum and leaving no output/tool reserve.
- Editing a live JSONL transcript to recover a session without a backup and a known recovery plan.
- Running `claude --resume ... /compact` concurrently against the active process; this is not a supported Hook API and can race the session state.
