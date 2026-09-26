"""SIFT copy-move core + standalone pipeline detector (``image_sift_copymove``).

**Ownership (P3):** shared algorithm core for ``image_forensics`` (within-
image CMFD, cross-image match helpers) **and** the registered offline
detector ``SiftCopyMoveDetector``. Forensics is the suite owner; this
module owns the reusable SIFT/RANSAC implementation. Both may emit
findings under different detector names — do not remove either from
the pipeline without a double-count audit. See ``docs/DETECTOR_LAYERS.md``.

Primary algorithm (SIFT-CMFD style, literature defaults):

  1. Detect SIFT keypoints + 128-d descriptors (OpenCV SIFT_create).
  2. Self-match with FLANN / BFMatcher + Lowe ratio test.
  3. Drop matches closer than ``MIN_PIXEL_DISTANCE``.
  4. Cluster surviving matches by translation vector.
  5. **P0**: verify the largest cluster with RANSAC affine
     (``cv2.estimateAffinePartial2D``) — keep only clusters with
     enough inliers. Homography is tried as a secondary model.
  6. Emit a finding when ``largest_cluster >= MIN_CLUSTER_SIZE``
     and RANSAC inliers pass ``MIN_RANSAC_INLIERS``.

Also exposes reusable helpers used by ``image_forensics``:

  * ``analyze_copymove_path`` — single-image CMFD summary
  * ``match_two_images`` — cross-image local keypoint match
  * ``match_two_arrays`` — same for in-memory crops (panel-then-match)

The detector works on every image in ``doc.images``. Severity is
"high" for large RANSAC-confirmed clusters, "medium" otherwise.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from importlib.util import find_spec
from typing import Any

from PIL import Image

_HAS_NUMPY = find_spec("numpy") is not None
_HAS_CV2 = find_spec("cv2") is not None

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# ---------------------------------------------------------------------------
# Tunables (literature defaults; env overrides for pilot calibration)
# ---------------------------------------------------------------------------

LOWE_RATIO: float = float(os.environ.get("MANUSIFT_SIFT_LOWE_RATIO", "0.75"))
MIN_PIXEL_DISTANCE: int = int(os.environ.get("MANUSIFT_SIFT_MIN_PX_DIST", "32"))
MIN_CLUSTER_SIZE: int = int(os.environ.get("MANUSIFT_SIFT_MIN_CLUSTER", "8"))
HIGH_SEVERITY_THRESHOLD: int = int(
    os.environ.get("MANUSIFT_SIFT_HIGH_CLUSTER", "20")
)
# 2026-07 (negative_controls_v1): the "high" verdict band for
# confirmed copy-move evidence. Kept separate from the soft-flag
# threshold above (which stays at 20 for recall).
HIGH_INLIERS: int = int(
    os.environ.get("MANUSIFT_SIFT_HIGH_INLIERS", "40")
)
# P0: RANSAC confirmation — a pure translation cluster without a
# coherent affine/homography is demoted or dropped.
MIN_RANSAC_INLIERS: int = int(os.environ.get("MANUSIFT_SIFT_MIN_INLIERS", "6"))
RANSAC_REPROJ_THRESH: float = float(
    os.environ.get("MANUSIFT_SIFT_RANSAC_THRESH", "5.0")
)
# Cross-image pair match
CROSS_MIN_MATCHES: int = int(os.environ.get("MANUSIFT_SIFT_CROSS_MIN", "12"))
CROSS_MIN_INLIERS: int = int(os.environ.get("MANUSIFT_SIFT_CROSS_INLIERS", "8"))
# 2026-07 (negative_controls_v1): cross-image inlier counts on
# legitimate papers and on fraud papers overlap heavily below
# ~40 (same-style axes/templates legitimately share local
# features; both distributions span 8-80). "high" is therefore
# reserved for very strong matches; 16-39 stays medium so the
# detector still fires (recall) without crying wolf.
CROSS_HIGH_INLIERS: int = int(
    os.environ.get("MANUSIFT_SIFT_CROSS_HIGH_INLIERS", "40")
)

# Cross-image verification deliberately tests a small, explicit set of
# orientations.  A mirrored panel is a common failure mode for plain SIFT;
# keeping the orientation in the result also makes the evidence auditable.
ORIENTATIONS: tuple[str, ...] = ("id", "flipH", "flipV", "rot180")
MATCH_SCALES: tuple[float, ...] = (0.7, 1.0, 1.4)
WARP_NCC_HIGH: float = float(os.environ.get("MANUSIFT_WARP_NCC_HIGH", "0.85"))
WARP_NCC_MIN: float = float(os.environ.get("MANUSIFT_WARP_NCC_MIN", "0.55"))
MIN_OVERLAP_RATIO: float = float(os.environ.get("MANUSIFT_MIN_OVERLAP_RATIO", "0.03"))
MIN_TEXTURE_DENSITY: float = float(os.environ.get("MANUSIFT_MIN_TEXTURE_DENSITY", "0.002"))
# Cap descriptors for speed on huge figures
MAX_KEYPOINTS: int = int(os.environ.get("MANUSIFT_SIFT_MAX_KP", "1000"))
# Feature extraction is performed on a bounded raster.  The evidence bbox is
# mapped back to the caller's original raster before it is returned.  This is
# deliberately an algorithmic bound rather than a pair-count shortcut: every
# requested orientation and scale still runs through the same geometric and
# pixel gates.
MAX_MATCH_SIDE: int = int(os.environ.get("MANUSIFT_MATCH_MAX_SIDE", "768"))
MATCH_CANDIDATE_SIDE: int = int(os.environ.get("MANUSIFT_MATCH_CANDIDATE_SIDE", "160"))
MATCH_CANDIDATE_GRID: int = int(os.environ.get("MANUSIFT_MATCH_CANDIDATE_GRID", "4"))
# Exhaustive local geometry is the default. An explicit positive value may be
# supplied only as an emergency throughput budget; it is reported in coverage
# and must never be mistaken for a complete pair comparison.
MATCH_CANDIDATE_THRESHOLD: int = int(os.environ.get("MANUSIFT_MATCH_CANDIDATE_THRESHOLD", "0"))
CANDIDATE_MAX_SIDE: int = int(os.environ.get("MANUSIFT_CANDIDATE_MAX_SIDE", "768"))
CANDIDATE_MAX_FEATURES: int = int(os.environ.get("MANUSIFT_CANDIDATE_MAX_FEATURES", "500"))
# Prefer SIFT; fall back to ORB when SIFT unavailable
FEATURE_BACKEND: str = os.environ.get("MANUSIFT_SIFT_BACKEND", "auto")
_UNSET_FEATURES = object()


@dataclass
class CopyMoveAnalysis:
    """Structured single-image CMFD result."""

    ok: bool
    reason: str = ""
    keypoint_count: int = 0
    match_count: int = 0
    largest_cluster: int = 0
    ransac_inliers: int = 0
    ransac_model: str = ""  # "affine" | "homography" | ""
    width: int = 0
    height: int = 0
    backend: str = ""  # "sift" | "orb"
    flagged: bool = False
    severity: str = "low"
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class CrossMatchAnalysis:
    """Cross-image (or crop-pair) keypoint match result."""

    ok: bool
    reason: str = ""
    match_count: int = 0
    inlier_count: int = 0
    ransac_model: str = ""
    backend: str = ""
    flagged: bool = False
    severity: str = "low"
    extra: dict[str, Any] = field(default_factory=dict)
    orientation: str = "id"
    scale: float = 1.0
    warp_ncc: float | None = None
    warp_ssim: float | None = None
    overlap_ratio: float | None = None
    ink_density_a: float | None = None
    ink_density_b: float | None = None
    edge_density_a: float | None = None
    edge_density_b: float | None = None
    bbox_a: tuple[int, int, int, int] | None = None
    bbox_b: tuple[int, int, int, int] | None = None
    inlier_residual_px: float | None = None


def _load_numpy() -> Any | None:
    if not _HAS_NUMPY:
        return None
    import numpy as np

    return np


def _load_cv2() -> Any | None:
    if not _HAS_CV2:
        return None
    import cv2  # type: ignore

    return cv2


def available() -> bool:
    """True when OpenCV + numpy are importable."""
    return bool(_HAS_CV2 and _HAS_NUMPY)


def _read_image(path: str) -> Any | None:
    """Read an image as a BGR numpy array."""
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None:
        return None
    try:
        # Decode bytes rather than passing a Windows Unicode path to OpenCV.
        arr = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception:  # noqa: BLE001
        arr = None
    if arr is None:
        try:
            pil = Image.open(path).convert("RGB")
            arr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        except Exception:  # noqa: BLE001
            return None
    return arr


def _create_detector(cv2: Any) -> tuple[Any, str] | None:
    """Create SIFT (preferred) or ORB feature detector."""
    prefer = (FEATURE_BACKEND or "auto").strip().lower()
    if prefer in {"auto", "sift"}:
        try:
            return cv2.SIFT_create(nfeatures=MAX_KEYPOINTS), "sift"
        except Exception:  # noqa: BLE001
            if prefer == "sift":
                return None
    if prefer in {"auto", "orb"}:
        try:
            return cv2.ORB_create(nfeatures=MAX_KEYPOINTS), "orb"
        except Exception:  # noqa: BLE001
            return None
    return None


def _detect_features(img_bgr: Any) -> tuple[Any, Any, str] | None:
    """Detect keypoints + descriptors. Returns ``(kp, des, backend)``."""
    cv2 = _load_cv2()
    if cv2 is None:
        return None
    created = _create_detector(cv2)
    if created is None:
        return None
    det, backend = created
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    kp, des = det.detectAndCompute(gray, None)
    if des is None or len(kp) < 2:
        return None
    # Cap for speed / memory
    if len(kp) > MAX_KEYPOINTS:
        # Keep strongest by response
        order = sorted(
            range(len(kp)),
            key=lambda i: float(getattr(kp[i], "response", 0.0)),
            reverse=True,
        )[:MAX_KEYPOINTS]
        kp = [kp[i] for i in order]
        des = des[order]
    return kp, des, backend


def prepare_features(img_bgr: Any) -> tuple[Any, Any, str] | None:
    """Prepare one image's descriptors for reuse across the pair queue.

    A document comparison reuses every image hundreds of times.  Exposing the
    immutable descriptor tuple lets the caller perform one detection per image
    instead of one detection per image pair.
    """
    return _detect_features(img_bgr)


def _detect_sift(img_bgr: Any) -> tuple[Any, Any] | None:
    """Backward-compatible: SIFT/ORB keypoints + descriptors only."""
    out = _detect_features(img_bgr)
    if out is None:
        return None
    return out[0], out[1]


def _knn_match(
    des1: Any,
    des2: Any,
    backend: str,
    *,
    self_match: bool = False,
) -> list[tuple[int, int, float]]:
    """Lowe-ratio knn matches. For self-match, des1 is des2."""
    cv2 = _load_cv2()
    if cv2 is None:
        return []
    if len(des1) < 2 or len(des2) < 2:
        return []

    # ORB uses Hamming; SIFT uses L2
    if backend == "orb":
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    else:
        # FLANN for SIFT float descriptors
        try:
            flann = cv2.FlannBasedMatcher(
                dict(algorithm=1, trees=4), dict(checks=64)
            )
            pairs = flann.knnMatch(des1, des2, k=2)
        except Exception:  # noqa: BLE001
            matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
            try:
                pairs = matcher.knnMatch(des1, des2, k=2)
            except Exception:  # noqa: BLE001
                return []
        else:
            return _filter_lowe(pairs, self_match=self_match)

    try:
        pairs = matcher.knnMatch(des1, des2, k=2)
    except Exception:  # noqa: BLE001
        return []
    return _filter_lowe(pairs, self_match=self_match)


def _filter_lowe(
    pairs: Any,
    *,
    self_match: bool,
) -> list[tuple[int, int, float]]:
    out: list[tuple[int, int, float]] = []
    ratio = LOWE_RATIO
    for pair in pairs:
        if pair is None or len(pair) < 2:
            continue
        m, n = pair[0], pair[1]
        if self_match and m.queryIdx == m.trainIdx:
            continue
        if n.distance <= 0:
            continue
        if m.distance >= n.distance * ratio:
            continue
        out.append((m.queryIdx, m.trainIdx, float(m.distance)))
    out.sort(key=lambda x: x[2])
    return out


def _match_self(
    descriptors: Any,
    backend: str = "sift",
) -> list[tuple[int, int, float]]:
    """Self-match every keypoint against the same set."""
    return _knn_match(descriptors, descriptors, backend, self_match=True)


def _cluster_by_translation(
    keypoints: Any,
    matches: list[tuple[int, int, float]],
    img_w: int = 0,
    img_h: int = 0,
) -> tuple[int, list[tuple[int, int]]]:
    """Greedy cluster by translation; return (best_size, best_pairs).

    ``best_pairs`` is list of ``(queryIdx, trainIdx)`` in the largest
    cluster (for RANSAC).
    """
    if not matches:
        return 0, []
    useful: list[tuple[float, float, int, int]] = []
    for i, j, _ in matches:
        p1 = keypoints[i].pt
        p2 = keypoints[j].pt
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        if (dx * dx + dy * dy) ** 0.5 < MIN_PIXEL_DISTANCE:
            continue
        useful.append((dx, dy, i, j))
    if not useful:
        return 0, []

    assigned = [False] * len(useful)
    biggest = 0
    best_pairs: list[tuple[int, int]] = []
    for c_idx, (cx, cy, _, _) in enumerate(useful):
        if assigned[c_idx]:
            continue
        size = 0
        pairs: list[tuple[int, int]] = []
        for j_idx in range(c_idx, len(useful)):
            if assigned[j_idx]:
                continue
            jx, jy, qi, ti = useful[j_idx]
            if ((jx - cx) ** 2 + (jy - cy) ** 2) ** 0.5 < MIN_PIXEL_DISTANCE:
                assigned[j_idx] = True
                size += 1
                pairs.append((qi, ti))
        if size > biggest:
            biggest = size
            best_pairs = pairs
        if biggest >= MIN_CLUSTER_SIZE * 3:
            # early exit — already high signal
            return biggest, best_pairs
    return biggest, best_pairs


def _ransac_verify(
    keypoints: Any,
    pairs: list[tuple[int, int]],
    *,
    keypoints_b: Any | None = None,
) -> tuple[int, str]:
    """RANSAC affine (then homography) on keypoint pairs.

    For self copy-move, ``keypoints_b`` is None (same set).
    Returns ``(inlier_count, model_name)``.
    """
    inliers, model, _matrix, _mask = _estimate_ransac(
        keypoints, pairs, keypoints_b=keypoints_b
    )
    return inliers, model


def _feature_box(keypoints: Any, point_indices: list[int], width: int, height: int) -> tuple[int, int, int, int] | None:
    """A padded, clipped crop around one inlier cluster."""
    if not point_indices:
        return None
    points = [keypoints[index].pt for index in point_indices]
    x0, x1 = min(p[0] for p in points), max(p[0] for p in points)
    y0, y1 = min(p[1] for p in points), max(p[1] for p in points)
    span = max(x1 - x0, y1 - y0, 48.0)
    pad = max(16, int(span * 0.18))
    left, top = max(0, int(x0) - pad), max(0, int(y0) - pad)
    right, bottom = min(width, int(x1) + pad + 1), min(height, int(y1) + pad + 1)
    if right - left < 48 or bottom - top < 48:
        return None
    return left, top, right - left, bottom - top


def _estimate_ransac(
    keypoints: Any,
    pairs: list[tuple[int, int]],
    *,
    keypoints_b: Any | None = None,
) -> tuple[int, str, Any | None, Any | None]:
    """Return inliers, model, transform and the RANSAC mask."""
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None or len(pairs) < MIN_RANSAC_INLIERS:
        return 0, "", None, None

    kpb = keypoints if keypoints_b is None else keypoints_b
    src = np.float32([keypoints[i].pt for i, _ in pairs]).reshape(-1, 1, 2)
    dst = np.float32([kpb[j].pt for _, j in pairs]).reshape(-1, 1, 2)

    try:
        matrix, mask = cv2.estimateAffinePartial2D(
            src, dst, method=cv2.RANSAC,
            ransacReprojThreshold=RANSAC_REPROJ_THRESH,
            maxIters=2000, confidence=0.99,
        )
        if mask is not None:
            inliers = int(mask.ravel().sum())
            if inliers >= MIN_RANSAC_INLIERS:
                return inliers, "affine", matrix, mask
    except Exception:  # noqa: BLE001
        pass

    if len(pairs) >= 4:
        try:
            matrix, mask = cv2.findHomography(
                src, dst, method=cv2.RANSAC,
                ransacReprojThreshold=RANSAC_REPROJ_THRESH,
                maxIters=2000, confidence=0.99,
            )
            if mask is not None:
                inliers = int(mask.ravel().sum())
                if inliers >= MIN_RANSAC_INLIERS:
                    return inliers, "homography", matrix, mask
        except Exception:  # noqa: BLE001
            pass
    return 0, "", None, None


def _orient_array(array: Any, orientation: str) -> Any:
    """Apply one of the stable orientation labels to a BGR array."""
    cv2 = _load_cv2()
    if cv2 is None or orientation == "id":
        return array
    if orientation == "flipH":
        return cv2.flip(array, 1)
    if orientation == "flipV":
        return cv2.flip(array, 0)
    if orientation == "rot180":
        return cv2.rotate(array, cv2.ROTATE_180)
    raise ValueError(f"unsupported orientation: {orientation}")


def _bounded_raster(array: Any) -> tuple[Any, float]:
    """Return a feature raster and its scale relative to the input raster."""
    cv2 = _load_cv2()
    if cv2 is None or array is None or MAX_MATCH_SIDE <= 0:
        return array, 1.0
    height, width = array.shape[:2]
    longest = max(height, width)
    if longest <= MAX_MATCH_SIDE:
        return array, 1.0
    factor = float(MAX_MATCH_SIDE) / float(longest)
    resized = cv2.resize(
        array,
        (max(48, int(round(width * factor))), max(48, int(round(height * factor)))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, factor


def _restore_bbox(bbox: tuple[int, int, int, int] | None, factor: float,
                  width: int, height: int) -> tuple[int, int, int, int] | None:
    """Map a bbox from a bounded raster back to its original raster."""
    if bbox is None or factor <= 0:
        return bbox
    x, y, w, h = bbox
    left = max(0, min(width, int(round(x / factor))))
    top = max(0, min(height, int(round(y / factor))))
    right = max(left, min(width, int(round((x + w) / factor))))
    bottom = max(top, min(height, int(round((y + h) / factor))))
    return left, top, right - left, bottom - top


def prepare_candidate_signature(array: Any) -> Any | None:
    """Build compact ORB descriptors for fast local candidate retrieval.

    This representation is only a scheduling hint. It is never a finding and
    never substitutes for SIFT/ORB geometry, RANSAC, or pixel verification.
    The image is bounded and four orientations are indexed to retain mirrored
    and rotated local copies.
    """
    cv2 = _load_cv2()
    if cv2 is None or array is None:
        return None
    try:
        height, width = array.shape[:2]
        longest = max(height, width)
        if longest > CANDIDATE_MAX_SIDE:
            factor = CANDIDATE_MAX_SIDE / float(longest)
            array = cv2.resize(array, (max(48, int(width * factor)), max(48, int(height * factor))),
                               interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(array, cv2.COLOR_BGR2GRAY)
        detector = cv2.ORB_create(nfeatures=CANDIDATE_MAX_FEATURES, scaleFactor=1.2,
                                  nlevels=8, edgeThreshold=15, fastThreshold=10)
        variants = {}
        for orientation in ORIENTATIONS:
            _keypoints, descriptors = detector.detectAndCompute(_orient_array(gray, orientation), None)
            variants[orientation] = descriptors
        return {"variants": variants}
    except Exception:  # noqa: BLE001
        return None


def candidate_similarity(signature_a: Any, signature_b: Any) -> float:
    """Return strongest Lowe-filtered ORB match count for pair scheduling."""
    cv2 = _load_cv2()
    if cv2 is None or signature_a is None or signature_b is None:
        return 0.0
    try:
        descriptors_a = signature_a.get("variants", {}).get("id")
        if descriptors_a is None or len(descriptors_a) < 2:
            return 0
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        best = 0
        for descriptors_b in signature_b.get("variants", {}).values():
            if descriptors_b is None or len(descriptors_b) < 2:
                continue
            pairs = matcher.knnMatch(descriptors_a, descriptors_b, k=2)
            score = sum(1 for pair in pairs if len(pair) >= 2 and pair[0].distance < 0.75 * pair[1].distance)
            best = max(best, score)
        return best
    except Exception:  # noqa: BLE001
        return 0.0


def prepare_match_variants(array: Any) -> tuple[Any | None, dict[tuple[str, float], Any]]:
    """Prepare reusable descriptors for one image.

    The four orientation descriptors are detected once.  Scale passes reuse
    those descriptors because SIFT/ORB are scale-aware; their keypoint
    coordinates are scaled only for the RANSAC geometry.  This retains all
    twelve orientation/scale comparisons while removing repeated detector
    work from the O(n²) pair queue.
    """
    cv2 = _load_cv2()
    if cv2 is None or array is None:
        return None, {}
    bounded, _factor = _bounded_raster(array)
    variants: dict[tuple[str, float], Any] = {}
    base = _detect_features(bounded)
    if base is None:
        return None, variants
    # Keep the caller-facing base descriptor separate from transformed B
    # variants.  A pair's A side is always the untransformed raster.
    for orientation in ORIENTATIONS:
        if orientation == "id":
            detected = base
        else:
            transformed = _orient_array(bounded, orientation)
            detected = _detect_features(transformed)
        if detected is None:
            for scale in MATCH_SCALES:
                variants[(orientation, scale)] = None
            continue
        for scale in MATCH_SCALES:
            if scale == 1.0:
                variants[(orientation, scale)] = detected
                continue
            scaled = cv2.resize(
                _orient_array(bounded, orientation), None, fx=scale, fy=scale,
                interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC,
            )
            variants[(orientation, scale)] = _detect_features(scaled)
    return base, variants


def _source_bbox(bbox: tuple[int, int, int, int] | None, orientation: str,
                 scale: float, original_width: int, original_height: int) -> tuple[int, int, int, int] | None:
    """Map a bbox on the transformed image back to the source raster."""
    if bbox is None:
        return None
    x, y, width, height = bbox
    x0, y0 = x / scale, y / scale
    x1, y1 = (x + width) / scale, (y + height) / scale
    if orientation in {"flipH", "rot180"}:
        x0, x1 = original_width - x1, original_width - x0
    if orientation in {"flipV", "rot180"}:
        y0, y1 = original_height - y1, original_height - y0
    left = max(0, min(original_width, int(x0)))
    top = max(0, min(original_height, int(y0)))
    right = max(left, min(original_width, int(x1 + 0.999)))
    bottom = max(top, min(original_height, int(y1 + 0.999)))
    return left, top, right - left, bottom - top


def _warp_metrics(
    source_a: Any,
    transformed_b: Any,
    matrix: Any,
    model: str,
    roi_a: tuple[int, int, int, int] | None = None,
) -> dict[str, float]:
    """Measure pixel agreement after mapping A coordinates into B."""
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None or matrix is None:
        return {}
    height, width = source_a.shape[:2]
    try:
        if model == "affine":
            forward = np.vstack([matrix, [0.0, 0.0, 1.0]])
        else:
            forward = matrix
        inverse = np.linalg.inv(forward)
        warped = cv2.warpPerspective(transformed_b, inverse, (width, height))
        mask = cv2.warpPerspective(np.full(transformed_b.shape[:2], 255, np.uint8), inverse, (width, height))
        gray_a = cv2.cvtColor(source_a, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        valid = mask > 0
        if roi_a is not None:
            x, y, roi_width, roi_height = roi_a
            roi = np.zeros((height, width), dtype=bool)
            roi[max(0, y):min(height, y + roi_height), max(0, x):min(width, x + roi_width)] = True
            valid &= roi
        if int(valid.sum()) < 64:
            return {}
        a = gray_a[valid].astype(np.float32)
        b = gray_b[valid].astype(np.float32)
        a_mean = float(a.mean())
        b_mean = float(b.mean())
        a_std = float(a.std())
        b_std = float(b.std())
        ncc = float(((a - a_mean) * (b - b_mean)).mean() / (a_std * b_std + 1e-6))
        # Global SSIM on the same geometric overlap used for NCC. Keeping
        # the mask identical prevents the surrounding blank canvas from
        # inflating either similarity score.
        c1 = (0.01 * 255.0) ** 2
        c2 = (0.03 * 255.0) ** 2
        covariance = float(((a - a_mean) * (b - b_mean)).mean())
        ssim = ((2 * a_mean * b_mean + c1) * (2 * covariance + c2)) / (
            (a_mean * a_mean + b_mean * b_mean + c1)
            * (a_std * a_std + b_std * b_std + c2)
            + 1e-6
        )
        ink_a = float((a < 245).mean())
        ink_b = float((b < 245).mean())
        edge_a = cv2.Canny(gray_a, 50, 150)
        edge_b = cv2.Canny(gray_b, 50, 150)
        edge_a = float((edge_a[valid] > 0).mean())
        edge_b = float((edge_b[valid] > 0).mean())
        ys, xs = np.nonzero(valid)
        bbox_a = (int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
        corners = np.asarray([
            [bbox_a[0], bbox_a[1], 1.0],
            [bbox_a[0] + bbox_a[2] - 1, bbox_a[1], 1.0],
            [bbox_a[0], bbox_a[1] + bbox_a[3] - 1, 1.0],
            [bbox_a[0] + bbox_a[2] - 1, bbox_a[1] + bbox_a[3] - 1, 1.0],
        ], dtype=np.float64)
        mapped = (forward @ corners.T).T
        mapped = mapped[:, :2] / np.maximum(np.abs(mapped[:, 2:3]), 1e-9)
        bx0 = max(0, int(np.floor(mapped[:, 0].min())))
        by0 = max(0, int(np.floor(mapped[:, 1].min())))
        bx1 = min(transformed_b.shape[1], int(np.ceil(mapped[:, 0].max())) + 1)
        by1 = min(transformed_b.shape[0], int(np.ceil(mapped[:, 1].max())) + 1)
        bbox_b = (bx0, by0, max(0, bx1 - bx0), max(0, by1 - by0))
        return {
            "warp_ncc": max(-1.0, min(1.0, ncc)),
            "warp_ssim": max(-1.0, min(1.0, float(ssim))),
            "overlap_ratio": float(valid.mean()),
            "ink_density_a": ink_a,
            "ink_density_b": ink_b,
            "edge_density_a": edge_a,
            "edge_density_b": edge_b,
            "bbox_a": bbox_a,
            "bbox_b": bbox_b,
        }
    except Exception:  # noqa: BLE001
        return {}


def analyze_copymove_array(img_bgr: Any) -> CopyMoveAnalysis:
    """Run SIFT-CMFD + RANSAC on a BGR numpy array."""
    if img_bgr is None:
        return CopyMoveAnalysis(ok=False, reason="null_image")
    if not available():
        return CopyMoveAnalysis(ok=False, reason="opencv_unavailable")

    h, w = img_bgr.shape[:2]
    if h < 64 or w < 64:
        return CopyMoveAnalysis(
            ok=True, reason="too_small", width=w, height=h
        )

    detected = _detect_features(img_bgr)
    if detected is None:
        return CopyMoveAnalysis(
            ok=True, reason="no_keypoints", width=w, height=h
        )
    keypoints, descriptors, backend = detected
    if len(keypoints) < MIN_CLUSTER_SIZE * 2:
        return CopyMoveAnalysis(
            ok=True,
            reason="few_keypoints",
            keypoint_count=len(keypoints),
            width=w,
            height=h,
            backend=backend,
        )

    matches = _match_self(descriptors, backend=backend)
    cluster, best_pairs = _cluster_by_translation(keypoints, matches, w, h)
    inliers, model, matrix, mask = _estimate_ransac(keypoints, best_pairs)

    # Flag when cluster large AND RANSAC confirms (or cluster very large
    # even if RANSAC soft-fails — pure translation clones sometimes
    # under-fit affine when noise is high).
    confirmed = inliers >= MIN_RANSAC_INLIERS
    soft_ok = cluster >= HIGH_SEVERITY_THRESHOLD and cluster >= MIN_CLUSTER_SIZE
    flagged = cluster >= MIN_CLUSTER_SIZE and (confirmed or soft_ok)

    severity = "medium" if flagged else "low"
    region_evidence: dict[str, Any] = {}
    if flagged and confirmed and matrix is not None and mask is not None:
        np = _load_numpy()
        inlier_mask = mask.ravel().astype(bool)
        source_points = [best_pairs[i][0] for i, keep in enumerate(inlier_mask) if keep]
        target_points = [best_pairs[i][1] for i, keep in enumerate(inlier_mask) if keep]
        box_a = _feature_box(keypoints, source_points, w, h)
        box_b = _feature_box(keypoints, target_points, w, h)
        if box_a and box_b:
            ax, ay, aw, ah = box_a
            bx, by, bw, bh = box_b
            # Re-run the same direction/scale/geometric and pixel gates on
            # the actual matched regions. A large self-match cluster alone
            # can no longer produce a high-severity result.
            local = match_two_arrays(img_bgr[ay:ay + ah, ax:ax + aw], img_bgr[by:by + bh, bx:bx + bw])
            region_evidence = {
                "bbox_a": list(box_a), "bbox_b": list(box_b),
                "warp_ncc": local.warp_ncc, "warp_ssim": local.warp_ssim,
                "overlap_ratio": local.overlap_ratio, "orientation": local.orientation,
                "scale": local.scale, "inlier_residual_px": local.inlier_residual_px,
                "ink_density_a": local.ink_density_a, "ink_density_b": local.ink_density_b,
                "edge_density_a": local.edge_density_a, "edge_density_b": local.edge_density_b,
                "pixel_verified": bool(local.ok and local.flagged and local.severity == "high"),
            }
            if (inliers >= HIGH_INLIERS or cluster >= HIGH_INLIERS) and region_evidence["pixel_verified"]:
                severity = "high"

    return CopyMoveAnalysis(
        ok=True,
        reason="ok" if flagged else "below_threshold",
        keypoint_count=len(keypoints),
        match_count=len(matches),
        largest_cluster=cluster,
        ransac_inliers=inliers,
        ransac_model=model,
        width=w,
        height=h,
        backend=backend,
        flagged=flagged,
        severity=severity,
        extra={
            "lowe_ratio": LOWE_RATIO,
            "min_cluster": MIN_CLUSTER_SIZE,
            "min_inliers": MIN_RANSAC_INLIERS,
            "cluster_pairs": len(best_pairs),
            **region_evidence,
        },
    )


def analyze_copymove_path(path: str) -> CopyMoveAnalysis:
    """Run CMFD on an image file path."""
    arr = _read_image(path)
    if arr is None:
        return CopyMoveAnalysis(ok=False, reason="read_failed")
    return analyze_copymove_array(arr)


def _match_two_arrays_once(
    img_a_bgr: Any,
    img_b_bgr: Any,
    *,
    orientation: str = "id",
    scale: float = 1.0,
    detected_a: Any = _UNSET_FEATURES,
    detected_b: Any = _UNSET_FEATURES,
) -> CrossMatchAnalysis:
    """Cross-match two BGR arrays with SIFT/ORB + RANSAC."""
    if img_a_bgr is None or img_b_bgr is None:
        return CrossMatchAnalysis(ok=False, reason="null_image")
    if not available():
        return CrossMatchAnalysis(ok=False, reason="opencv_unavailable")

    cv2 = _load_cv2()
    ha, wa = img_a_bgr.shape[:2]
    transformed_b = _orient_array(img_b_bgr, orientation)
    if scale != 1.0:
        transformed_b = cv2.resize(transformed_b, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    hb, wb = transformed_b.shape[:2]
    if min(ha, wa, hb, wb) < 48:
        return CrossMatchAnalysis(ok=True, reason="too_small")

    # Feature extraction dominates a local comparison.  The caller can pass
    # descriptors that were already computed for the untransformed A image or
    # the current B transform; this keeps the twelve orientation/scale passes
    # equivalent while avoiding twelve redundant A detections per pair.
    da = _detect_features(img_a_bgr) if detected_a is _UNSET_FEATURES else detected_a
    db = _detect_features(transformed_b) if detected_b is _UNSET_FEATURES else detected_b
    if da is None or db is None:
        return CrossMatchAnalysis(ok=True, reason="no_keypoints")
    kp_a, des_a, backend_a = da
    kp_b, des_b, backend_b = db
    backend = backend_a if backend_a == backend_b else backend_a

    # Descriptor dtype/backend mismatch (SIFT float vs ORB uint8)
    if backend_a != backend_b:
        return CrossMatchAnalysis(
            ok=True, reason="backend_mismatch", backend=backend_a
        )

    matches = _knn_match(des_a, des_b, backend, self_match=False)
    if len(matches) < CROSS_MIN_MATCHES:
        return CrossMatchAnalysis(
            ok=True,
            reason="few_matches",
            match_count=len(matches),
            backend=backend,
        )

    pairs = [(i, j) for i, j, _ in matches[: max(CROSS_MIN_MATCHES * 4, 80)]]
    inliers, model, matrix, mask = _estimate_ransac(kp_a, pairs, keypoints_b=kp_b)
    roi_a = None
    if mask is not None and inliers >= CROSS_MIN_INLIERS:
        np = _load_numpy()
        points = np.asarray([kp_a[i].pt for i, _ in pairs], dtype=np.float64)[mask.ravel().astype(bool)]
        if len(points):
            margin = max(8, int(min(wa, ha) * 0.015))
            x0 = max(0, int(points[:, 0].min()) - margin)
            y0 = max(0, int(points[:, 1].min()) - margin)
            x1 = min(wa, int(points[:, 0].max()) + margin + 1)
            y1 = min(ha, int(points[:, 1].max()) + margin + 1)
            roi_a = (x0, y0, x1 - x0, y1 - y0)
    metrics = _warp_metrics(img_a_bgr, transformed_b, matrix, model, roi_a)
    texture_ok = (
        metrics.get("ink_density_a", 0.0) >= MIN_TEXTURE_DENSITY
        and metrics.get("ink_density_b", 0.0) >= MIN_TEXTURE_DENSITY
    )
    metric_ok = (
        metrics.get("warp_ncc", -1.0) >= WARP_NCC_MIN
        and metrics.get("warp_ssim", -1.0) >= WARP_NCC_MIN
        and metrics.get("overlap_ratio", 0.0) >= MIN_OVERLAP_RATIO
        and texture_ok
        and metrics.get("edge_density_a", 0.0) >= MIN_TEXTURE_DENSITY / 2
        and metrics.get("edge_density_b", 0.0) >= MIN_TEXTURE_DENSITY / 2
        and bool(model)
        and bool(metrics.get("bbox_a"))
        and bool(metrics.get("bbox_b"))
    )
    flagged = inliers >= CROSS_MIN_INLIERS and metric_ok
    residual = None
    if matrix is not None and mask is not None:
        try:
            np = _load_numpy()
            source_pts = np.asarray([kp_a[i].pt for i, _ in pairs], dtype=np.float64)
            target_pts = np.asarray([kp_b[j].pt for _, j in pairs], dtype=np.float64)
            if model == "affine":
                predicted = source_pts @ matrix[:, :2].T + matrix[:, 2]
            else:
                homogeneous = np.column_stack([source_pts, np.ones(len(source_pts))]) @ matrix.T
                predicted = homogeneous[:, :2] / np.maximum(np.abs(homogeneous[:, 2:3]), 1e-9)
            residuals = np.linalg.norm(predicted - target_pts, axis=1)
            inlier_mask = mask.ravel().astype(bool)
            if inlier_mask.any():
                residual = float(np.median(residuals[inlier_mask]))
        except Exception:  # noqa: BLE001
            residual = None
    if flagged:
        severity = (
            "high"
            if inliers >= CROSS_HIGH_INLIERS
            and metrics.get("warp_ncc", -1.0) >= WARP_NCC_HIGH
            and metrics.get("warp_ssim", -1.0) >= 0.65
            and metrics.get("ink_density_a", 0.0) >= 0.02
            and metrics.get("ink_density_b", 0.0) >= 0.02
            and metrics.get("edge_density_a", 0.0) >= 0.005
            and metrics.get("edge_density_b", 0.0) >= 0.005
            and (roi_a is not None and roi_a[2] * roi_a[3] >= 576)
            and metric_ok
            else "medium"
        )
    else:
        severity = "low"

    return CrossMatchAnalysis(
        ok=True,
        reason="ok" if flagged else "below_threshold",
        match_count=len(matches),
        inlier_count=inliers,
        ransac_model=model,
        backend=backend,
        flagged=flagged,
        severity=severity,
        extra={
            "kp_a": len(kp_a),
            "kp_b": len(kp_b),
            "min_matches": CROSS_MIN_MATCHES,
            "min_inliers": CROSS_MIN_INLIERS,
            "warp_ncc_high": WARP_NCC_HIGH,
            "warp_ncc_min": WARP_NCC_MIN,
            "warp_ssim_min": WARP_NCC_MIN,
            "metric_gate": metric_ok,
        },
        orientation=orientation,
        scale=scale,
        warp_ncc=metrics.get("warp_ncc"),
        warp_ssim=metrics.get("warp_ssim"),
        overlap_ratio=metrics.get("overlap_ratio"),
        ink_density_a=metrics.get("ink_density_a"),
        ink_density_b=metrics.get("ink_density_b"),
        edge_density_a=metrics.get("edge_density_a"),
        edge_density_b=metrics.get("edge_density_b"),
        bbox_a=tuple(metrics["bbox_a"]) if metrics.get("bbox_a") else None,
        bbox_b=_source_bbox(metrics.get("bbox_b"), orientation, scale, img_b_bgr.shape[1], img_b_bgr.shape[0]),
        inlier_residual_px=residual,
    )


def match_two_arrays(
    img_a_bgr: Any,
    img_b_bgr: Any,
    *,
    prepared_a: Any = _UNSET_FEATURES,
    prepared_b: Any = _UNSET_FEATURES,
) -> CrossMatchAnalysis:
    """Cross-match arrays across orientations and scales, keeping the best evidence."""
    if img_a_bgr is None or img_b_bgr is None:
        return CrossMatchAnalysis(ok=False, reason="null_image")
    if not available():
        return CrossMatchAnalysis(ok=False, reason="opencv_unavailable")
    cv2 = _load_cv2()
    if cv2 is None:
        return CrossMatchAnalysis(ok=False, reason="opencv_unavailable")
    ha, wa = img_a_bgr.shape[:2]
    hb, wb = img_b_bgr.shape[:2]
    if min(ha, wa, hb, wb) < 48:
        return CrossMatchAnalysis(ok=True, reason="too_small")

    # Bound the expensive feature raster while keeping the original arrays for
    # the caller-facing coordinate contract.  All orientation/scale passes and
    # the same RANSAC/NCC/SSIM gates are still executed on the bounded raster.
    bounded_a, factor_a = _bounded_raster(img_a_bgr)
    bounded_b, factor_b = _bounded_raster(img_b_bgr)

    # A is unchanged across every orientation and scale.  Detect its
    # descriptors exactly once; B is detected once for each transformed
    # raster.  This preserves the full four-direction × three-scale coverage
    # while removing the largest avoidable cost in the O(n²) queue.
    detected_a = _detect_features(bounded_a) if prepared_a is _UNSET_FEATURES else prepared_a
    if detected_a is None:
        return CrossMatchAnalysis(ok=True, reason="no_keypoints")
    best: CrossMatchAnalysis | None = None
    for orientation in ORIENTATIONS:
        for scale in MATCH_SCALES:
            transformed_b = _orient_array(bounded_b, orientation)
            if scale != 1.0:
                transformed_b = cv2.resize(transformed_b, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
            # Descriptors are orientation/scale specific; unlike A, B is
            # transformed for every pass and must be detected on that raster.
            # `prepared_b` is reserved for callers that already prepared the
            # exact transformed raster and is intentionally not guessed here.
            if isinstance(prepared_b, dict):
                detected_b = prepared_b.get((orientation, scale))
            else:
                detected_b = _detect_features(transformed_b) if prepared_b is _UNSET_FEATURES else prepared_b
            result = _match_two_arrays_once(
                bounded_a, bounded_b, orientation=orientation, scale=scale,
                detected_a=detected_a, detected_b=detected_b,
            )
            if best is None:
                best = result
                continue
            current_score = (
                int(result.severity == "high"), int(result.flagged), result.warp_ncc or -1.0, result.inlier_count,
                result.overlap_ratio or 0.0,
            )
            best_score = (
                int(best.severity == "high"), int(best.flagged), best.warp_ncc or -1.0, best.inlier_count,
                best.overlap_ratio or 0.0,
            )
            if current_score > best_score:
                best = result
    if best is None:
        return CrossMatchAnalysis(ok=False, reason="no_orientation_result")
    # `_match_two_arrays_once` reports bboxes in bounded-raster coordinates.
    # Restore both sides so report overlays and source evidence remain valid
    # for the original extracted image or panel crop.
    best.bbox_a = _restore_bbox(best.bbox_a, factor_a, wa, ha)
    best.bbox_b = _restore_bbox(best.bbox_b, factor_b, wb, hb)
    if best.inlier_residual_px is not None:
        best.inlier_residual_px = float(best.inlier_residual_px / max(factor_a, 1e-9))
    best.extra = {**best.extra, "match_raster": {
        "max_side": MAX_MATCH_SIDE,
        "factor_a": factor_a,
        "factor_b": factor_b,
        "original_a": [wa, ha],
        "original_b": [wb, hb],
    }}
    return best


def match_two_images(path_a: str, path_b: str) -> CrossMatchAnalysis:
    """Cross-match two image files."""
    a = _read_image(path_a)
    b = _read_image(path_b)
    if a is None or b is None:
        return CrossMatchAnalysis(ok=False, reason="read_failed")
    return match_two_arrays(a, b)


class SiftCopyMoveDetector:
    """Run SIFT-CMFD + RANSAC on every image in the document."""

    name = "image_sift_copymove"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not available():
            return DetectorResult(
                detector=self.name,
                findings=[],
                ok=True,
            )
        findings: list[Finding] = []
        read_failures: list[str] = []
        from ._image_size import summarize_image_sizes

        size_stats = summarize_image_sizes(doc.images)
        for i, img in enumerate(doc.images):
            path = img.image_path
            if not path:
                continue
            # Skip tiny / decorative by byte size when known
            if img.bytes_size and img.bytes_size < 5 * 1024:
                if (img.width or 0) < 64 or (img.height or 0) < 64:
                    continue
            analysis = analyze_copymove_path(path)
            if not analysis.ok:
                read_failures.append(path)
            if not analysis.ok or not analysis.flagged:
                continue
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=analysis.severity,
                    title=(
                        f"Image {i + 1} on page {img.page} "
                        f"shows copy-move forgery "
                        f"({analysis.largest_cluster} cluster / "
                        f"{analysis.ransac_inliers} RANSAC inliers)"
                    ),
                    location=f"image {i + 1} on page {img.page}",
                    evidence=json.dumps(
                        {
                            "kind": "sift_copy_move",
                            "image_index": i,
                            "page": img.page,
                            "keypoint_count": analysis.keypoint_count,
                            "match_count": analysis.match_count,
                            "largest_cluster": analysis.largest_cluster,
                            "ransac_inliers": analysis.ransac_inliers,
                            "ransac_model": analysis.ransac_model,
                            "backend": analysis.backend,
                            "width": analysis.width,
                            "height": analysis.height,
                            **analysis.extra,
                        }
                    ),
                    raw={
                        "kind": "sift_copy_move",
                        "image_index": i,
                        "page": img.page,
                        "keypoint_count": analysis.keypoint_count,
                        "match_count": analysis.match_count,
                        "largest_cluster": analysis.largest_cluster,
                        "ransac_inliers": analysis.ransac_inliers,
                        "ransac_model": analysis.ransac_model,
                        "backend": analysis.backend,
                        "width": analysis.width,
                        "height": analysis.height,
                    },
                )
            )
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=not read_failures,
            error=f'Image decode failed: {read_failures}' if read_failures else None,
            stats={**size_stats.to_stats_dict(), 'read_failures': read_failures},
        )
