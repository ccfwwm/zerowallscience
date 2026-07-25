#!/usr/bin/env python3
"""Tests for the traceability reviewer's PDF extractor (P0-4).

Run: python scripts/dev/test_pdf_extract.py
Builds a small real PDF with whatever backend is installed, then verifies the
extractor pulls text, citation identifiers, and quantitative claims.
"""
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

_MOD = (
    Path(__file__).resolve().parents[2]
    / "runtime/skills/core/traceability-review/pdf_extract.py"
)
_spec = importlib.util.spec_from_file_location("pdf_extract", _MOD)
assert _spec and _spec.loader
pe = importlib.util.module_from_spec(_spec)
sys.modules["pdf_extract"] = pe
_spec.loader.exec_module(pe)

# Short lines only — a PDF writer that doesn't wrap will clip long lines at the
# page edge, so we keep every identifier well within the margin.
MANUSCRIPT = "\n".join(
    [
        "Effect of Sunlight on Plant Growth",
        "We analyzed the data (N = 240) and",
        "found a significant increase (p < 0.001),",
        "a 37% improvement over control.",
        "See Smith 2020, DOI: 10.1234/example.2026",
        "preprint arXiv:2401.00001",
        "PMID: 31234567",
    ]
)


def make_pdf(path: str) -> bool:
    """Write MANUSCRIPT to a real PDF using any available writer. Returns False
    if none is installed (the test then self-skips)."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), MANUSCRIPT, fontsize=11)
        doc.save(path)
        return True
    except Exception:
        pass
    try:
        from reportlab.pdfgen import canvas  # type: ignore

        c = canvas.Canvas(path)
        y = 800
        for line in MANUSCRIPT.splitlines():
            c.drawString(72, y, line)
            y -= 16
        c.save()
        return True
    except Exception:
        return False


class PdfExtract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        cls.pdf = os.path.join(cls.dir, "manuscript.pdf")
        cls.have_writer = make_pdf(cls.pdf)

    def test_extracts_text_and_backend(self):
        if not self.have_writer:
            self.skipTest("no PDF writer available")
        r = pe.run(self.pdf, 20000)
        self.assertNotIn("error", r)
        self.assertIn(r["backend"], {"pymupdf", "pypdf", "pypdf2", "pdfminer"})
        self.assertGreaterEqual(r["pages"], 1)
        self.assertIn("Plant Growth", r["text"])

    def test_finds_citation_identifiers(self):
        if not self.have_writer:
            self.skipTest("no PDF writer available")
        c = pe.run(self.pdf, 20000)["citations"]
        self.assertIn("10.1234/example.2026", c["dois"])
        self.assertIn("2401.00001", c["arxiv"])
        self.assertIn("31234567", c["pmids"])

    def test_finds_quantitative_claims(self):
        if not self.have_writer:
            self.skipTest("no PDF writer available")
        claims = pe.run(self.pdf, 20000)["claims"]
        kinds = {c["kind"] for c in claims}
        self.assertIn("p_value", kinds)
        self.assertIn("percent", kinds)
        self.assertIn("sample_size", kinds)

    def test_missing_backend_or_file_reports_error(self):
        # A nonexistent file with all backends present still errors cleanly
        # (open fails) — never a traceback to the user.
        r = pe.run(os.path.join(self.dir, "nope.pdf"), 20000)
        self.assertIn("error", r)


class Regexes(unittest.TestCase):
    """Backend-independent: the identifier/claim regexes on raw text."""

    def test_citations(self):
        c = pe.find_citations("see 10.5555/abc.def and arXiv:2312.99999v2 and PMID:12345")
        self.assertEqual(c["dois"], ["10.5555/abc.def"])
        self.assertEqual(c["arxiv"], ["2312.99999v2"])
        self.assertEqual(c["pmids"], ["12345"])

    def test_doi_trailing_punctuation_stripped(self):
        c = pe.find_citations("(DOI: 10.1000/xyz123).")
        self.assertEqual(c["dois"], ["10.1000/xyz123"])

    def test_claims_with_context(self):
        claims = pe.find_claims("The effect was large, p = 0.03, across N = 88 subjects.")
        kinds = {c["kind"] for c in claims}
        self.assertEqual(kinds, {"p_value", "sample_size"})
        self.assertTrue(all(c["context"] for c in claims))


if __name__ == "__main__":
    unittest.main(verbosity=2)
