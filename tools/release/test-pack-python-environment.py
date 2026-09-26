"""Regression checks for installed-runtime staging used by release packing."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


class PackPythonEnvironmentTest(unittest.TestCase):
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
                staging / "resources/python/requirements-base.txt": b"stale dependencies",
                staging / "bio-tools/run_server.py": b"mcp",
                staging / "ketcher-chemistry/server.js": b"ketcher",
                staging / "sci/dist/mcp.cjs": b"sci",
                repo / "resources/skills/example/SKILL.md": b"current skill",
                repo / "resources/python/requirements-base.txt": b"current dependencies",
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
