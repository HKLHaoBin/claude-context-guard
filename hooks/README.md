# Hook guide

The PowerShell script is a conservative `UserPromptSubmit` guard. It reads a JSON event from stdin, looks for common usage fields, and exits quietly when it cannot establish a token count. It never opens a transcript path supplied by the event and never prints the input payload.

## Configuration

The script defaults to warning at `160000` tokens:

```powershell
$env:CLAUDE_CONTEXT_GUARD_THRESHOLD = '160000'
$env:CLAUDE_CONTEXT_GUARD_MODE = 'warn'
```

Use `block` only after offline and real-event testing:

```powershell
$env:CLAUDE_CONTEXT_GUARD_MODE = 'block'
```

Thresholds must be derived from the confirmed provider limit and overhead. They are not a substitute for runtime auto-compaction.

## Wiring

Hook schemas differ by Claude Code release. Add the script to the `UserPromptSubmit` event in the configuration format supported by your installed release. Keep the path local to the checked-out repository. Do not paste a transcript path or credential into configuration.

A conceptual entry is:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.ps1"
      }
    ]
  }
}
```

Treat this as a mapping example, not a promise that every Claude Code build uses this exact JSON schema. Confirm the event name and supported output fields in your version's Hook documentation.

## Supported boundary

- The Hook can inspect the event it receives.
- It can warn or prevent the prompt when the host honors its output and exit code.
- It cannot reliably call the active session's `/compact` command.
- `PreCompact` observes a compaction that has already started; it is not a trigger.
- A concurrent resume/compact process is deliberately not included.

## Test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.tests.ps1
```

The tests do not call a live Claude session and do not require credentials.
