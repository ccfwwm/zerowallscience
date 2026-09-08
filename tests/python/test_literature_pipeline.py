import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "resources" / "skills" / "zerowall-literature-trail" / "scripts" / "literature_pipeline.py"
spec = importlib.util.spec_from_file_location("literature_pipeline", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class LiteraturePipelineTests(unittest.TestCase):
    def test_title_score_prefers_exact_match(self):
        exact = module.title_score("A study of WDR6 in mice", "A study of WDR6 in mice")
        distant = module.title_score("A study of WDR6 in mice", "Genome-wide association of bone density")
        self.assertGreater(exact, distant)
        self.assertEqual(exact, 1.0)

    def test_citation_contexts_capture_multiple_locations(self):
        text = "Results support the finding [18]. Later, unlike the prior work [18], the mechanism differed."
        target = module.Paper(key="pmid:1", title="Prior work", authors=["Alice Smith"])
        contexts = module.citation_contexts(text, target, ref_number=18)
        self.assertGreaterEqual(len(contexts), 2)
        self.assertTrue(all(item["excerpt"] for item in contexts))

    def test_pdf_validation_requires_magic_and_returns_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "paper.pdf"
            path.write_bytes(b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")
            paper = module.Paper(key="doi:10.1/test", title="A paper")
            ok, reason, digest = module.validate_pdf(path, paper)
            self.assertTrue(ok)
            self.assertEqual(reason, "ok")
            self.assertEqual(len(digest), 64)

    def test_task_writes_json_state_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            task = module.Task(Path(directory))
            state = task.load()
            state["stage"] = "identified"
            task.save(state)
            self.assertEqual(task.load()["stage"], "identified")
            self.assertFalse(task.state_path.with_suffix(".tmp").exists())


if __name__ == "__main__":
    unittest.main()
