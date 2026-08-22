import base64
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from editable_pptx.provider import OpenAIImageProvider


class _Images:
    def __init__(self) -> None:
        self.calls = []

    def edit(self, **kwargs):
        self.calls.append(dict(kwargs))
        if len(self.calls) == 1:
            raise RuntimeError("400 Failed to read request body")
        return SimpleNamespace(
            data=[SimpleNamespace(b64_json=base64.b64encode(b"png").decode("ascii"))]
        )


class EditableImageProviderTests(unittest.TestCase):
    def test_image_edit_retries_with_minimal_request_shape(self) -> None:
        images = _Images()
        provider = OpenAIImageProvider(SimpleNamespace(images=images))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            output = root / "output.png"
            source.write_bytes(b"source")
            with patch("editable_pptx.provider.time.sleep"):
                provider.edit(source, None, "remove text", output)

            self.assertEqual(output.read_bytes(), b"png")
            self.assertTrue(images.calls[0]["stream"])
            self.assertNotIn("stream", images.calls[1])
            self.assertNotIn("partial_images", images.calls[1])


if __name__ == "__main__":
    unittest.main()
