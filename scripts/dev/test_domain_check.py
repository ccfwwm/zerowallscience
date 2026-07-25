#!/usr/bin/env python3
"""Tests for the domain-correctness gate (runtime/skills/core/domain-check).

Run: python scripts/dev/test_domain_check.py
Stdlib unittest only — no pytest dependency.
"""
import importlib.util
import sys
import unittest
import unittest.mock
from pathlib import Path

sys.dont_write_bytecode = True  # never leave __pycache__ in the shipped skill dir

_MOD = (
    Path(__file__).resolve().parents[2]
    / "runtime/skills/core/domain-check/domain_check.py"
)
_spec = importlib.util.spec_from_file_location("domain_check", _MOD)
assert _spec and _spec.loader
dc = importlib.util.module_from_spec(_spec)
sys.modules["domain_check"] = dc  # dataclass annotation resolution needs this
_spec.loader.exec_module(dc)


def findings(src: str, lang: str = "python"):
    return dc.analyze(dc._build_ctx("t." + ("py" if lang == "python" else "R"), src, lang))


def tags(src: str, lang: str = "python"):
    return {f.tag for f in findings(src, lang)}


class Physics(unittest.TestCase):
    def test_dimensional_mismatch_add(self):
        fs = findings("t_seconds = 3\nd_meters = 5\nx = t_seconds + d_meters\n")
        self.assertTrue(any(f.tag == "physics · units" and "mismatch" in f.title.lower() for f in fs))

    def test_dimensional_mismatch_compare(self):
        fs = findings("a_km = 1\nb_s = 2\nif a_km > b_s:\n    pass\n")
        self.assertIn("physics · units", {f.tag for f in fs})

    def test_trig_on_degrees(self):
        fs = findings("import numpy as np\nangle_deg = 90\ny = np.sin(angle_deg)\n")
        self.assertTrue(any("degree" in f.title.lower() for f in fs))

    def test_same_family_ok(self):
        # km + m are both length -> no dimensional finding.
        self.assertNotIn("physics · units", tags("a_km = 1\nb_m = 2\nx = a_km + b_m\n"))

    def test_unknown_units_ok(self):
        # No recognized unit suffix -> silent (precision over recall).
        self.assertNotIn("physics · units", tags("total = price + count\n"))


class Earth(unittest.TestCase):
    def test_euclidean_sqrt_latlon(self):
        src = (
            "import numpy as np\n"
            "d = np.sqrt((lat1 - lat2) + (lon1 - lon2))\n"
        )
        self.assertIn("earth · crs", tags(src))

    def test_classic_squared_diff(self):
        src = "dist = (lat1 - lat2)**2 + (lon1 - lon2)**2\n"
        self.assertIn("earth · crs", tags(src))

    def test_geopandas_no_crs(self):
        src = (
            "import geopandas as gpd\n"
            "gdf = gpd.read_file('x.shp')\n"
            "gdf['d'] = gdf.geometry.distance(other)\n"
        )
        self.assertIn("earth · crs", tags(src))

    def test_geopandas_with_crs_ok(self):
        src = (
            "import geopandas as gpd\n"
            "gdf = gpd.read_file('x.shp').to_crs(3857)\n"
            "gdf['d'] = gdf.geometry.distance(other)\n"
        )
        self.assertNotIn("earth · crs", tags(src))

    def test_planar_distance_ok(self):
        # x/y without lat/lon naming should not trip the euclidean rule.
        self.assertNotIn("earth · crs", tags("d = ((x1 - x2)**2 + (y1 - y2)**2)**0.5\n"))


