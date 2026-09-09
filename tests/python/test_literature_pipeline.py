import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[2] / "resources" / "skills" / "zerowall-literature" / "scripts" / "literature_pipeline.py"
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

    def test_citation_contexts_expand_numeric_ranges(self):
        target = module.Paper(key="doi:10.1/x", title="Target", authors=["Alice Smith"])
        contexts = module.citation_contexts("The result was cited by refs [17-20] and again (18, 22).", target, ref_number=18)
        self.assertEqual(len(contexts), 2)
        self.assertTrue(all(item["page"] == 1 for item in contexts))

    def test_reference_number_is_inferred_from_bibliography(self):
        text = "Introduction cites the work [17-20].\nReferences\n18. Smith A. Upregulation of WDR6 drives hepatic de novo lipogenesis in insulin resistance in mice. doi:10.1038/s42255-023-00896-7"
        target = module.Paper(key="doi:10.1038/s42255-023-00896-7", title="Upregulation of WDR6 drives hepatic de novo lipogenesis in insulin resistance in mice", doi="10.1038/s42255-023-00896-7")
        self.assertEqual(module.infer_reference_number(text, target), 18)
        contexts = module.citation_contexts(text, target, 18)
        self.assertEqual(len(contexts), 1)

    def test_dedup_merges_doi_and_title_aliases(self):
        first = module.Paper(key="openalex:W1", title="A WDR6 study", doi="10.1000/ABC", year="2023", authors=["A"])
        second = module.Paper(key="crossref:1", title="A WDR6 study", doi="https://doi.org/10.1000/abc", year="2023", authors=["B"], countries=["US"])
        papers, aliases = module.deduplicate_papers([first, second])
        self.assertEqual(len(papers), 1)
        self.assertEqual(len(aliases), 1)
        self.assertIn("B", papers[0].authors)
        self.assertIn("US", papers[0].countries)

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

    def test_local_csv_rejects_multiple_main_article_titles(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "articles.csv"
            path.write_text("title\nFirst article title with enough words to be detected\nSecond article title with enough words to be detected\n", encoding="utf-8")
            client = module.Client(module.Task(Path(directory) / "task"))
            with self.assertRaises(ValueError):
                client.from_local(path)

    def test_local_csv_accepts_one_main_article_title(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "article.csv"
            title = "Upregulation of WDR6 drives hepatic de novo lipogenesis in insulin resistance in mice"
            path.write_text(f"title\n{title}\n", encoding="utf-8")
            client = module.Client(module.Task(Path(directory) / "task"))
            paper = client.from_local(path)
            self.assertEqual(paper.title, title)

    def test_flatten_excel_value_never_returns_nested_values(self):
        value = module.flatten_excel_value([{"a": [1, 2]}, "x"])
        self.assertIsInstance(value, str)
        self.assertIn("a:", value)

    def test_analyze_defaults_to_full_pdf_acquisition(self):
        captured = {}

        def capture(args):
            captured["download_pdfs"] = args.download_pdfs
            captured["directions"] = args.directions
            captured["max_papers"] = args.max_papers
            return 0

        with patch.object(module, "run_analyze", capture):
            result = module.main(["analyze", "A paper title", "--output", "task"])
        self.assertEqual(result, 0)
        self.assertTrue(captured["download_pdfs"])
        self.assertEqual(captured["directions"], "references,cited-by")
        self.assertEqual(captured["max_papers"], 40)

    def test_ingest_mineru_result_persists_artifacts_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "task"
            task = module.Task(root)
            paper = module.Paper(key="doi:10.1/test", title="Test paper", doi="10.1/test", pdf_path=str(root / "downloads" / "test.pdf"))
            state = task.load()
            state.update({"task_root": str(root.resolve()), "papers": [module.asdict(paper)]})
            task.save(state)
            run_dir = Path(directory) / "mineru-run"
            run_dir.mkdir()
            (run_dir / "full.md").write_text("# Test paper\n\nMinerU extracted body text.", encoding="utf-8")
            (run_dir / "run.json").write_text("{}", encoding="utf-8")

            with patch.object(module, "report"):
                parsed = module.ingest_mineru_result(task, state, "10.1/test", run_dir, "task-123", "precision")

            self.assertEqual(parsed.parse_status, "mineru_parsed")
            self.assertEqual(parsed.parser_task_id, "task-123")
            self.assertEqual(parsed.parser_api, "precision")
            self.assertTrue(Path(parsed.parsed_text_path).is_file())
            self.assertEqual(len(parsed.parser_artifacts), 2)
            self.assertEqual(task.load()["stage"], "analysis_pending")
            self.assertTrue(any(row["provider"] == "mineru" for row in task.ledger()))

    def test_finalize_rejects_missing_agent_analysis(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "task"
            task = module.Task(root)
            paper = module.Paper(key="doi:10.1/test", title="Test paper", doi="10.1/test", direction="target", pdf_path="paper.pdf", parse_status="mineru_parsed")
            state = task.load()
            state.update({"task_root": str(root.resolve()), "papers": [module.asdict(paper)]})
            with self.assertRaisesRegex(ValueError, "analyze_authors"):
                module.finalize_analysis(task, state)
            self.assertEqual(task.load()["stage"], "analysis_pending")

    def test_finalize_marks_complete_when_required_evidence_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "task"
            task = module.Task(root)
            analysis = root / "analysis"
            analysis.mkdir()
            (analysis / "provider_evidence.json").write_text('{"queries":[{"provider":"OpenAlex","status":"ok"}]}', encoding="utf-8")
            for name in ("citation_analysis.md", "author_analysis.md", "synthesis.md"):
                (analysis / name).write_text(f"# {name}\n\n" + "Verified evidence with source identifiers and explicit limitations. " * 2, encoding="utf-8")
            paper = module.Paper(key="doi:10.1/test", title="Test paper", doi="10.1/test", direction="target", pdf_path="paper.pdf", parse_status="mineru_parsed")
            state = task.load()
            state.update({"task_root": str(root.resolve()), "papers": [module.asdict(paper)]})
            with patch.object(module, "report"):
                module.finalize_analysis(task, state)
            self.assertEqual(task.load()["stage"], "complete")


if __name__ == "__main__":
    unittest.main()
