# Goal-driven execution

This document defines the repository's execution method for implementation requests. It complements [Goal methodology](goal-methodology.md): that document explains the `/goal` mechanism and evidence model, while this one explains how to work toward the user's goal.

## Copy-paste global prompt

Add the following section to the user's global `CLAUDE.md` when they want this behavior across projects:

```markdown
## Goal-driven execution

For normal implementation requests, do not enter plan mode. Treat the user's instruction as an active goal and begin the work directly.

- Extract a completion contract: intended outcome, constraints, acceptance checks, and safety boundaries.
- Expand continuously along the goal's dependency frontier: inspect related code, configuration, tests, documentation, and packaging; close goal-relevant gaps and regressions. Do not add unrelated features or silently relax constraints.
- Iterate until the goal is met: implement, run the most relevant checks, inspect the diff or runtime behavior, fix failures, and rerun the checks. Do not stop at the first plausible patch.
- Keep evidence visible and truthful. Report blockers, uncertainty, remaining work, and rollback paths instead of claiming success from intent or an unrun command.
- Use the official `/goal` or an actually available host Goal adapter for a measurable end state; never simulate Goal state with a plan, todo, file, memory entry, or scheduled task.
- Ask before destructive or externally publishing actions, and keep credentials and private data out of code, logs, and reports.
```

This is a prompt preference, not a permission bypass. Higher-priority system, platform, trust, and safety rules still apply.

## Method

### 1. Convert the instruction into a completion contract

Before editing, identify the outcome the user will recognize as complete:

- **Outcome:** what should exist, change, or work.
- **Constraints:** files, APIs, compatibility, performance, privacy, and things that must remain unchanged.
- **Acceptance checks:** tests, commands, runtime behavior, file state, or external status that can prove the outcome.
- **Safety boundary:** actions that need confirmation, such as deletion, force operations, publishing, or handling secrets.

Start with execution rather than a proposal. A short working checklist is useful for tracking evidence; it is not a substitute for doing the work.

### 2. Expand along the dependency frontier

After locating the obvious change, inspect the nearest dependencies that can make the goal incomplete:

- call sites, configuration, schemas, generated files, and platform adapters;
- tests, fixtures, validation scripts, and failure paths;
- user-facing documentation, installation instructions, and version boundaries;
- security, privacy, rollback, and compatibility implications.

Expand only when the item is necessary for correctness, operability, verification, or an explicit constraint. Record unrelated improvements separately instead of absorbing them into the current goal.

### 3. Use a completion loop

Repeat this loop while the goal remains unmet:

1. Make the smallest coherent implementation change.
2. Run the most relevant fast check immediately.
3. Inspect the resulting diff, output, and runtime behavior.
4. Follow the next goal-relevant gap discovered by the evidence.
5. Fix failures and rerun the affected checks.
6. Finish with the full acceptance checks and a clean scope review.

A passing unit test is not enough when packaging, documentation, configuration, or a runtime path is part of the requested outcome. Conversely, do not add speculative work that has no acceptance consequence.

### 4. Keep evidence ahead of confidence

Completion requires surfaced evidence, not a plausible implementation. Show the exact checks that ran and their relevant results. Separate:

- **Met:** every acceptance condition has evidence;
- **Blocked:** an external dependency, access, authorization, or environment prevents progress;
- **Impossible:** a stated constraint conflicts with the requested outcome;
- **Not yet met:** work or verification remains.

If the official `/goal` is available, encode one measurable end state and keep its evidence in the conversation. If a host adapter is available, reuse one Goal identifier and update it with non-empty verified evidence. If neither exists, use a manual checklist without pretending it is durable Goal state.

### 5. Preserve boundaries while maximizing completion

High completion means closing all goal-relevant gaps, not changing everything nearby. Keep the user's constraints, existing behavior, privacy boundaries, and rollback path explicit. Request confirmation before irreversible or outward-facing actions. Never include credentials, private prompts, complete transcripts, cookies, or personal paths in repository artifacts.

## Example

User request: “Move the project to D: and make it usable there.”

A goal-driven execution expands the request into a verified migration: inventory both volumes, confirm the destination is safe, preserve Git history and local changes, copy without deleting the source, compare files and Git state, run the project's checks, switch the working directory, and retain rollback evidence. It does not stop after creating an empty destination folder, and it does not broaden into unrelated disk cleanup.

## Relationship to `/goal`

The execution method determines what work to pursue. The official `/goal` records a measurable session-scoped completion condition and evaluates evidence already surfaced in the conversation. Use both when supported, but do not confuse goal-driven execution with context compaction, a todo list, or a plan file.
