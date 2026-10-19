#!/usr/bin/env bash
# Human-in-the-loop reproduction loop. Copy and adapt the scenario below.
# Run in an interactive terminal; keep sign-in and private data out of captures.
# Usage: bash hitl-loop.template.sh
# step waits for Enter; capture_choice accepts only a bounded observation enum.
# The final KEY=VALUE observations describe outcomes, not root-cause confirmation.

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture_choice() {
  local var="$1" question="$2" choices="$3" answer
  while true; do
    printf '\n>>> %s (%s)\n' "$question" "$choices"
    if ! IFS= read -r -p "    > " answer; then
      printf '\nObservation unavailable: input ended before a valid choice.\n' >&2
      return 1
    fi
    if [[ "$answer" =~ ^($choices)$ ]]; then
      printf -v "$var" '%s' "$answer"
      return 0
    fi
    printf 'Choose one listed enum only; do not paste error text or private data.\n' >&2
  done
}

# --- edit the scenario and its contract below ----------------------------
# N1: one uncancelled export contains every selected record exactly once.
# Replace this expectation and the observation boundary with the actual contract.

step "Open the relevant feature and prepare one uncancelled export. Complete sign-in privately."
step "Click Export once. Check the completed artifact against the expected record count. Observe through the scenario's defined completion boundary; do not repeat the action."

capture_choice RESULT "Did the expected result actually appear?" 'correct|wrong|no-change|stalled|duplicate|unknown'
capture_choice STABILITY "Did the result remain valid through that observation boundary?" 'stable|overwritten|not-observed|not-applicable'
capture_choice ERROR_PRESENT "Was an explicit error shown? This does not determine success." 'yes|no|unknown'

# --- edit above ----------------------------------------------------------

printf '\n--- Captured outcome observations (not a pass/fail verdict) ---\n'
printf 'RESULT=%s\n' "$RESULT"
printf 'STABILITY=%s\n' "$STABILITY"
printf 'ERROR_PRESENT=%s\n' "$ERROR_PRESENT"
