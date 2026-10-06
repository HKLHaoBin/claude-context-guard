# Claude Code integration

## Runtime compaction

On installations that support it, configure a lower runtime target through the environment:

```json
{
  "env": {
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "160000"
  }
}
```

The name is version-sensitive. Confirm that the running process reads it; do not assume that a settings key with a similar name is supported. Keep automatic compaction enabled when the runtime provides that setting. Restart or start a new session if the installation only reads environment changes at process startup.

Choose the value from evidence:

- confirmed provider limit: `L`;
- reserved system/tool/output space: `R`;
- runtime target: below `L - R`.

For a provider that actually accepts 200,000 tokens, 160,000 is a conservative starting example. It is not a promise that compaction happens exactly at 160,000, and it may be too high or too low for a different prompt/tool set.

## Supported-boundary matrix

| Need | Prefer | Boundary |
| --- | --- | --- |
| Lower the runtime target | documented settings/environment supported by your release | verify after restart or process reload |
| Read current usage | built-in status/usage command or host session usage tool | UI rings can be stale or nominal |
| Durable task objective | Goal/CreateGoal and Goal/UpdateGoal when exposed by the host | Goal state is not compaction state |
| Observe compaction | transcript `compact_boundary`/usage records when available | fields are release-dependent |
| Warn before the next prompt | `UserPromptSubmit` Hook | can block or add context; cannot reliably start `/compact` |
| Start current-session compaction | user command or runtime auto-compaction | no supported Hook launcher is assumed here |

## MCP and Goal integration

This repository does not implement a new MCP server. Some Claude Code desktop environments expose MCP-style tools for the host session. When they exist, a diagnostic workflow can:

1. read usage before making a configuration change;
2. create one durable Goal containing the deliverables and evidence requirements;
3. update the Goal with test and transcript evidence only after verification;
4. pause when credentials or a repository choice is required rather than guessing.

Tool names, schemas, and availability belong to the host. Treat them as optional integrations. The fallback is the same workflow manually: inspect the current process, inspect sanitized transcript evidence, edit only the intended configuration, and run the verification checklist.

Do not publish tool output containing private prompts, session IDs, user paths, MCP server URLs, credentials, or workbench documents.

## Internal or community workarounds

Variables and transcript fields not documented for your release can be useful diagnostic clues but may disappear or change semantics. Label them as experimental in local notes, pin the Claude Code version when reproducing a report, and never make them a prerequisite for safety-critical automation.

External transcript pruners and concurrent resume/compact processes have a larger blast radius. Use them only with a backup and a recovery plan, and do not present them as official behavior.
