#!/usr/bin/env python3
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HELPERS = [
    ROOT / "runtime/skills/core/remote-compute/record_run.py",
    ROOT / "runtime/skills/core/modal-run/record_run.py",
]


def load_helper(path: Path):
    spec = importlib.util.spec_from_file_location("record_run_helper", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@contextlib.contextmanager
def argv(*args: str):
    old = sys.argv
    sys.argv = ["record_run.py", *args]
    try:
        yield
    finally:
        sys.argv = old


@contextlib.contextmanager
def cwd(path: Path):
    old = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)


class RecordRunGuardTest(unittest.TestCase):
    def test_rejects_reusing_output_path_with_different_content(self):
        for helper_path in HELPERS:
            with self.subTest(helper=helper_path):
                helper = load_helper(helper_path)
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    out = root / "results" / "demo" / "movie.mp4"
                    out.parent.mkdir(parents=True)
                    out.write_bytes(b"first render")

                    args = [
                        "--surface",
                        "ssh",
                        "--command",
                        "bash run.sh",
                        "--status",
                        "ok",
                        "--output",
                        "results/demo/movie.mp4",
                    ]

                    with cwd(root), argv(*args), contextlib.redirect_stderr(io.StringIO()):
                        helper.main()

                    out.write_bytes(b"second render")
                    with cwd(root), argv(*args), contextlib.redirect_stderr(io.StringIO()) as stderr:
                        with self.assertRaises(SystemExit) as raised:
                            helper.main()

                    self.assertNotEqual(raised.exception.code, 0)
                    self.assertIn("already recorded", stderr.getvalue())

                    store = root / ".zerowall" / "remote-runs.jsonl"
                    records = [json.loads(line) for line in store.read_text().splitlines()]
                    self.assertEqual(1, len(records))
                    self.assertEqual("results/demo/movie.mp4", records[0]["outputs"][0]["path"])


if __name__ == "__main__":
    unittest.main()
