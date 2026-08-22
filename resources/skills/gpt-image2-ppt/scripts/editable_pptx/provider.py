"""OpenAI-compatible image generation and edit provider."""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path
from typing import Any


class OpenAIImageProvider:
    """Small adapter around the OpenAI Python SDK Images resource."""

    def __init__(self, client: Any, model: str = "gpt-image-2", quality: str = "high") -> None:
        self.client = client
        self.model = model
        self.quality = quality

    @classmethod
    def from_env(cls) -> "OpenAIImageProvider":
        base_url = os.environ.get("OPENAI_BASE_URL", "").strip()
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not base_url:
            raise ValueError("缺少 OPENAI_BASE_URL")
        if not api_key:
            raise ValueError("缺少 OPENAI_API_KEY")

        from openai import OpenAI

        # Clean-plate reconstruction is a second image-edit request after the
        # visual master. Give transient TLS/connection failures a small retry
        # budget here; the desktop bridge also retries across provider hosts.
        client = OpenAI(base_url=base_url, api_key=api_key, max_retries=3, timeout=600.0)
        return cls(
            client,
            os.environ.get("GPT_IMAGE_MODEL_NAME", "gpt-image-2"),
            os.environ.get("GPT_IMAGE_QUALITY", "high"),
        )

    @staticmethod
    def _decode_first_image(response: Any) -> bytes:
        data = getattr(response, "data", None) or []
        if not data:
            raise RuntimeError("图片接口没有返回图片数据")
        encoded = getattr(data[0], "b64_json", None)
        if not encoded:
            raise RuntimeError("图片接口未返回 b64_json")
        try:
            return base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as exc:
            raise RuntimeError("图片接口返回了无效的 b64_json") from exc

    def generate(self, prompt: str, output_path: Path | str, size: str = "1024x1024") -> Path:
        response = self.client.images.generate(
            model=self.model,
            prompt=prompt,
            size=size,
            quality=self.quality,
        )
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self._decode_first_image(response))
        return path

    def edit(
        self,
        image_path: Path | str,
        mask_path: Path | str | None,
        prompt: str,
        output_path: Path | str,
        size: str = "1024x1024",
    ) -> Path:
        with open(image_path, "rb") as image_file:
            encoded = None
            event_types = []
            last_error: Exception | None = None
            for attempt in range(3):
                try:
                    image_file.seek(0)
                    # Some OpenAI-compatible gateways reject the newer stream
                    # and output-format fields even though they expose the
                    # same /images/edits route. Start with the Skill's streaming
                    # request, then retry the minimal Images request shape.
                    variants = [
                        {"quality": self.quality, "stream": True, "partial_images": 1},
                        {"quality": self.quality},
                        {},
                    ]
                    options = variants[min(attempt, len(variants) - 1)]
                    request = {
                        "model": self.model,
                        "image": image_file,
                        "prompt": prompt,
                        "size": size,
                        **options,
                    }
                    if mask_path is not None:
                        with open(mask_path, "rb") as mask_file:
                            response = self.client.images.edit(mask=mask_file, **request)
                    else:
                        response = self.client.images.edit(**request)
                    data = getattr(response, "data", None)
                    if data:
                        encoded = getattr(data[0], "b64_json", None)
                    else:
                        for event in response:
                            event_type = getattr(event, "type", "")
                            event_types.append(event_type or type(event).__name__)
                            encoded = encoded or getattr(event, "b64_json", None)
                            event_data = getattr(event, "data", None)
                            if event_data:
                                encoded = encoded or getattr(event_data[0], "b64_json", None)
                    if encoded:
                        break
                except Exception as exc:  # provider transport errors are retriable
                    last_error = exc
                    if attempt < 2:
                        time.sleep(0.45 * (2**attempt))
                    else:
                        raise
            if not encoded:
                if last_error is not None:
                    raise RuntimeError(f"图片编辑请求失败: {last_error}") from last_error
                raise RuntimeError(
                    "图片编辑流没有返回完成事件; events="
                    + ",".join(event_types[:20])
                )
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_bytes(base64.b64decode(encoded, validate=True))
        except (ValueError, TypeError) as exc:
            raise RuntimeError("图片编辑流返回了无效的 b64_json") from exc
        return path
