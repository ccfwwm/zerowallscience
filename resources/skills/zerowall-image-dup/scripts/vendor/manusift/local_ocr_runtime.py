"""Process-wide EasyOCR reader shared by figure text detectors."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_reader: Any = None
_reader_key: str | None = None
_reader_error: str | None = None


def model_directory() -> Path:
    configured = os.environ.get("EASYOCR_MODULE_PATH")
    if configured:
        return Path(configured).expanduser()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "ZeroWallScience" / "models" / "easyocr"
    return Path.home() / ".EasyOCR"


def get_reader(languages: tuple[str, ...] = ("en",)) -> tuple[Any | None, str | None]:
    global _reader, _reader_key, _reader_error
    directory = model_directory()
    key = str(directory.resolve()) + "|" + ",".join(languages)
    if _reader is not None and _reader_key == key:
        return _reader, None
    if _reader_error is not None and _reader_key == key:
        return None, _reader_error
    try:
        import easyocr
        directory.mkdir(parents=True, exist_ok=True)
        _reader = easyocr.Reader(list(languages), gpu=False, verbose=False,
                                 model_storage_directory=str(directory), download_enabled=True)
        _reader_key, _reader_error = key, None
        return _reader, None
    except Exception as error:  # noqa: BLE001
        _reader_key, _reader_error = key, f"{type(error).__name__}: {error}"
        return None, _reader_error
