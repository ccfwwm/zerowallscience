"""Regression checks for installed-runtime staging used by release packing."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


class PackPythonEnvironmentTest(unittest.TestCase):
    def test_repository_resources_replace_staged_resources_once(self):
        with tempfile.TemporaryDirectory(prefix="zerowall-pack-test-") as tmp:
            root = Path(tmp)
            staging = root / "staging"
            repo = root / "repo"
            files = {
                staging / "bio-tools/python/python.exe": b"fixture",
                staging / "skills/example/SKILL.md": b"stale skill",
                staging / "python/requirements-base.txt": b"stale dependencies",
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
                self.assertEqual(packed.read("skills/example/SKILL.md"), b"current skill")
                self.assertEqual(packed.read("python/requirements-base.txt"), b"current dependencies")
                self.assertEqual(packed.read("bio-tools/python/python.exe"), b"fixture")
            receipt = json.loads(archive.with_suffix(".inventory.json").read_text())
            self.assertEqual(receipt["size"], archive.stat().st_size)


if __name__ == "__main__":
    unittest.main()
