import json
import subprocess
import sys
import unittest
from pathlib import Path


class KernelWorkerTests(unittest.TestCase):
    def test_linecache_keeps_only_recent_cells(self):
        worker = subprocess.Popen(
            [sys.executable, str(Path(__file__).with_name("kernel_worker.py"))],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        try:
            self.assertEqual(json.loads(worker.stdout.readline())["type"], "ready")

            for index in range(70):
                request = {
                    "type": "execute",
                    "id": str(index),
                    "code": (
                        "print(len([key for key in __import__('linecache').cache "
                        "if str(key).startswith('<zerowall-kernel:')]))"
                        + "\n#"
                        + ("x" * (256 * 1024))
                    ),
                }
                worker.stdin.write(json.dumps(request) + "\n")
                worker.stdin.flush()
                while True:
                    response = json.loads(worker.stdout.readline())
                    if response.get("type") == "result" and response.get("id") == str(index):
                        break

            self.assertLessEqual(int(response["stdout"].strip()), 32)

            oversized = {
                "type": "execute",
                "id": "oversized",
                "code": "x" * (1024 * 1024 + 1),
            }
            worker.stdin.write(json.dumps(oversized) + "\n")
            worker.stdin.flush()
            response = json.loads(worker.stdout.readline())
            self.assertEqual(response["id"], "oversized")
            self.assertIn("Code exceeds", response["error"])

            too_many_lines = {
                "type": "execute",
                "id": "too-many-lines",
                "code": "pass\r" * 20_001,
            }
            worker.stdin.write(json.dumps(too_many_lines) + "\n")
            worker.stdin.flush()
            response = json.loads(worker.stdout.readline())
            self.assertEqual(response["id"], "too-many-lines")
            self.assertIn("Code exceeds", response["error"])
            worker.stdin.close()
            self.assertEqual(worker.wait(timeout=5), 0)
        finally:
            if worker.poll() is None:
                worker.kill()
                worker.wait()
            if not worker.stdin.closed:
                worker.stdin.close()
            worker.stdout.close()


if __name__ == "__main__":
    unittest.main()