class Biology(unittest.TestCase):
    def test_bed_off_by_one(self):
        src = (
            "for line in open('peaks.bed'):\n"
            "    start, end = 10, 20\n"
            "    length = end - start + 1\n"
        )
        self.assertIn("biology · coords", tags(src))

    def test_bed_off_by_one_wrapped_in_int(self):
        # Real code casts fields; int(end) - int(start) + 1 must still be caught
        # (regex would miss it — the AST rule sees through the int() wrapping).
        src = (
            "for line in open('peaks.bed'):\n"
            "    start, end = line.split()[1:3]\n"
            "    width = int(end) - int(start) + 1\n"
        )
        self.assertIn("biology · coords", tags(src))

    def test_bed_length_no_plus_one_ok(self):
        src = (
            "for line in open('peaks.bed'):\n"
            "    start, end = 10, 20\n"
            "    length = end - start\n"
        )
        self.assertNotIn("biology · coords", tags(src))

    def test_off_by_one_without_bed_context_ok(self):
        # Same arithmetic but no BED file in play -> not flagged (could be 1-based).
        self.assertNotIn("biology · coords", tags("length = end - start + 1\n"))

    def test_strand_unaware(self):
        src = (
            "feats = open('genes.gff3')\n"
            "sub = genome.seq[start:end]\n"
        )
        self.assertIn("biology · strand", tags(src))

    def test_strand_handled_ok(self):
        src = (
            "feats = open('genes.gff3')\n"
            "sub = genome.seq[start:end]\n"
            "if strand == '-':\n"
            "    sub = sub.reverse_complement()\n"
        )
        self.assertNotIn("biology · strand", tags(src))


class Chemistry(unittest.TestCase):
    def test_five_bond_carbon_in_smiles_literal(self):
        # The C&EN caffeine-test failure class: a carbon with 5 bonds. Here a
        # neopentane-like center written with one bond too many.
        src = 'smiles = "C(C)(C)(C)(C)C"\n'
        self.assertIn("chem · valence", tags(src))

    def test_five_bond_carbon_via_molfromsmiles_arg(self):
        src = 'from rdkit import Chem\nmol = Chem.MolFromSmiles("CC(C)(C)(C)C")\n'
        self.assertIn("chem · valence", tags(src))

    def test_valid_caffeine_smiles_ok(self):
        # A real, valid caffeine SMILES must NOT be flagged.
        src = 'smiles = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"\n'
        self.assertNotIn("chem · valence", tags(src))

    def test_valid_acetic_acid_ok(self):
        self.assertNotIn("chem · valence", tags('smi = "CC(=O)O"\n'))

    def test_over_valent_halogen(self):
        # Fluorine can only bond once; two bonds is impossible.
        self.assertIn("chem · valence", tags('smiles = "F(C)C"\n'))

    def test_non_chemistry_string_not_parsed_as_smiles(self):
        # A plain string not in a chemistry context is never treated as SMILES.
        self.assertNotIn("chem · valence", tags('label = "C(C)(C)(C)(C)C"\n'))

    def test_bracket_atoms_are_not_flagged(self):
        # Bracket atoms specify their own valence/charge/H — we bail rather than
        # risk a false positive (precision over recall).
        self.assertNotIn("chem · valence", tags('smiles = "[C](C)(C)(C)(C)C"\n'))

    def test_r_molfromsmiles_regex_fallback(self):
        fs = findings('mol <- MolFromSmiles("C(C)(C)(C)(C)C")\n', lang="r")
        self.assertTrue(any(f.tag == "chem · valence" for f in fs))


