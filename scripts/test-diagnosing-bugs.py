"""Package contracts and helper integration checks; not a live agent accuracy eval."""

import json
from pathlib import Path
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "diagnosing-bugs"
STATUSES = {
    "VIOLATION",
    "SUSPICIOUS",
    "NO_VIOLATION_OBSERVED",
    "INSUFFICIENT_EVIDENCE",
}


class SemanticPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        cls.reference = (SKILL / "references/semantic-analysis.md").read_text(
            encoding="utf-8"
        )
        cls.evaluation = (SKILL / "references/semantic-evaluation.md").read_text(
            encoding="utf-8"
        )
        cls.corpus = json.loads(
            (SKILL / "references/semantic-cases.json").read_text(encoding="utf-8")
        )
        cls.cases = {case["id"]: case for case in cls.corpus["cases"]}

    def test_required_phase_order_and_contracts(self):
        phases = [
            "## Phase 0:",
            "## Phase 0A:",
            "## Phase 1:",
            "## Phase 2:",
            "## Phase 3:",
            "## Phase 4:",
            "## Phase 4A:",
            "## Phase 5:",
            "## Phase 6:",
            "## Phase 7:",
            "## Phase 8:",
        ]
        positions = [self.protocol.index(phase) for phase in phases]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("all ERROR/WARN lines were removed", self.protocol)
        self.assertIn("ordinary application-log formats alone", self.protocol)
        self.assertIn("original normal-behavior contracts", self.protocol)
        self.assertIn("fix eligibility separately", self.protocol)
        self.assertIn("bounded log review or Skill evaluation", self.protocol)
        self.assertIn("请你复现 bug", self.protocol)
        self.assertIn("请你用修复版复现 bug", self.protocol)
        self.assertLessEqual(len(self.protocol.splitlines()), 500)

    def test_semantic_reference_covers_evidence_and_safety(self):
        for status in STATUSES:
            with self.subTest(status=status):
                self.assertIn(f"`{status}`", self.reference)
        for phrase in (
            "Outcome:",
            "State/version:",
            "Causal ordering and multiplicity:",
            "Counts and units:",
            "Progress and termination:",
            "Performance:",
            "UNVERIFIED",
            "observation window",
            "buffer flushes",
            "not a total execution order",
            "2–6",
            "never expose or hash",
            "not its root cause",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), self.reference.lower())

    def test_every_package_link_resolves_inside_skill(self):
        for path in SKILL.rglob("*.md"):
            for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
                if "://" in target or target.startswith("#"):
                    continue
                resolved = (path.parent / target.split("#", 1)[0]).resolve()
                with self.subTest(file=path.name, target=target):
                    self.assertTrue(resolved.is_relative_to(SKILL.resolve()))
                    self.assertTrue(resolved.is_file())

    def test_manifest_packages_all_skill_files(self):
        manifest = json.loads((ROOT / "skills/manifest.json").read_text(encoding="utf-8"))
        entry = next(item for item in manifest["skills"] if item["name"] == "diagnosing-bugs")
        actual = {path.relative_to(SKILL).as_posix() for path in SKILL.rglob("*") if path.is_file()}
        self.assertEqual(set(entry["files"]), actual)

    def test_case_schema_and_evidence_locations(self):
        self.assertEqual(self.corpus["schema_version"], 1)
        self.assertEqual(len(self.cases), len(self.corpus["cases"]))
        for case in self.cases.values():
            with self.subTest(case=case["id"]):
                for key in ("id", "dimension", "symptom", "contract", "coverage", "logs", "expected"):
                    self.assertTrue(case[key])
                contract = case["contract"]
                for key in ("id", "rule", "source", "verified"):
                    self.assertIn(key, contract)
                self.assertIsInstance(contract["verified"], bool)
                self.assertRegex(contract["id"], r"^N[1-9][0-9]*$")
                coverage = case["coverage"]
                self.assertIsInstance(coverage["path_exercised"], bool)
                self.assertIsInstance(coverage["capture_complete"], bool)
                self.assertTrue(coverage["correlation"])
                self.assertTrue(all(isinstance(line, str) and line for line in case["logs"]))
                expected = case["expected"]
                self.assertIn(expected["status"], STATUSES)
                for key in ("deviation", "benign_alternative", "next_action"):
                    self.assertTrue(expected[key])
                self.assertIs(expected["root_cause_confirmed"], False)
                self.assertTrue(expected["evidence_lines"])
                for line in expected["evidence_lines"]:
                    self.assertIsInstance(line, int)
                    self.assertGreaterEqual(line, 1)
                    self.assertLessEqual(line, len(case["logs"]))
                if expected["status"] == "VIOLATION":
                    self.assertTrue(contract["verified"])
        self.assertEqual({case["expected"]["status"] for case in self.cases.values()}, STATUSES)

    def test_normal_looking_violation_and_benign_counterexamples_exist(self):
        silent_failures = ("stale-result", "incomplete-export", "heartbeat-without-progress")
        benign = (
            "legal-cancellation",
            "filtered-empty-output",
            "cache-hit-no-network",
            "idempotent-redelivery",
            "buffered-line-reordering",
        )
        for case_id in silent_failures:
            with self.subTest(case=case_id):
                case = self.cases[case_id]
                self.assertEqual(case["expected"]["status"], "VIOLATION")
                self.assertTrue(all(line.startswith("INFO ") for line in case["logs"]))
        for case_id in benign:
            with self.subTest(case=case_id):
                self.assertEqual(self.cases[case_id]["expected"]["status"], "NO_VIOLATION_OBSERVED")
        self.assertFalse(self.cases["duration-without-baseline"]["contract"]["verified"])
        self.assertEqual(self.cases["duration-without-baseline"]["expected"]["status"], "SUSPICIOUS")
        self.assertEqual(self.cases["uncorrelated-concurrency"]["expected"]["status"], "INSUFFICIENT_EVIDENCE")

    def test_fixture_relationships_are_not_just_status_labels(self):
        stale = self.cases["stale-result"]
        applied = [line for line in stale["logs"] if "event=result_applied" in line]
        generations = [
            tuple(map(int, re.search(r"generation=(\d+) current_generation=(\d+)", line).groups()))
            for line in applied
        ]
        self.assertTrue(any(generation < current for generation, current in generations))
        incomplete = "\n".join(self.cases["incomplete-export"]["logs"])
        self.assertIn("accepted=100 filtering=false", incomplete)
        self.assertIn("records=98", incomplete)
        filtered = "\n".join(self.cases["filtered-empty-output"]["logs"])
        self.assertIn("input=8", filtered)
        self.assertIn("filtered=8 retained=0", filtered)
        self.assertIn("records=0 valid=true", filtered)
        reordered = self.cases["buffered-line-reordering"]["logs"]
        sequence = [int(re.search(r"event_seq=(\d+)", line).group(1)) for line in reordered]
        self.assertEqual(sequence, [2, 1, 3])
        error_case = self.cases["unrelated-error"]
        self.assertTrue(error_case["logs"][0].startswith("ERROR operation=C "))
        self.assertNotIn(1, error_case["expected"]["evidence_lines"])

    def test_absence_requires_coverage_and_evaluation_is_not_overclaimed(self):
        truncated = self.cases["truncated-capture"]
        complete = self.cases["missing-terminal-complete-capture"]
        self.assertFalse(truncated["coverage"]["capture_complete"])
        self.assertEqual(truncated["expected"]["status"], "INSUFFICIENT_EVIDENCE")
        self.assertTrue(complete["coverage"]["capture_complete"])
        self.assertEqual(complete["expected"]["status"], "VIOLATION")
        self.assertIn("async_drained=true buffers_flushed=true dropped_records=0", complete["logs"][-1])
        for phrase in ("Withhold `expected`", "descriptive case `id`", "do not", "independently authored"):
            self.assertIn(phrase.lower(), self.evaluation.lower())
        self.assertIn("measure diagnostic accuracy", self.evaluation)


