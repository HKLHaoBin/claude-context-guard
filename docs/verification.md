# Verification

The goal is to prove behavior, not merely prove that a setting file parses.

## 1. Validate the repository locally

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate.ps1
```

This checks Markdown/JSON basics, Skill metadata, PowerShell parsing where available, and common secret patterns.

## 2. Verify the runtime target

1. Record the current model/provider without credentials.
2. Set the target in the supported configuration location for your release.
3. Restart the relevant Claude Code process if required.
4. Read usage/status again.
5. Send a controlled workload that does not contain private attachments.
6. Inspect the sanitized transcript or runtime output for a compaction boundary. If available, check that its trigger is automatic and that `preTokens` is below the confirmed limit.

Do not infer success solely from the UI percentage. Do not intentionally drive a production conversation into an error just to test the boundary.

## 3. Verify the Hook offline

The included test harness passes representative JSON payloads to the script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.tests.ps1
```

Cover these cases:

- usage below the warning threshold: allow/no warning;
- usage at or above the threshold: warning or block according to mode;
- missing usage/transcript: safe, explicit fallback;
- malformed JSON: deterministic failure behavior;
- no credential or transcript content printed to stdout/stderr.

## 4. Classify a 413

Save the status and a sanitized response body. A provider token error should identify tokens/context; a gateway body error often identifies bytes, nginx, ingress, or request entity size. Test attachment handling with a disposable clean session, not the only copy of a valuable conversation.

## 5. Reproducibility report

A useful report includes:

- Claude Code version;
- model/provider class, not secrets or private URLs;
- configured target and when it was loaded;
- observed usage/compaction evidence;
- sanitized error status/body;
- operating system and PowerShell version for Hook tests;
- commit or release of this repository.
