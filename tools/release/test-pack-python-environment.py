"""Regression checks for installed-runtime staging used by release packing."""
import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch


class PackPythonEnvironmentTest(unittest.TestCase):
    def test_default_mcp_staging_is_scoped_to_the_artifact_build(self):
        script = Path(__file__).with_name("prepare-python-environment.py")
        spec = importlib.util.spec_from_file_location("prepare_python_environment", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix="zerowall-stage-test-") as tmp:
            root = Path(tmp)
            (root / "package.json").write_text(json.dumps({"version": "8.0.7"}), encoding="utf-8")
            pointer = root / "artifacts" / "stage" / "8.0.7" / "current.json"
            pointer.parent.mkdir(parents=True)
            pointer.write_text(json.dumps({"buildId": "build-from-current"}), encoding="utf-8")
            with patch.object(module, "ROOT", root), patch.dict(os.environ, {"ZEROWALL_BUILD_ID": "build-explicit"}):
                self.assertEqual(module.default_mcp_staging(), root / "artifacts/stage/8.0.7/build-explicit/mcp-environment-staging")
            with patch.object(module, "ROOT", root), patch.dict(os.environ, {}, clear=True):
                self.assertEqual(module.default_mcp_staging(), root / "artifacts/stage/8.0.7/build-from-current/mcp-environment-staging")

    def test_archive_contains_only_shared_python_bootstrap(self):
        with tempfile.TemporaryDirectory(prefix="zerowall-pack-test-") as tmp:
            root = Path(tmp)
            staging = root / "staging"
            repo = root / "repo"
            files = {
                staging / "Python/python.exe": b"fixture",
                staging / "Python/python312.zip": b"stdlib",
                staging / "Python/Lib/site-packages/pip/__init__.py": b"pip",
                staging / "skills/example/SKILL.md": b"stale skill",
                staging / "resources/extensions/python/requirements-base.txt": b"stale dependencies",
                staging / "bio-tools/run_server.py": b"mcp",
                staging / "ketcher-chemistry/server.js": b"ketcher",
                staging / "sci/dist/mcp.cjs": b"sci",
                repo / "resources/extensions/skills/example/SKILL.md": b"current skill",
                repo / "resources/extensions/python/requirements-base.txt": b"current dependencies",
            }
            for path, data in files.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            archive = root / "runtime.zip"
            subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("pack-python-environment.py")), str(staging), str(repo), str(archive)], check=True, capture_output=True)
            with zipfile.ZipFile(archive) as packed:
                names = packed.namelist()
                self.assertEqual(len(names), len({name.casefold() for name in names}))
                self.assertEqual(packed.read("Python/python.exe"), b"fixture")
                self.assertEqual(packed.read("Python/python312.zip"), b"stdlib")
                self.assertEqual(packed.read("Python/Lib/site-packages/pip/__init__.py"), b"pip")
                self.assertTrue(all(name == "Python/" or name.startswith("Python/") for name in names))
                for forbidden in ("skills/", "resources/", "bio-tools/", "ketcher-chemistry/", "sci/"):
                    self.assertFalse(any(name.startswith(forbidden) for name in names), forbidden)
            receipt = json.loads(archive.with_suffix(".inventory.json").read_text())
            self.assertEqual(receipt["size"], archive.stat().st_size)
            self.assertEqual(receipt["content"], "python-bootstrap-only")


if __name__ == "__main__":
    unittest.main()