@unittest.skipUnless(shutil.which("bash"), "The helper integration checks require Bash")
class ReproductionHelperTests(unittest.TestCase):
    def invoke_helper(self, observations):
        return subprocess.run(
            ["bash", str(SKILL / "scripts/hitl-loop.template.sh")],
            input=observations,
            text=True,
            capture_output=True,
            timeout=5,
            check=False,
        )

    def test_outcome_is_captured_independently_of_error_presence(self):
        for result in ("correct", "wrong", "no-change", "stalled", "duplicate", "unknown"):
            with self.subTest(result=result):
                run = self.invoke_helper(f"\n\n{result}\nstable\nno\n")
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertIn(f"RESULT={result}\n", run.stdout)
                self.assertIn("ERROR_PRESENT=no\n", run.stdout)
                self.assertNotIn("ERROR_MSG=", run.stdout)
                self.assertNotIn("PASS", run.stdout)

    def test_later_overwrite_is_not_lost(self):
        run = self.invoke_helper("\n\ncorrect\noverwritten\nno\n")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("RESULT=correct\nSTABILITY=overwritten\nERROR_PRESENT=no\n", run.stdout)

    def test_unknown_observation_remains_unknown(self):
        run = self.invoke_helper("\n\nunknown\nnot-observed\nunknown\n")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("RESULT=unknown\nSTABILITY=not-observed\nERROR_PRESENT=unknown\n", run.stdout)

    def test_invalid_free_text_is_not_echoed(self):
        marker = "PRIVATE_INPUT_MUST_NOT_APPEAR"
        run = self.invoke_helper(f"\n\n{marker}\nwrong\nnot-applicable\nyes\n")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertNotIn(marker, run.stdout + run.stderr)
        self.assertIn("Choose one listed enum only", run.stderr)
        self.assertIn("RESULT=wrong\n", run.stdout)

    def test_eof_does_not_become_a_success_observation(self):
        run = self.invoke_helper("\n\n")
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("Observation unavailable", run.stderr)
        self.assertNotIn("--- Captured", run.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
