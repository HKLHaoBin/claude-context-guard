# Hook guide

The PowerShell script is a conservative `UserPromptSubmit` guard. It reads JSON from stdin, looks for usage fields supplied by a compatible host or wrapper, and exits quietly when it cannot establish a token count. It never opens a transcript path supplied by the event and never prints the input payload.

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

Derive thresholds from the confirmed provider/gateway limit and overhead. They are not a substitute for runtime auto-compaction. The standard current `UserPromptSubmit` payload does not guarantee a `usage` object; without a host-injected usage field this guard deliberately fails open.

## Wiring

Current Claude Code Hook configuration is an event followed by matcher groups and nested handlers. `UserPromptSubmit` has no matcher:

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
    ]
  }
}
```

Copy the script to the path used by your project before registering it. Hook schemas, output fields, and Windows command invocation can vary by release; confirm them against the installed version. Keep credentials and transcript paths out of configuration.

## Supported boundary

- The Hook can inspect only the event it receives and any usage fields a compatible host supplies.
- It can warn or prevent the prompt when the host honors its output and exit code.
- It cannot initiate the active session's `/compact` command.
- `PreCompact` runs before a requested manual or automatic compaction and can inspect or block it; `PostCompact` runs after compaction and is observational.
- A concurrent resume/compact process is deliberately not included.

## Test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File hooks/powershell/context-guard.tests.ps1
```

The tests use representative custom payloads. They do not call a live Claude session and do not require credentials.
