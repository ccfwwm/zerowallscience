#!/usr/bin/env python3
"""Tests for the analysis-integrity gate (runtime/skills/core/stats-integrity).

Run: python scripts/dev/test_stats_integrity.py
Stdlib unittest only.
"""
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # never leave __pycache__ in the shipped skill dir

_MOD = (
    Path(__file__).resolve().parents[2]
    / "runtime/skills/core/stats-integrity/stats_integrity_check.py"
)
_spec = importlib.util.spec_from_file_location("stats_integrity_check", _MOD)
assert _spec and _spec.loader
si = importlib.util.module_from_spec(_spec)
sys.modules["stats_integrity_check"] = si
_spec.loader.exec_module(si)


def write(d, name, body):
    p = os.path.join(d, name)
    with open(p, "w") as fh:
        fh.write(body)
    return p


def tags_of(res):
    return {f["tag"] for f in res["findings"]}


class Interpretation(unittest.TestCase):
    def test_flags_causal_language_in_stats_report(self):
        d = tempfile.mkdtemp()
        p = write(d, "report.md",
                  "We ran a regression (p < 0.01). Income causes higher happiness.\n")
        res = si.run([p])
        self.assertIn("stats · interpretation", tags_of(res))

    def test_association_wording_ok(self):
        d = tempfile.mkdtemp()
        p = write(d, "report.md",
                  "The regression shows income is associated with happiness (p < 0.01).\n")
        res = si.run([p])
        self.assertNotIn("stats · interpretation", tags_of(res))

    def test_non_stats_doc_not_flagged(self):
        d = tempfile.mkdtemp()
        p = write(d, "readme.md", "This project causes joy and leads to fun.\n")
        res = si.run([p])
        self.assertNotIn("stats · interpretation", tags_of(res))


class Prereg(unittest.TestCase):
    def test_unregistered_predictor_flagged(self):
        d = tempfile.mkdtemp()
        write(d, "preregistration.md",
              "We will regress happiness on income.\nModel: happiness ~ income\n")
        code = write(d, "analysis.py",
                     'import statsmodels.formula.api as smf\n'
                     'm = smf.ols("happiness ~ income + gender", df).fit()\n')
        res = si.run([code, os.path.join(d, "preregistration.md")])
        fs = [f for f in res["findings"] if f["tag"] == "stats · prereg"]
        self.assertTrue(fs)
        self.assertIn("gender", fs[0]["evidence"])

    def test_registered_model_ok(self):
        d = tempfile.mkdtemp()
        write(d, "analysis_plan.md", "Model: happiness ~ income + gender\n")
        code = write(d, "analysis.py",
                     'm = smf.ols("happiness ~ income + gender", df).fit()\n')
        res = si.run([code, os.path.join(d, "analysis_plan.md")])
        self.assertNotIn("stats · prereg", tags_of(res))

    def test_unregistered_interaction_flagged(self):
        d = tempfile.mkdtemp()
        write(d, "prereg.md", "Model: happiness ~ income + gender\n")
        code = write(d, "analysis.py",
                     'm = smf.ols("happiness ~ income + gender + income:gender", df).fit()\n')
        res = si.run([code, os.path.join(d, "prereg.md")])
        fs = [f for f in res["findings"] if f["tag"] == "stats · prereg"]
        self.assertTrue(any("nteraction" in f["title"] or "nteraction" in f["evidence"] for f in fs))

    def test_no_prereg_no_findings(self):
        d = tempfile.mkdtemp()
        code = write(d, "analysis.py", 'm = smf.ols("y ~ x + z", df).fit()\n')
        res = si.run([code])
        self.assertNotIn("stats · prereg", tags_of(res))


class Seed(unittest.TestCase):
    def test_random_without_seed_flagged(self):
        d = tempfile.mkdtemp()
        code = write(d, "boot.py",
                     "import numpy as np\n"
                     "idx = np.random.choice(n, n)\n")
        res = si.run([code])
        self.assertIn("stats · seed", tags_of(res))

    def test_seed_set_ok(self):
        d = tempfile.mkdtemp()
        code = write(d, "boot.py",
                     "import numpy as np\n"
                     "np.random.seed(42)\n"
                     "idx = np.random.choice(n, n)\n")
        res = si.run([code])
        self.assertNotIn("stats · seed", tags_of(res))

    def test_train_test_split_random_state_ok(self):
        d = tempfile.mkdtemp()
        code = write(d, "ml.py",
                     "from sklearn.model_selection import train_test_split\n"
                     "a, b = train_test_split(X, random_state=0)\n")
        res = si.run([code])
        self.assertNotIn("stats · seed", tags_of(res))

    def test_r_sample_without_seed_flagged(self):
        d = tempfile.mkdtemp()
        code = write(d, "boot.R", "idx <- sample(1:n, n, replace=TRUE)\n")
        res = si.run([code])
        self.assertIn("stats · seed", tags_of(res))


class Driver(unittest.TestCase):
    def test_contract_shape(self):
        d = tempfile.mkdtemp()
        p = write(d, "report.md", "Regression: X causes Y (p < 0.05).\n")
        res = si.run([p])
        self.assertIn("findings", res)
        self.assertIn("note", res)
        f0 = res["findings"][0]
        self.assertEqual(f0["check"], "integrity")
        self.assertIn("tag", f0)
        self.assertNotIn("certif", res["note"].split("does not")[0].lower())

    def test_notebook_seed_extraction(self):
        d = tempfile.mkdtemp()
        nb = (
            '{"cells":[{"cell_type":"code","source":["import numpy as np\\n",'
            '"x = np.random.randint(0, 10)\\n"]}],'
            '"metadata":{"kernelspec":{"language":"python"}}}'
        )
        p = write(d, "nb.ipynb", nb)
        res = si.run([p])
        self.assertIn("stats · seed", tags_of(res))


if __name__ == "__main__":
    unittest.main(verbosity=2)
