#!/usr/bin/env python3
"""Offline contracts for the compact Bio MCP surface."""

import unittest

try:
    from mcp_bio.server import _summary, build_public_tools
except ModuleNotFoundError as exc:  # source checkout without bundled runtime
    raise unittest.SkipTest(f"bundled Bio runtime is required: {exc}")


class CompactSurfaceTests(unittest.TestCase):
    def test_public_surface_is_eight_tools(self):
        self.assertEqual(len(build_public_tools()), 8)
        self.assertEqual({tool.name for tool in build_public_tools()}, {
            "bio_search", "bio_data", "bio_annotation", "bio_variant",
            "bio_expression", "bio_analysis", "bio_jobs", "bio_artifacts",
        })

    def test_default_summary_is_bounded_and_ascii_ellipsis(self):
        summary = _summary("word " * 200)
        self.assertLessEqual(len(summary), 350)
        self.assertTrue(summary.endswith("..."))

    def test_server_startup_does_not_require_science_domains(self):
        import mcp_bio.server as server_module

        original = server_module.BioAggregate

        class ShouldNotLoad:
            def __init__(self):
                raise AssertionError("science domains were imported during initialize")

        server_module.BioAggregate = ShouldNotLoad
        try:
            server, aggregate = server_module.build_server()
            self.assertIsNotNone(server)
            self.assertIsInstance(aggregate, server_module.LazyBioAggregate)
        finally:
            server_module.BioAggregate = original

    def test_missing_science_dependency_is_reported_when_capability_is_used(self):
        import mcp_bio.server as server_module

        original = server_module.BioAggregate

        class MissingScience:
            def __init__(self):
                raise ModuleNotFoundError("No module named 'clinicaltrials_essie'", name="clinicaltrials_essie")

        server_module.BioAggregate = MissingScience
        try:
            aggregate = server_module.LazyBioAggregate()
            with self.assertRaisesRegex(RuntimeError, "clinicaltrials_essie"):
                aggregate.tool_names()
        finally:
            server_module.BioAggregate = original


if __name__ == "__main__":
    unittest.main()
