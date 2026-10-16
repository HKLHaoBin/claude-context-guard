#!/usr/bin/env bash
# Human-in-the-loop reproduction template. Copy it before editing.
# Keep credentials out of prompts and captured answers; redact output before
# returning it to an agent or storing it in a report.
#
# Usage:
#   bash hitl-loop.template.sh

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

# --- edit below ---------------------------------------------------------

step "Open the disposable test environment and reproduce the symptom."

capture ERRORED "Did the expected failure occur? (y/n)"
capture ERROR_MSG "Paste a redacted error message (or 'none'):"

# --- edit above ---------------------------------------------------------

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
printf 'ERROR_MSG=%s\n' "$ERROR_MSG"
