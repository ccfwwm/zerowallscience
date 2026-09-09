"""Focused contracts for the three-stage ZeroWall Literature workflow."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "resources"
    / "skills"
    / "zerowall-literature"
    / "scripts"
    / "literature_pipeline.py"
)
spec = importlib.util.spec_from_file_location("literature_pipeline_three_stage", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class LiteratureThreeStageTests(unittest.TestCase):
    def _prepare(self, task: module.Task, state: dict) -> list[dict]:
        """Use the queue API while accepting the legacy compatibility name."""
        prepare = getattr(module, "prepare_enrichment", None)
        if prepare is not None:
            prepare(task, state)
            return task.provider_requests()
        return module.prepare_enrichment_requests(task, state)

    def _state_with_target_and_cited(self, root: Path) -> tuple[module.Task, dict]:
        task = module.Task(root)
        target = module.Paper(
            key="pmid:100",
            title="Target paper",
            pmid="100",
            doi="10.1000/target",
            openalex_id="https://openalex.org/W100",
            direction="target",
        )
        cited = module.Paper(
            key="pmid:200",
            title="Citing paper",
            pmid="200",
            authors=["Ada Lovelace", "Grace Hopper"],
            direction="cited-by",
        )
        state = task.load()
        state.update(
            {
                "workflow_mode": module.WORKFLOW_MODE,
                "task_root": str(root),
                "research_plan": {"max_papers": 20},
                "papers": [module.asdict(target), module.asdict(cited)],
            }
        )
        task.save(state)
        return task, state

    def test_author_entities_deduplicate_name_and_keep_paper_links(self):
        first = module.Paper(
            key="doi:10.1/one",
            title="One",
            direction="cited-by",
            authors=["Ada Lovelace", "Grace Hopper"],
        )
        second = module.Paper(
            key="doi:10.1/two",
            title="Two",
            direction="cited-by",
            authors=["Ada Lovelace"],
        )

        entities = module.unique_author_entities([first, second])

        ada = next(row for row in entities if row["name"] == "Ada Lovelace")
        self.assertEqual(len(entities), 2)
        self.assertEqual({row["paper_key"] for row in ada["papers"]}, {first.key, second.key})
        self.assertTrue(ada["author_entity_id"])

    def test_prepare_enrichment_requests_covers_pubmed_and_authors_without_references(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            requests = self._prepare(task, state)

            tools = {row["tool"] for row in requests}
            author_requests = [
                row for row in requests
                if row["kind"] == "author" or row["kind"].startswith("author_")
            ]
            self.assertIn("pubmed_find_related", tools)
            self.assertIn("openalex_citations", tools)
            self.assertIn("pubmed_get_s2_citations", tools)
            self.assertIn("pubmed_fetch_articles", tools)
            self.assertIn("pubmed_search_articles", tools)
            self.assertIn("web_search", tools)
            self.assertGreaterEqual(len(author_requests), 10)  # at least 2 authors x 5 required lookups
            expected_subjects = {
                row["author_entity_id"]
                for row in module.unique_author_entities(
                    [module.Paper(**{k: v for k, v in row.items() if k in module.Paper.__dataclass_fields__})
                     for row in state["papers"]]
                )
            }
            self.assertEqual({row["subject"] for row in author_requests}, expected_subjects)
            self.assertFalse(any("reference" in str(row).lower() for row in requests))
            self.assertTrue(task.provider_requests_path.is_file())

    def test_ingest_evidence_writes_provider_specific_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            requests = self._prepare(task, state)
            request = next(row for row in requests if row["tool"] == "web_search")
            result_path = Path(directory) / "web-result.json"
            result_path.write_text(
                json.dumps({"results": [{"title": "Ada profile", "url": "https://example.org/ada"}]}),
                encoding="utf-8",
            )

            item = module.ingest_evidence(task, state, request["request_id"], result_path)

            self.assertEqual(item["status"], "ok")
            self.assertEqual(task.web_search_receipts()[0]["provider"], "web_search")
            self.assertIn(task.web_search_receipts()[0]["status"], {"ok", "succeeded"})
            self.assertEqual(task.mcp_receipts(), [])
            inbox = (Path(directory) / "task" / "analysis" / "evidence_inbox.jsonl").read_text(encoding="utf-8")
            self.assertIn(request["request_id"], inbox)

    def test_author_search_without_host_adapter_is_blocked_and_audited(self):
        with tempfile.TemporaryDirectory() as directory:
            task = module.Task(Path(directory) / "task")
            cited = module.Paper(
                key="doi:10.1/cited",
                title="Citing paper",
                direction="cited-by",
                authors=["Ada Lovelace"],
            )
            with patch.dict(module.os.environ, {"LITERATURE_WEB_SEARCH_MODULE": ""}, clear=False):
                records = module.enrich_all_authors(task, [cited])

            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["evidence_status"], "blocked_provider")
            self.assertEqual(records[0]["confidence"], "low")
            receipts = task.web_search_receipts()
            self.assertEqual(len(receipts), 4)
            self.assertTrue(all(row["status"] == "blocked_provider" for row in receipts))
            self.assertFalse(any(row.get("status") == "skipped_no_adapter" for row in receipts))


if __name__ == "__main__":
    unittest.main()
