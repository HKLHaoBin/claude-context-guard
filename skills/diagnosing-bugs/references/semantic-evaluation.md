# Evaluating semantic diagnosis

Use this protocol when changing the Skill or explicitly evaluating its evidence-analysis behavior. Read [semantic-analysis.md](semantic-analysis.md) first. [semantic-cases.json](semantic-cases.json) contains synthetic inputs and a separate `expected` answer key; it does not contain observations from a live agent evaluation.

## Automated package checks

GitHub Actions runs `scripts/test-diagnosing-bugs.py` from the repository root. These standard-library tests check the Skill's required phases and reference links, packaged file list, case schema and key counterexample relationships, and the actual shell helper with scripted safe observations, invalid input, and EOF. The existing repository validator and hook tests still run.

These checks establish package integrity, case consistency, and helper behavior. They do **not** run an LLM, measure diagnostic accuracy, or prove that every product bug can be detected. No API credential, paid model call, or dependency installation is needed for these checks.

## Behavioral comparison

Only perform model-backed evaluation with an authorized runtime and budget. Do not call an API, start subagents, or publish logs merely because this reference exists. Keep all inputs synthetic or authorized and redacted.

1. Record the old and candidate Skill commit, model/runtime settings, available tools, and evaluation budget. Keep the runtime, user task, and tool access comparable between versions.
2. Give the evaluator a fresh context containing the candidate Skill and its semantic-analysis reference, plus one case's `symptom`, `contract`, `coverage`, and `logs`. Number the supplied log lines starting at 1. Withhold `expected`, the descriptive case `id`, and `dimension`; do not supply the answer key elsewhere in that context.
3. Request a **bounded evidence analysis**, not a product fix: identify the contract and its source, reconstruct only supported event relationships, report the semantic status, cite evidence, consider benign alternatives, separate the anomaly from unproven causes, and give one minimal next verification action. Do not alter files, add product code, request a real build, or pretend the synthetic product can be executed.
4. Save the candidate response separately from the answer key. Only then compare it with `expected`. The key is a grading reference, not an instruction to force an answer when the candidate identifies a genuine fixture ambiguity.
5. Repeat with the old Skill and the same blinded input. Keep per-case results rather than only an aggregate. If order effects matter, use separate contexts and alternate which version runs first.
6. Use additional independently authored, withheld cases before making a general accuracy claim. This public thirteen-case suite is a smoke/regression corpus, not an independent held-out benchmark; familiarity with it can inflate apparent improvement.

## Per-case rubric

A case passes only when every applicable criterion holds:

- **Status:** uses the expected semantic category; confines `NO_VIOLATION_OBSERVED` to the checked contract/window and never promotes missing coverage to success.
- **Evidence:** cites valid original lines and identifies the actual contradiction or specific coverage gap. Equivalent sufficient citations are acceptable; exact wording is not required.
- **Oracle:** names the sourced rule; marks an unsupported performance expectation unverified rather than inventing a threshold.
- **Causality:** does not infer a global order from file order or assume unlabelled operations are related; does not claim the root cause is confirmed by these cases.
- **Alternatives and relevance:** handles lawful cancellation, filtering, caching, redelivery, buffering, and unrelated errors as appropriate without overlooking the actual symptom.
- **Next action:** proposes the smallest useful evidence check or causal experiment, consistent with the probe budget and safety rules; it does not mask a race with waits or retries.

Report missed violations, false positives on benign cases, unsupported causal claims, and mishandled coverage separately. Replacing ERROR/WARN lines in the unrelated-error case with an omitted-line marker should leave the stale-result finding unchanged; preserve original line labels for grading. Do not claim an accuracy percentage from package checks or from merely reading the answer key.

## Minimum regression coverage

The corpus covers stale result application, incomplete successful exports, heartbeat-without-progress, lawful cancellation, filtered empty output, valid cache hits, idempotent redelivery, buffered line reordering, truncated capture, unrelated explicit errors, duration without a baseline, uncorrelated concurrency, and a missing terminal event with verified full coverage. The truncated/full-coverage pair must produce different conclusions about missing completion.

After a real product fix, this corpus is only supplementary. The original and fixed reproductions must still satisfy the same scenario-specific contracts, regression checks, safety boundaries, and user-confirmed cleanup gates.
