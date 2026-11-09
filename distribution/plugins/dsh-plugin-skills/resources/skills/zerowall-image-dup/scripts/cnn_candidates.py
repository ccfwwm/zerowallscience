"""imagededup MobileNetV3 candidate retrieval for figure crops.

The package is part of the required shared dependency manifest. The CLI keeps
CNN execution opt-in because its output is a candidate layer, while local
geometry and pixel evidence remain the only source of a formal finding.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Iterable


UPSTREAM = {"repository": "https://github.com/yunbolyu/duplicate_image_detection",
            "commit": "6f1cc50ad9e0097a80b1b7b6c12deff657b21809",
            "licenses": ["MIT", "Apache-2.0"],
            "adaptation": "fixed-grid fallback metadata plus external imagededup CNN candidate retrieval"}


def _model_files(cache: Path) -> list[dict[str, Any]]:
    result = []
    for path in sorted(cache.rglob("*.pth")) if cache.is_dir() else []:
        with path.open("rb") as stream:
            sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
        result.append({"name": path.name, "size": path.stat().st_size, "sha256": sha256,
                       "path": str(path)})
    return result


def recall(images: Iterable[dict[str, Any]], *, cache_dir: Path, deadline: float,
           cosine_threshold: float = 0.90, top_k: int = 5) -> dict[str, Any]:
    records = [row for row in images if Path(row.get("path") or "").is_file()]
    response: dict[str, Any] = {"enabled": True, "status": "ready", "model": "MobileNetV3",
                                "model_revision": None, "upstream": UPSTREAM, "candidates": [],
                                "encoded": 0, "needed": len(records), "failed": [], "weights": []}
    if len(records) < 2:
        return response
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ["TORCH_HOME"] = str(cache_dir.resolve())
    try:
        import numpy as np
        from PIL import Image
        from imagededup.methods import CNN
        from manusift.detectors.panel_segmentation import _segment_panels, _grid_panel_boxes
        import cv2

        encoder = CNN(verbose=False)
        embeddings = []
        tiles = []
        for image in records:
            if time.monotonic() >= deadline:
                response["status"] = "incomplete"
                break
            try:
                with Image.open(image["path"]) as decoded:
                    rgb = np.asarray(decoded.convert("RGB"))
                h, w = rgb.shape[:2]
                if w < 48 or h < 48:
                    continue
                gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
                boxes = _segment_panels(gray)
                split = "adaptive_contour"
                if len(boxes) < 2:
                    boxes = _grid_panel_boxes(gray)
                    split = "explicit_grid"
                if len(boxes) < 2:
                    boxes = [(0, 0, w, h)]
                    split = "whole_image"
                for panel_index, (x, y, bw, bh) in enumerate(boxes):
                    if bw < 48 or bh < 48:
                        continue
                    # The installed upstream CNN owns the feature representation.
                    # Crops and provenance stay under ZeroWall's report contract.
                    embedding = np.asarray(encoder.encode_image(image_array=rgb[y:y+bh, x:x+bw])).ravel()
                    norm = float(np.linalg.norm(embedding))
                    if norm < 1e-9:
                        continue
                    embeddings.append(embedding / norm)
                    tiles.append({**image, "bbox": [x, y, bw, bh], "panel_id": f"{image['image_id']}:{panel_index}",
                                  "split_source": split, "grid_row": panel_index // 2 if split == "explicit_grid" else None,
                                  "grid_column": panel_index % 2 if split == "explicit_grid" else None,
                                  "scale": 1.0})
                response["encoded"] += 1
            except Exception as error:  # noqa: BLE001
                response["failed"].append({"path": image["path"], "reason": f"{type(error).__name__}: {error}"})

        response["weights"] = _model_files(cache_dir)
        response["model_revision"] = response["weights"][0]["sha256"] if response["weights"] else None
        if len(embeddings) < 2:
            response["status"] = "incomplete" if response["encoded"] < len(records) else "ready"
            return response
        matrix = np.stack(embeddings)
        seen = set()
        for i in range(len(tiles)):
            similarity = matrix @ matrix[i]
            for j in np.argsort(-similarity)[:top_k + 1]:
                j = int(j)
                if i == j or float(similarity[j]) < cosine_threshold:
                    continue
                a, b = tiles[i], tiles[j]
                if a["image_id"] == b["image_id"]:
                    continue
                key = tuple(sorted((a["panel_id"], b["panel_id"])))
                if key in seen:
                    continue
                seen.add(key)
                pair_id = hashlib.sha256(json.dumps(key, ensure_ascii=False).encode()).hexdigest()[:24]
                response["candidates"].append({"pair_id": pair_id, "cosine": round(float(similarity[j]), 6),
                                               "model": "MobileNetV3", "model_revision": response["model_revision"],
                                               "image_a": a, "image_b": b,
                                               "bbox_a": a["bbox"], "bbox_b": b["bbox"],
                                               "status": "candidate_only"})
        response["candidates"].sort(key=lambda item: (-item["cosine"], item["pair_id"]))
        if response["encoded"] < len(records) or response["failed"]:
            response["status"] = "incomplete"
    except Exception as error:  # noqa: BLE001
        response["status"] = "failed"
        response["reason"] = f"{type(error).__name__}: {error}"
        response["weights"] = _model_files(cache_dir)
    return response


def verify_candidates(candidates: list[dict[str, Any]], *, cache_dir: Path,
                      deadline: float, trace: str) -> dict[str, Any]:
    """Create findings only for CNN pairs confirmed by the local verifier."""
    from PIL import Image
    import numpy as np
    import cv2
    from manusift.detectors.sift_copymove import match_two_arrays

    cache_dir.mkdir(parents=True, exist_ok=True)
    findings = []
    compared = 0
    for candidate in candidates:
        cache = cache_dir / (candidate["pair_id"] + ".json")
        result = None
        if cache.is_file():
            try:
                result = json.loads(cache.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                pass
        if result is None:
            if time.monotonic() >= deadline:
                break
            try:
                patches = []
                for side in ("image_a", "image_b"):
                    image = candidate[side]
                    x, y, w, h = image["bbox"]
                    with Image.open(image["path"]) as decoded:
                        patches.append(cv2.cvtColor(np.asarray(decoded.convert("RGB").crop((x, y, x+w, y+h))), cv2.COLOR_RGB2BGR))
                match = match_two_arrays(*patches)
                result = {"ok": match.ok, "flagged": match.flagged, "severity": match.severity,
                          "orientation": match.orientation, "scale": match.scale,
                          "inlier_count": match.inlier_count, "ransac_model": match.ransac_model,
                          "warp_ncc": match.warp_ncc, "warp_ssim": match.warp_ssim,
                          "overlap_ratio": match.overlap_ratio,
                          "ink_density_a": match.ink_density_a, "ink_density_b": match.ink_density_b,
                          "edge_density_a": match.edge_density_a, "edge_density_b": match.edge_density_b,
                          "bbox_a": match.bbox_a, "bbox_b": match.bbox_b}
            except Exception as error:  # noqa: BLE001
                result = {"ok": False, "flagged": False, "reason": f"{type(error).__name__}: {error}"}
            temporary = cache.with_suffix(".tmp")
            temporary.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            temporary.replace(cache)
        compared += 1
        if not result.get("flagged") or not result.get("bbox_a") or not result.get("bbox_b"):
            continue
        sources = []
        regions = {}
        for suffix in ("a", "b"):
            image = candidate["image_" + suffix]
            px, py, _, _ = image["bbox"]
            rx, ry, rw, rh = result["bbox_" + suffix]
            bbox = [px + rx, py + ry, rw, rh]
            sources.append({"file": image["source_file"], "page": image.get("page"),
                            "image": image["image_id"], "bbox": bbox,
                            "raster": image["path"]})
            regions[suffix + "x"], regions[suffix + "y"] = bbox[0] / image["width"], bbox[1] / image["height"]
            regions[suffix + "w"], regions[suffix + "h"] = bbox[2] / image["width"], bbox[3] / image["height"]
        raw = {"kind": "cnn_geometry_verified", "pair_id": candidate["pair_id"],
               "cosine_candidate": candidate["cosine"], "model": candidate["model"],
               "model_revision": candidate["model_revision"], "regions": [regions], **result}
        findings.append({"finding_id": candidate["pair_id"], "trace_id": trace,
                         "detector": "imagededup_cnn_geometry", "engine": "scientific-core",
                         "severity": result["severity"], "title": "CNN candidate with local geometric verification",
                         "location": " ↔ ".join(f"{source['file']} p{source.get('page') or '?'}" for source in sources),
                         "evidence": f"Candidate cosine={candidate['cosine']}; RANSAC inliers={result['inlier_count']}; warp-NCC={result['warp_ncc']}; SSIM={result['warp_ssim']}; orientation={result['orientation']}.",
                         "raw": raw, "sources": sources, "evidence_images": []})
    return {"compared": compared, "possible": len(candidates), "remaining": len(candidates) - compared,
            "verified": len(findings), "findings": findings,
            "status": "done" if compared == len(candidates) else "incomplete"}
