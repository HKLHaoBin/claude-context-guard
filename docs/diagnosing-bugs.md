# Diagnosing errors and silent failures

`diagnosing-bugs` checks whether a system did the right thing, not whether its logs contain an error word. An INFO-only run can demonstrate an obsolete result being applied, an incomplete export, or a task that remains active without making required progress. Conversely, a cancellation, valid empty result, cache hit, or idempotent redelivery is not automatically a bug.

## Installed package

Install the entire [Skill directory](../skills/diagnosing-bugs), including:

- `SKILL.md`: the evidence-first diagnosis/fix lifecycle and mandatory semantic-pass gates;
- `references/semantic-analysis.md`: the behavior oracle, event reconstruction, evidence statuses, and false-positive boundaries;
- `references/semantic-cases.json`: thirteen synthetic cases with separate expected results;
- `references/semantic-evaluation.md`: blinded behavioral comparison and grading instructions;
- `scripts/hitl-loop.template.sh`: a terminal-driven, outcome-oriented reproduction helper.

Existing installed copies are not automatically updated by a repository push. Review and back up local customizations before replacing an installed Skill. Installation does not register hooks, launch a model, or change application logging.

## Diagnosis lifecycle

1. Capture the exact symptom and expected user-visible result.
2. Build a sourced **normal-behavior model**: relevant result, state/version, ordering, multiplicity, count/unit, progress, and performance contracts. Label unsupported expectations unverified.
3. Inspect existing logs in their original formats. Correlate the relevant operations, check coverage, and reconstruct only the causal order supported by the evidence.
4. Run the **semantic pass independently of the initial cause hypotheses**. Local success is not enough when the required committed or visible effect is wrong or missing.
5. Report each applicable contract as `VIOLATION`, `SUSPICIOUS`, `NO_VIOLATION_OBSERVED`, or `INSUFFICIENT_EVIDENCE`, citing original lines, alternatives, symptom relevance, and one minimal next verification action.
6. For a product fix, continue the existing ranked-hypothesis, 2–6-probe, instrumented-build, reversible-change, regression, and second-reproduction gates. Semantic findings do not bypass causal verification.
7. Compare the fixed run against the **same contracts** and observation boundaries. Keep diagnostic code/logs until the user confirms the verified fix.

A bounded log-review or synthetic-evaluation request can stop after evidence classification and the next verification action. It does not pretend a synthetic application was built or force a product change that the user did not request.

## Evidence and safety boundaries

- Newly added probes emit the Skill's safe NDJSON schema. User-supplied plain-text, JSON, or other readable application logs remain read-only; they are not rejected for using a different format.
- Use generated run-local operation labels and safe version/count facts where concurrent operations need correlation. Never expose or hash real user/resource identifiers to create labels.
- Physical log-line order and cross-process wall-clock times are not necessarily execution order. Explain supported predecessor relationships and leave unsupported ordering claims inconclusive.
- Missing events establish a violation only with verified path coverage, necessary emission, complete capture, flush/drain evidence, and the required observation boundary. Startup-only or truncated logs do not establish health or failure of the final operation.
- State the rule source and permitted exceptions. Zero output can be correct after filtering; repeated delivery can be correct under idempotency; a long duration without a comparable baseline is not a proven regression.
- Report the observed anomaly separately from its proposed cause. A stale result can be proven without knowing whether a missing check, non-atomic commit, or alternate writer caused it.
- Preserve authentication, validation, integrity, rollback, and other safety boundaries. Do not mask timing bugs with sleeps or retries.

## Result-oriented reproduction

Adapt the helper's explicit export contract to the actual scenario. It captures only bounded enums:

- `RESULT`: `correct`, `wrong`, `no-change`, `stalled`, `duplicate`, or `unknown`;
- `STABILITY`: `stable`, `overwritten`, `not-observed`, or `not-applicable`;
- `ERROR_PRESENT`: `yes`, `no`, or `unknown`.

These are observations, not an automated pass/fail verdict. `RESULT=wrong` and `ERROR_PRESENT=no` is a valid report of a silent failure. `RESULT=correct` followed by `STABILITY=overwritten` preserves the late regression instead of prematurely declaring success. Unknown/EOF input cannot become a successful observation, and the helper does not solicit raw error strings or private data.

## Verification and limitations

The GitHub Actions Validate workflow checks repository packaging and hook behavior, shell syntax, semantic protocol/reference contracts, synthetic-case consistency, and the helper with scripted stdin. Record the exact commit and workflow result when shipping an update.

Those automated checks do not execute an LLM or prove diagnostic accuracy. The [behavioral evaluation protocol](../skills/diagnosing-bugs/references/semantic-evaluation.md) separately describes withholding answer keys and case labels, comparing versions under equivalent conditions, and reporting misses, false positives, unsupported causes, and coverage mistakes. Run model-backed evaluations only with an authorized runtime and budget.

No Skill can recover information that was never observed. When correlation, result visibility, or a justified performance/progress reference is missing, the required result is a concrete evidence gap and minimal next check, not a confident diagnosis.