class ChemistryRDKit(unittest.TestCase):
    """When RDKit is available it is authoritative — it catches invalid
    molecules the static bond-counter misses, and suppresses static false
    positives. When absent, the static check stands. `_rdkit_verdict` is
    patched to drive all three states deterministically without RDKit."""

    def test_rdkit_flags_what_static_misses(self):
        # An unclosed ring the static counter passes, but RDKit rejects.
        with unittest.mock.patch.object(dc, "_rdkit_verdict", lambda s: "invalid"):
            self.assertIn("chem · valence", tags('smiles = "c1ccc"\n'))

    def test_rdkit_valid_suppresses_static_false_positive(self):
        # A SMILES the static heuristic would flag, but RDKit says is valid →
        # no finding (the real library overrides the heuristic).
        with unittest.mock.patch.object(dc, "_rdkit_verdict", lambda s: "valid"):
            self.assertNotIn("chem · valence", tags('smiles = "C(C)(C)(C)(C)C"\n'))

    def test_static_used_when_rdkit_absent(self):
        # verdict None = RDKit not importable → the static bond-counter decides.
        with unittest.mock.patch.object(dc, "_rdkit_verdict", lambda s: None):
            self.assertIn("chem · valence", tags('smiles = "C(C)(C)(C)(C)C"\n'))
            self.assertNotIn("chem · valence", tags('smiles = "CC(=O)O"\n'))


class SocialScience(unittest.TestCase):
    def test_tests_in_a_loop_without_correction(self):
        # Many significance tests inside a loop, no multiple-comparison
        # correction — the named silent-p-hacking failure class.
        src = (
            "from scipy import stats\n"
            "for col in cols:\n"
            "    t, p = stats.ttest_ind(a[col], b[col])\n"
        )
        self.assertIn("social · multiple-comparisons", tags(src))

    def test_three_tests_without_correction(self):
        src = (
            "from scipy import stats\n"
            "r1 = stats.ttest_ind(a, b)\n"
            "r2 = stats.pearsonr(x, y)\n"
            "r3 = stats.f_oneway(g1, g2, g3)\n"
        )
        self.assertIn("social · multiple-comparisons", tags(src))

    def test_correction_present_ok(self):
        src = (
            "from scipy import stats\n"
            "from statsmodels.stats.multitest import multipletests\n"
            "pvals = []\n"
            "for col in cols:\n"
            "    t, p = stats.ttest_ind(a[col], b[col])\n"
            "    pvals.append(p)\n"
            "multipletests(pvals, method='fdr_bh')\n"
        )
        self.assertNotIn("social · multiple-comparisons", tags(src))

    def test_single_test_ok(self):
        # One test needs no multiple-comparison correction.
        src = "from scipy import stats\nt, p = stats.ttest_ind(a, b)\n"
        self.assertNotIn("social · multiple-comparisons", tags(src))

    def test_mean_of_categorical_code(self):
        # Taking the mean of a nominal code (gender coded 0/1/2) is meaningless.
        self.assertIn("social · categorical", tags("m = df['gender'].mean()\n"))

    def test_groupby_key_is_ok(self):
        # gender as a groupby KEY (not the averaged value) is correct usage.
        self.assertNotIn(
            "social · categorical",
            tags("m = df.groupby('gender')['income'].mean()\n"),
        )

    def test_mean_of_continuous_ok(self):
        self.assertNotIn("social · categorical", tags("m = df['income'].mean()\n"))


class Driver(unittest.TestCase):
    def test_run_emits_contract(self):
        # end-to-end: temp file -> run() -> review contract shape.
        import tempfile, os
        d = tempfile.mkdtemp()
        p = os.path.join(d, "a.py")
        with open(p, "w") as fh:
            fh.write("t_seconds = 1\nd_meters = 2\nx = t_seconds + d_meters\n")
        res = dc.run([p])
        self.assertIn("findings", res)
        self.assertIn("note", res)
        self.assertTrue(res["findings"])
        f0 = res["findings"][0]
        self.assertEqual(f0["check"], "domain")
        self.assertIn("tag", f0)
        self.assertNotIn("no error", res["note"].lower())

    def test_syntax_error_no_crash(self):
        # Malformed python must not crash the gate.
        res = dc.analyze(dc._build_ctx("bad.py", "def (:\n", "python"))
        self.assertEqual(res, [])

    def test_r_trig_regex_fallback(self):
        fs = findings("y <- sin(angle_deg)\n", lang="r")
        self.assertTrue(any("degree" in f.title.lower() for f in fs))


if __name__ == "__main__":
    unittest.main(verbosity=2)
