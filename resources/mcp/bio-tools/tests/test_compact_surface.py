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


if __name__ == "__main__":
    unittest.main()
