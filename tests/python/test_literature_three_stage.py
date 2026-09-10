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
            journal="Journal of Reliable Metrics",
            issn=["1234-5678"],
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
            raw={"author": [{"affiliation": [{"name": "Analytical Engine Institute"}]}, {"affiliation": [{"name": "Analytical Engine Institute"}]}]},
        )
        second = module.Paper(
            key="doi:10.1/two",
            title="Two",
            direction="cited-by",
            authors=["Ada Lovelace", "Grace Hopper"],
            raw={"author": [{"affiliation": [{"name": "Analytical Engine Institute"}]}, {"affiliation": [{"name": "Analytical Engine Institute"}]}]},
        )

        entities = module.unique_author_entities([first, second])

        ada = next(row for row in entities if row["name"] == "Ada Lovelace")
        self.assertEqual(len(entities), 2)
        self.assertEqual({row["paper_key"] for row in ada["papers"]}, {first.key, second.key})
        self.assertTrue(ada["author_entity_id"])

    def test_crossref_metadata_keeps_official_short_container_title(self):
        paper = module.Client.crossref_paper({
            "DOI": "10.1000/example",
            "title": ["Example citing paper"],
            "container-title": ["Journal of Reliable Metrics"],
            "short-container-title": ["J Reliab Metrics"],
            "ISSN": ["1234-5678"],
            "issued": {"date-parts": [[2025]]},
            "author": [{"given": "Ada", "family": "Lovelace"}],
        }, "cited-by")

        self.assertEqual(paper.journal, "Journal of Reliable Metrics")
        self.assertEqual(paper.journal_abbrev, "J Reliab Metrics")
        self.assertEqual(paper.issn, ["1234-5678"])

        repeated = module.Client.crossref_paper({
            "DOI": "10.1000/repeated",
            "title": ["Another paper"],
            "container-title": ["Journal of Reliable Metrics"],
            "short-container-title": ["Journal of Reliable Metrics"],
            "issued": {"date-parts": [[2025]]},
        }, "cited-by")
        self.assertEqual(repeated.journal_abbrev, "")

    def test_same_name_without_two_identity_anchors_stays_separate(self):
        first = module.Paper(key="doi:10.1/a", title="A", direction="cited-by", authors=["Wei Zhang"], raw={"author": [{"affiliation": [{"name": "Institute A"}]}]})
        second = module.Paper(key="doi:10.1/b", title="B", direction="cited-by", authors=["Wei Zhang"], raw={"author": [{"affiliation": [{"name": "Institute B"}]}]})

        entities = module.unique_author_entities([first, second])

        self.assertEqual(len(entities), 2)
        self.assertNotEqual(entities[0]["author_entity_id"], entities[1]["author_entity_id"])

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
            self.assertIn("advanced_search", tools)
            self.assertIn("free_search_test", tools)
            self.assertGreaterEqual(len(author_requests), 12)  # 2 authors x 3 metadata + 3 web engines
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
            journal_search = next(
                row for row in requests
                if row["kind"] == "journal" and row["tool"] == "advanced_search"
            )
            self.assertIn("journal_abbrev", journal_search["result_contract"]["fields"])
            self.assertIn("ISO 4 abbreviation", journal_search["query"])

    def test_ingest_evidence_writes_provider_specific_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            requests = self._prepare(task, state)
            request = next(row for row in requests if row["tool"] == "advanced_search")
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

    def test_journal_evidence_updates_every_citing_paper_from_same_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            cited = state["papers"][1]
            cited["journal"] = "Journal of Reliable Metrics"
            cited["issn"] = ["1234-5678"]
            second = dict(cited)
            second.update({"key": "doi:10.1/second", "title": "Second citing paper", "pmid": "201"})
            state["papers"].append(second)
            task.save(state)
            requests = self._prepare(task, state)
            request = next(row for row in requests if row["kind"] == "journal" and row["tool"] == "advanced_search")
            result_path = Path(directory) / "journal-result.json"
            result_path.write_text(json.dumps({
                "status": "ok",
                "journal": "Journal of Reliable Metrics",
                "issn": ["1234-5678"],
                "facts": {
                    "impact_factor": 12.3,
                    "impact_factor_year": 2025,
                    "metric_type": "JCR impact factor",
                    "source_url": "https://example.org/jcr/journal",
                },
                "sources": [{"url": "https://example.org/jcr/journal"}],
            }), encoding="utf-8")

            module.ingest_evidence(task, state, request["request_id"], result_path)

            saved = task.load()
            citing = [row for row in saved["papers"] if row["direction"] == "cited-by"]
            self.assertEqual(len(citing), 2)
            self.assertTrue(all(row["journal_metric"]["impact_factor"] == 12.3 for row in citing))
            self.assertTrue(all(row["journal_metric"]["impact_factor_year"] == 2025 for row in citing))

    def test_journal_evidence_rejects_cross_journal_impact_factor(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            cited = state["papers"][1]
            cited["journal"] = "Requested Journal"
            cited["issn"] = ["1111-2222"]
            task.save(state)
            request = next(row for row in self._prepare(task, state) if row["kind"] == "journal" and row["tool"] == "advanced_search")
            result = Path(directory) / "wrong-journal.json"
            result.write_text(json.dumps({
                "status": "ok", "journal": "Different Journal", "issn": ["9999-9999"],
                "verified_facts": {"impact_factor": 5.4, "impact_factor_year": 2025, "source_url": "https://example.org/wrong"},
            }), encoding="utf-8")
            module.ingest_evidence(task, state, request["request_id"], result)
            saved = task.load()
            self.assertNotIn("impact_factor", saved["papers"][1].get("journal_metric") or {})

    def test_journal_verified_fact_list_preserves_jif_value_year_and_source(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            cited = state["papers"][1]
            cited["journal"] = "Journal of Reliable Metrics"
            cited["issn"] = ["1234-5678"]
            task.save(state)
            request = next(
                row for row in self._prepare(task, state)
                if row["kind"] == "journal" and row["tool"] == "advanced_search"
            )
            result = Path(directory) / "journal-fact-list.json"
            result.write_text(json.dumps({
                "status": "ok",
                "journal": "Journal of Reliable Metrics",
                "issn": ["1234-5678"],
                "verified_facts": [
                    {"field": "impact_factor", "value": 7.8},
                    {"field": "impact_factor_year", "value": 2025},
                    {"field": "source_url", "value": "https://example.org/journals/reliable"},
                ],
            }), encoding="utf-8")

            module.ingest_evidence(task, state, request["request_id"], result)

            saved = task.load()
            metric = saved["papers"][1]["journal_metric"]
            self.assertEqual(metric["impact_factor"], 7.8)
            self.assertEqual(metric["impact_factor_year"], 2025)
            self.assertEqual(metric["source_url"], "https://example.org/journals/reliable")
            paper = module.Paper(**{
                key: value for key, value in saved["papers"][1].items()
                if key in module.Paper.__dataclass_fields__
            })
            self.assertEqual(module.verified_impact_factor(paper), (7.8, 2025))

    def test_journal_verified_fact_list_backfills_abbreviation(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            cited = state["papers"][1]
            cited["journal"] = "Journal of Reliable Metrics"
            cited["issn"] = ["1234-5678"]
            task.save(state)
            request = next(
                row for row in self._prepare(task, state)
                if row["kind"] == "journal" and row["tool"] == "advanced_search"
            )
            result = Path(directory) / "journal-abbreviation.json"
            result.write_text(json.dumps({
                "status": "ok",
                "value": {
                    "verified_facts": [
                        {"field": "journal_full", "value": "Journal of Reliable Metrics"},
                        {"field": "journal_abbrev", "value": "J Reliab Metrics"},
                        {"field": "issn", "value": ["1234-5678"]},
                        {"field": "impact_factor", "value": 7.8},
                        {"field": "impact_factor_year", "value": 2025},
                        {"field": "source_url", "value": "https://example.org/journals/reliable"},
                    ],
                },
            }), encoding="utf-8")

            module.ingest_evidence(task, state, request["request_id"], result)

            saved = task.load()["papers"][1]
            self.assertEqual(saved["journal_abbrev"], "J Reliab Metrics")
            self.assertEqual(saved["journal_metric"]["impact_factor"], 7.8)
            self.assertEqual(saved["journal_metric"]["impact_factor_year"], 2025)

    def test_pubmed_fetch_articles_backfills_journal_abbreviation_and_issue(self):
        with tempfile.TemporaryDirectory() as directory:
            task, state = self._state_with_target_and_cited(Path(directory) / "task")
            task.save(state)
            request = next(
                row for row in self._prepare(task, state)
                if row["kind"] == "metadata" and row["tool"] == "pubmed_fetch_articles"
            )
            result = Path(directory) / "pubmed-fetch.json"
            result.write_text(json.dumps({
                "status": "ok",
                "value": {
                    "articles": [{
                        "pmid": "200",
                        "title": "Citing paper",
                        "journalInfo": {
                            "title": "Journal of Reliable Metrics",
                            "isoAbbreviation": "J Reliab Metrics",
                            "volume": "12",
                            "issue": "3",
                            "pages": "10-20",
                            "issn": "1234-5678",
                            "eIssn": "8765-4321",
                        },
                    }],
                },
            }), encoding="utf-8")

            item = module.ingest_evidence(task, state, request["request_id"], result)

            saved = task.load()["papers"][1]
            self.assertEqual(saved["journal"], "Journal of Reliable Metrics")
            self.assertEqual(saved["journal_abbrev"], "J Reliab Metrics")
            self.assertEqual(saved["volume"], "12")
            self.assertEqual(saved["issue"], "3")
            self.assertEqual(saved["pages"], "10-20")
            self.assertEqual(saved["issn"], ["1234-5678", "8765-4321"])
            self.assertEqual(item["normalized_paper_metadata"][0]["pmid"], "200")

    def test_verified_facts_populate_current_author_fields(self):
        facts = module.extract_ingested_author_facts([{
            "tool": "advanced_search", "status": "ok", "result": {
                "verified_facts": {
                    "current_position": "Professor", "current_institution": "Example University",
                    "country": "China", "research_topics": ["Thyroid biology"],
                    "representative_publication": "Representative paper",
                },
                "source_urls": ["https://example.edu/author"],
            },
        }])
        self.assertEqual(facts["current_title"], "Professor")
        self.assertEqual(facts["current_institution"], "Example University")
        self.assertEqual(facts["current_country"], "China")
        self.assertIn("Representative paper", facts["top_works"])
        self.assertIn("https://example.edu/author", facts["sources"])

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
