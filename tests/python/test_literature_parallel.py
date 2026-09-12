"""Concurrency and resumability contracts for the literature workflow."""

import importlib.util
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[2] / "resources" / "skills" / "zerowall-literature" / "scripts" / "literature_pipeline.py"
spec = importlib.util.spec_from_file_location("literature_pipeline_parallel", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class LiteratureParallelTests(unittest.TestCase):
    def _task(self, root: Path):
        task = module.Task(root)
        target = module.Paper(key="doi:target", title="Target", direction="target", parse_status="mineru_parsed", parsed_text_path="target.md")
        cited = [module.Paper(key=f"doi:cited-{i}", title=f"Citing paper {i}", direction="cited-by", authors=[f"Author {i}"]) for i in range(2)]
        state = task.load(); state.update({"workflow_mode": module.WORKFLOW_MODE, "task_root": str(root), "papers": [module.asdict(target), *[module.asdict(p) for p in cited]], "parallel_jobs": {}}); task.save(state)
        return task, state, target, cited

    def test_workers_run_concurrently_and_write_independent_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, _target, cited = self._task(Path(directory) / "task")
            state["author_evidence"] = {"kept": True}; task.save(state)
            original_state = task.state_path.read_bytes()
            barrier = threading.Barrier(2)
            seen = []

            def fake_download(_client, paper, _allow_tsg=True):
                barrier.wait(timeout=5)
                seen.append(paper.key)
                paper.pdf_status = "downloaded_paper_download"
                paper.acquisition_state = "acquisition_terminal"

            with patch.object(module, "download_paper", side_effect=fake_download):
                result = module.run_pdf_acquisition(task, state, 1, 2, True)
            self.assertIn(result["status"], {"complete", "partial"})
            self.assertEqual(set(seen), {p.key for p in cited})
            self.assertEqual(len(list((Path(directory) / "task" / "analysis" / "pdf_jobs").glob("*.json"))), 2)
            self.assertEqual(task.state_path.read_bytes(), original_state)

    def test_worker_does_not_erase_existing_author_state_and_merge_only_pdf_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, _target, cited = self._task(Path(directory) / "task")
            state["author_evidence"] = {"kept": True}; task.save(state)
            paper = cited[0]
            paper.pdf_path = str(Path(directory) / "task" / "downloads" / "cited.pdf")
            paper.pdf_status = "downloaded_paper_download"; paper.pdf_source = "paper-download"; paper.pdf_sha256 = "abc"
            module._write_pdf_job(task, paper, "complete")
            merged = module.merge_pdf_jobs(task, task.load())
            loaded = task.load()
            self.assertEqual(loaded.get("author_evidence"), {"kept": True})
            got = next(p for p in merged if p.key == paper.key)
            self.assertEqual(got.pdf_source, "paper-download")
            self.assertEqual(got.pdf_sha256, "abc")
            self.assertEqual(got.authors, ["Author 0"])

    def test_retryable_evidence_is_not_terminal(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, _target, _cited = self._task(Path(directory) / "task")
            requests = module.prepare_enrichment_requests(task, state)
            request = next(row for row in requests if row["tool"] == "advanced_search")
            evidence = Path(directory) / "retry.json"; evidence.write_text(json.dumps({"status": "retryable"}), encoding="utf-8")
            module.ingest_evidence(task, state, request["request_id"], evidence)
            latest = next(row for row in task.provider_requests() if row["request_id"] == request["request_id"])
            self.assertEqual(latest["status"], "retryable")
            self.assertNotIn(latest["status"], {"succeeded", "failed", "blocked_provider", "not_found_after_search", "ambiguous_identity"})

    def test_author_queue_has_unique_subjects_and_covers_all_cited_authors(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, _target, cited = self._task(Path(directory) / "task")
            cited[1].authors.append("Author 0")
            state["papers"] = [module.asdict(_target), *[module.asdict(p) for p in cited]]; task.save(state)
            with patch.dict(module.os.environ, {"LITERATURE_AUTHOR_SEARCH_LIMIT": "1"}):
                requests = module.prepare_enrichment_requests(task, state)
            expected = {e["author_entity_id"] for e in module.unique_author_entities([_target, *cited])}
            author_requests = [r for r in requests if r.get("kind") == "author"]
            self.assertEqual({r["subject"] for r in author_requests}, expected)
            self.assertEqual(len({r["request_id"] for r in author_requests}), len(author_requests))
            groups = json.loads((task.root / "analysis" / "author_parallel_groups.json").read_text(encoding="utf-8"))["groups"]
            grouped_ids = [request_id for request_ids in groups.values() for request_id in request_ids]
            self.assertEqual(set(groups), expected)
            self.assertEqual(set(grouped_ids), {r["request_id"] for r in author_requests})
            self.assertEqual(len(grouped_ids), len(set(grouped_ids)))
            engines_by_subject = {}
            for subject in expected:
                engines = {
                    row["args"].get("engine") for row in author_requests
                    if row["subject"] == subject and row["tool"] == "advanced_search"
                }
                self.assertEqual(len(engines), 1)
                engines_by_subject[subject] = next(iter(engines))
            self.assertEqual(set(engines_by_subject.values()), {"deepseek-official", "tavily"})

    def test_state_revision_is_monotonic_across_task_instances(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "task"
            first = module.Task(root); state = first.load(); first.save(state)
            revision = state["state_revision"]
            second = module.Task(root); loaded = second.load(); second.save(loaded)
            self.assertGreater(loaded["state_revision"], revision)

    def test_stale_running_pdf_job_is_recovered(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, _target, cited = self._task(Path(directory) / "task")
            module._write_pdf_job(task, cited[0], "running", worker_pid=99999999)
            task.pdf_worker_path.write_text(json.dumps({
                "pid": 99999999, "status": "running", "heartbeat_at": "2000-01-01T00:00:00+00:00"
            }), encoding="utf-8")
            self.assertEqual(module.recover_stale_pdf_jobs(task), 1)
            snapshot = json.loads(module._pdf_job_path(task, cited[0].key).read_text(encoding="utf-8"))
            self.assertEqual(snapshot["status"], "retryable")
            self.assertEqual(snapshot["paper"]["pdf_status"], "retryable")

    def test_metadata_analysis_writes_citation_relations_before_pdf_completion(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, target, cited = self._task(Path(directory) / "task")
            module.build_metadata_analysis(task, state, [target, *cited])
            rows = json.loads((Path(directory) / "task" / "analysis" / "citation_relations.json").read_text(encoding="utf-8"))
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(row.get("cited") is True for row in rows))

    def test_intermediate_report_only_writes_progress(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state, _target, _cited = self._task(Path(directory) / "task")
            state["stage"] = "author_enriching"
            module.report(task, state)
            self.assertTrue((task.root / "analysis" / "progress.json").is_file())
            self.assertFalse((task.root / "papers.xlsx").exists())
            self.assertFalse((task.root / "report.html").exists())
            self.assertFalse((task.root / "report.pdf").exists())

    def test_resume_starts_enrichment_without_synchronous_pdf_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "task"
            task, state, target, cited = self._task(root)
            (root / "target.md").write_text("target evidence", encoding="utf-8")
            target.parsed_text_path = str(root / "target.md")
            state["papers"] = [module.asdict(target), *[module.asdict(p) for p in cited]]
            state["cited_by_expanded"] = True
            state["research_plan"] = {"max_papers": 2, "download_pdfs": True, "download_workers": 2}
            task.save(state)
            args = type("Args", (), {"task": root, "timeout": 1, "partial": False, "no_tsg": False, "from_evidence_dir": None})()
            with patch.object(module.Client, "enrich", side_effect=lambda p: p), patch.object(module, "start_pdf_worker", return_value=True), patch.object(module, "download_paper", side_effect=AssertionError("synchronous download")), patch.object(module, "report"):
                result = module.run_resume(args)
            self.assertEqual(result, 0)
            self.assertTrue((root / "analysis" / "provider_requests.jsonl").is_file())


if __name__ == "__main__":
    unittest.main()
