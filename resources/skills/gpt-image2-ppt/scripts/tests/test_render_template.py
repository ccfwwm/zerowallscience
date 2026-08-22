import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from render_template import _collect_powerpoint_export_pages
from editable_pptx.renderer import render_editable_deck
from editable_pptx.scene import EditableScene, SceneElement
from PIL import Image


class PowerPointExportPageDiscoveryTests(unittest.TestCase):
    def test_accepts_localized_slide_filenames(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "幻灯片1.PNG").write_bytes(b"one")
            (root / "幻灯片2.PNG").write_bytes(b"two")

            pages = _collect_powerpoint_export_pages(root, 2)

            self.assertEqual(
                [(number, path.name) for number, path in pages or []],
                [(1, "幻灯片1.PNG"), (2, "幻灯片2.PNG")],
            )

    def test_rejects_missing_or_duplicate_page_numbers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Slide1.PNG").write_bytes(b"one")
            (root / "幻灯片1.PNG").write_bytes(b"duplicate")

            self.assertIsNone(_collect_powerpoint_export_pages(root, 2))

    def test_editable_text_uses_powerpoint_autofit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            clean_plate = root / "clean.png"
            Image.new("RGB", (160, 90), "#001122").save(clean_plate)
            scene = EditableScene(
                slide_number=1,
                canvas_width=160,
                canvas_height=90,
                clean_plate=clean_plate,
                elements=(
                    SceneElement(
                        id="title",
                        type="native_text",
                        bbox_px=(20, 15, 120, 40),
                        z_index=20,
                        content="A long editable title",
                        style={"font_size_pt": 50, "color": "#FFFFFF"},
                    ),
                ),
            )
            output = root / "deck.pptx"

            render_editable_deck([scene], output)

            with zipfile.ZipFile(output) as archive:
                xml = archive.read("ppt/slides/slide1.xml").decode("utf-8")
            self.assertIn("<a:normAutofit", xml)


if __name__ == "__main__":
    unittest.main()
