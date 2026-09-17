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
# Cap descriptors for speed on huge figures
MAX_KEYPOINTS: int = int(os.environ.get("MANUSIFT_SIFT_MAX_KP", "2000"))
# Prefer SIFT; fall back to ORB when SIFT unavailable
FEATURE_BACKEND: str = os.environ.get("MANUSIFT_SIFT_BACKEND", "auto")


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
        arr = cv2.imread(path)
    except Exception:  # noqa: BLE001
        return None
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
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None or len(pairs) < MIN_RANSAC_INLIERS:
        return 0, ""

    kpb = keypoints if keypoints_b is None else keypoints_b
    src = np.float32([keypoints[i].pt for i, _ in pairs]).reshape(-1, 1, 2)
    dst = np.float32([kpb[j].pt for _, j in pairs]).reshape(-1, 1, 2)

    # Affine partial (similarity: translation + rotation + scale)
    try:
        _M, mask = cv2.estimateAffinePartial2D(
            src,
            dst,
            method=cv2.RANSAC,
            ransacReprojThreshold=RANSAC_REPROJ_THRESH,
            maxIters=2000,
            confidence=0.99,
        )
        if mask is not None:
            inl = int(mask.ravel().sum())
            if inl >= MIN_RANSAC_INLIERS:
                return inl, "affine"
    except Exception:  # noqa: BLE001
        pass

    # Homography fallback (handles stronger warps / perspective paste)
    if len(pairs) >= 4:
        try:
            _H, mask = cv2.findHomography(
                src,
                dst,
                method=cv2.RANSAC,
                ransacReprojThreshold=RANSAC_REPROJ_THRESH,
                maxIters=2000,
                confidence=0.99,
            )
            if mask is not None:
                inl = int(mask.ravel().sum())
                if inl >= MIN_RANSAC_INLIERS:
                    return inl, "homography"
        except Exception:  # noqa: BLE001
            pass
    return 0, ""


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
    inliers, model = _ransac_verify(keypoints, best_pairs)

    # Flag when cluster large AND RANSAC confirms (or cluster very large
    # even if RANSAC soft-fails — pure translation clones sometimes
    # under-fit affine when noise is high).
    confirmed = inliers >= MIN_RANSAC_INLIERS
    soft_ok = cluster >= HIGH_SEVERITY_THRESHOLD and cluster >= MIN_CLUSTER_SIZE
    flagged = cluster >= MIN_CLUSTER_SIZE and (confirmed or soft_ok)

    if flagged and confirmed:
        # 2026-07 (negative_controls_v1): reserve "high" for
        # strong copy-move evidence (>= 40 inliers/cluster);
        # 20-39 stays medium. Flag thresholds are unchanged,
        # so recall is unaffected -- only the verdict band.
        severity = (
            "high"
            if inliers >= HIGH_INLIERS
            or cluster >= HIGH_INLIERS
            else "medium"
        )
    elif flagged:
        severity = "medium"  # soft-only, no solid RANSAC
    else:
        severity = "low"

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
        },
    )


def analyze_copymove_path(path: str) -> CopyMoveAnalysis:
    """Run CMFD on an image file path."""
    arr = _read_image(path)
    if arr is None:
        return CopyMoveAnalysis(ok=False, reason="read_failed")
    return analyze_copymove_array(arr)


def match_two_arrays(
    img_a_bgr: Any,
    img_b_bgr: Any,
) -> CrossMatchAnalysis:
    """Cross-match two BGR arrays with SIFT/ORB + RANSAC."""
    if img_a_bgr is None or img_b_bgr is None:
        return CrossMatchAnalysis(ok=False, reason="null_image")
    if not available():
        return CrossMatchAnalysis(ok=False, reason="opencv_unavailable")

    ha, wa = img_a_bgr.shape[:2]
    hb, wb = img_b_bgr.shape[:2]
    if min(ha, wa, hb, wb) < 48:
        return CrossMatchAnalysis(ok=True, reason="too_small")

    da = _detect_features(img_a_bgr)
    db = _detect_features(img_b_bgr)
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
    inliers, model = _ransac_verify(kp_a, pairs, keypoints_b=kp_b)
    flagged = inliers >= CROSS_MIN_INLIERS
    if flagged:
        severity = (
            "high"
            if inliers >= CROSS_HIGH_INLIERS
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
        },
    )


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
            ok=True,
            stats=size_stats.to_stats_dict(),
        )
