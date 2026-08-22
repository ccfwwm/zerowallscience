#!/usr/bin/env python3
"""Pure offline tests for shared empty-search-criterion handling."""

import importlib.util
import sys
import unittest
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "lib/mcp_servers_common/criteria.py"
SPEC = importlib.util.spec_from_file_location("mcp_criteria", PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules["mcp_criteria"] = MODULE
SPEC.loader.exec_module(MODULE)
blank = MODULE.blank
none_if_blank = MODULE.none_if_blank
reject_blank = MODULE.reject_blank


class CriteriaTests(unittest.TestCase):
    def test_blank_distinguishes_omitted_from_empty(self):
        self.assertFalse(blank(None))
        self.assertTrue(blank(""))
        self.assertTrue(blank(" \t\r\n"))
        self.assertFalse(blank("TP53"))
        self.assertFalse(blank(0))

    def test_none_if_blank_preserves_omitted_and_values(self):
        self.assertIsNone(none_if_blank(None))
        self.assertIsNone(none_if_blank("  "))
        self.assertEqual(none_if_blank(" BRCA1 "), " BRCA1 ")

    def test_reject_blank_accepts_optional_and_non_string_values(self):
        reject_blank(query=None, year=2025, tags=["rna"])

    def test_reject_blank_names_all_bad_criteria(self):
        with self.assertRaisesRegex(ValueError, "organism, query"):
            reject_blank({"query": ""}, organism="  ", year=None)


if __name__ == "__main__":
    unittest.main()
