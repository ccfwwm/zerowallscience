"""Behavior checks for OCR recovery, evidence freezing and report dispositions."""
import copy
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "resources/skills/zerowall-image-dup/scripts"))
import rapid_ocr
import integrity_report as report
from PIL import Image


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        Image.new("RGB", (100, 80), "white").save(self.root / "figure.png")
        (self.root / "source.txt").write_text("published evidence", encoding="utf-8")

    def spec(self, count=1):
        return {"schema_version": 1, "paper": {"title": "Example"}, "findings": [
            {"id": "F" + str(index), "title": "Figure <script>alert(1)</script>", "status": "issue", "severity": "high", "module": "statistics",
             "summary": "Observed inconsistency", "limitation": "Does not establish intent", "action": "Correct the figure",
             "evidence": [{"kind": "image", "path": "figure.png", "source": {"path": "source.txt", "page": 1}}]}
            for index in range(count)]}

    def test_disabled_ocr_retains_required_work(self):
        result = rapid_ocr.scan([{"path": str(self.root / "figure.png")}], cache_dir=self.root / "ocr", deadline=time.monotonic() + 10, enabled=False)
        self.assertEqual((result["needed"], result["remaining"], result["status"]), (1, 1, "disabled"))

    def test_ocr_fallback_recognizes_views_and_resumes_by_image_bytes(self):
        calls = []
        def engine_factory():
            def engine(pixels):
                calls.append(pixels.shape)
                return [([[10, 10], [30, 10], [30, 20], [10, 20]], "n=12", .99)], []
            return engine
        images = [{"path": str(self.root / "figure.png"), "image_id": "figure"}]
        kwargs = {"cache_dir": self.root / "ocr", "deadline": time.monotonic() + 30, "engine_factory": engine_factory}
        first = rapid_ocr.scan(images, **kwargs)
        self.assertEqual(first["status"], "done")
        self.assertEqual(len(first["records"][0]["numbers"]), 2)
        rapid_ocr.scan(images, **kwargs)
        self.assertEqual(len(calls), 2)
        Image.new("RGB", (100, 80), "black").save(self.root / "figure.png")
        rapid_ocr.scan(images, **kwargs)
        self.assertEqual(len(calls), 4)

    def test_imported_ocr_only_reuses_matching_hash(self):
        receipt = self.root / "ocr.json"
        report.save(receipt, {"records": [{"status": "text_detected", "source_sha256": rapid_ocr.sha256(self.root / "figure.png"), "views": [{"rotation_ccw_degrees": 0, "detections": [{"text": "12", "confidence": .9, "original_pixel_quad": [[0, 0], [1, 0], [1, 1], [0, 1]]}]}]}]})
        result = rapid_ocr.scan([{"path": str(self.root / "figure.png")}], cache_dir=self.root / "ocr", deadline=time.monotonic() + 10, receipt=receipt, engine_factory=lambda: self.fail("must reuse receipt"))
        self.assertEqual((result["done"], result["with_text"]), (1, 1))

    def test_empty_ocr_is_execution_success_not_a_scientific_finding(self):
        result = rapid_ocr.scan([{"path": str(self.root / "figure.png")}], cache_dir=self.root / "ocr", deadline=time.monotonic() + 10, engine_factory=lambda: lambda pixels: (None, []))
        self.assertEqual((result["status"], result["done"], result["without_text"]), ("done", 1, 1))

    def test_ocr_failure_cannot_become_not_applicable(self):
        def fail():
            raise RuntimeError("model unavailable")
        result = rapid_ocr.scan([{"path": str(self.root / "figure.png")}], cache_dir=self.root / "ocr", deadline=time.monotonic() + 10, engine_factory=fail)
        self.assertEqual((result["status"], result["failed"]), ("failed", 1))

    def test_report_embeds_evidence_escapes_text_and_defaults_to_ten(self):
        report.save(self.root / "spec.json", self.spec(12))
        built = report.publish(self.root, Path("spec.json"), Path("reports"), formats=["html"])
        data = report.read(self.root / built["directory"] / "report.json")
        html = (self.root / built["html"]).read_text(encoding="utf-8")
        self.assertEqual(len(data["summary"]["priority_ids"]), 10)
        self.assertEqual(data["summary"]["verdict"], "issues_found")
        self.assertIn('src="data:image/png;base64,', html)
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertEqual(html.count('priority" open'), 10)

    def test_report_rejects_missing_changed_or_escaping_evidence(self):
        for field, value in [("path", "missing.png"), ("path", "../outside.png"), ("sha256", "wrong")]:
            spec = self.spec()
            spec["findings"][0]["evidence"][0][field] = value
            with self.assertRaises(report.ReportError):
                report.normalize(self.root, spec)

    def test_failed_revision_preserves_last_committed_report(self):
        report.save(self.root / "spec.json", self.spec())
        first = report.publish(self.root, Path("spec.json"), Path("reports"), formats=["html"])
        bad = self.spec(); bad["findings"][0]["evidence"] = []
        report.save(self.root / "spec.json", bad)
        with self.assertRaises(report.ReportError):
            report.publish(self.root, Path("spec.json"), Path("reports"), formats=["html"])
        self.assertEqual(report.read(self.root / "reports/latest.json")["revision"], first["revision"])

    def test_final_disposition_uses_findings_and_material_gaps(self):
        spec = self.spec()
        spec["findings"][0]["status"] = "verified"
        self.assertEqual(report.normalize(self.root, spec)["summary"]["verdict"], "no_issue_detected")
        spec["gaps"] = [{"text": "missing essential data", "blocking": True}]
        self.assertEqual(report.normalize(self.root, spec)["summary"]["verdict"], "insufficient_evidence")
        spec["findings"][0]["status"] = "review_required"
        self.assertEqual(report.normalize(self.root, spec)["summary"]["verdict"], "review_required")

    def test_grouping_never_transfers_a_pixel_review_to_other_candidates(self):
        findings = [{"finding_id": str(i), "detector": "image_dup", "title": "match", "sources": [{"file": "paper", "page": 1, "image": 1}]} for i in range(2)]
        report.save(self.root / "machine.json", {"findings": findings})
        report.save(self.root / "reviews.json", {"records": [{"candidate_id": "0", "pixel_reviewed": True, "evidence": "figure.png", "evidence_sha256": report.digest(self.root / "figure.png")} ]})
        ledger = report.candidate_ledger(self.root, {"path": "machine.json", "reviews": "reviews.json"}, {})
        self.assertEqual(len(ledger["groups"]), 1)
        self.assertEqual(ledger["counts"], {"reviewed": 1, "pending": 1})
        spec = self.spec(); spec['findings'][0]['status'] = 'verified'
        spec['candidate_input'] = {'path': 'machine.json', 'reviews': 'reviews.json'}
        self.assertEqual(report.normalize(self.root, spec)['summary']['verdict'], 'review_required')


if __name__ == "__main__":
    unittest.main()
