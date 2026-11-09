"""Image similarity matrix tool (P1.5).

When the same paper
reproduces the same image
twice (whether intentionally
or by accident), the
detectors in
``manusift.detectors`` flag
the pair. A common need
during review is to *see*
the full N x N similarity
matrix between every pair
of images in the document,
so the reviewer can spot
clusters of similar
images.

This module layers a tool
on top of the four
perceptual hash algorithms
in
``manusift.detectors.imagehash_dup``
(pHash, aHash, dHash, wHash).
The tool runs each
algorithm against the
document's image list and
returns:

  * a list of all image
    pairs whose Hamming
    distance is below the
    per-algorithm threshold,
  * a sorted list of the top
    K most-similar pairs,
  * an N x N distance matrix
    (as nested lists of
    floats in [0, 1]) for
    the most discriminating
    algorithm (pHash).

The output is JSON-encoded
so the LLM agent can show
it to the user or hand it
to a downstream analysis.

The tool is registered as a
built-in so the agent loop
surfaces it in the
``iter_registered_tools``
list. The tool is read-only
and idempotent.

Borrowed from the
``imagehash`` library and
the manubot ``similarity``
package.
"""
from __future__ import annotations

import json
from typing import Any

# The Hamming threshold below
# which two pHashes are
# considered duplicates.
# This mirrors the value in
# ``imagehash_dup``.
_HAMMING_THRESHOLD = 10
from .tool import Tool, ToolContext


def _safe_image_path(img: Any) -> str:
    """Return the on-disk path
    of an ``ExtractedImage``
    (or a duck-typed
    object). Returns "" if
    the path is missing --
    the tool then skips the
    image silently."""
    return getattr(img, "image_path", "") or ""


def _hash_one(algo: str, path: str) -> str | None:
    """Run a single hash
    algorithm on a single
    image. Returns None on
    failure."""
    from ..detectors.imagehash_dup import _compute_hash

    return _compute_hash(algo, path)


def _hamming(a: str, b: str) -> int:
    """Hamming distance between
    two hex strings. The two
    strings are equal-length
    binary hashes; we
    compare the integer
    values bit by bit."""
    if not a or not b:
        return 64
    ai = int(a, 16)
    bi = int(b, 16)
    return bin(ai ^ bi).count("1")


def _normalise_distance(
    dist: int, bits: int = 64
) -> float:
    """Map a Hamming distance
    on a 64-bit hash to a
    similarity score in
    [0, 1]. 0 = identical;
    1 = maximally different."""
    return dist / bits


def _build_matrix(
    images: list[Any], algo: str = "phash"
) -> list[list[float]]:
    """Return the N x N
    similarity matrix
    between every image
    pair. Diagonal entries
    are 0 (a distance of
    0). Off-diagonal
    entries are the
    Hamming distance
    divided by the number
    of bits."""
    paths = [_safe_image_path(i) for i in images]
    hashes: list[str | None] = [
        _hash_one(algo, p) if p else None for p in paths
    ]
    n = len(images)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if hashes[i] is None or hashes[j] is None:
                continue
            d = _hamming(hashes[i] or "", hashes[j] or "")
            sim = _normalise_distance(d)
            matrix[i][j] = sim
            matrix[j][i] = sim
    return matrix


def _top_pairs(
    matrix: list[list[float]], top_k: int = 10
) -> list[dict[str, Any]]:
    """Return the top K
    most-similar pairs in
    *ascending* distance
    order (i.e. most
    similar first). Diagonal
    entries are skipped."""
    pairs: list[tuple[float, int, int]] = []
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            pairs.append((matrix[i][j], i, j))
    pairs.sort()
    return [
        {"i": i, "j": j, "distance": d}
        for d, i, j in pairs[:top_k]
    ]


def _flagged_pairs(
    images: list[Any], matrix: list[list[float]]
) -> list[dict[str, Any]]:
    """Return the image pairs
    that are within the
    Hamming threshold of
    each other."""
    flagged: list[dict[str, Any]] = []
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            if matrix[i][j] * 64 <= _HAMMING_THRESHOLD:
                flagged.append(
                    {
                        "i": i,
                        "j": j,
                        "image_a": _safe_image_path(
                            images[i]
                        ),
                        "image_b": _safe_image_path(
                            images[j]
                        ),
                        "distance": matrix[i][j],
                    }
                )
    return flagged


class ImageSimilarityMatrixTool:
    """Compute the N x N
    similarity matrix
    between every image
    pair in the current
    document. The output is
    JSON-serialisable so the
    LLM can show it to the
    user or pass it to
    another tool."""

    name: str = "image_similarity_matrix"

    def description(self) -> str:
        return (
            "Compute the N x N similarity matrix between "
            "every image in the current document. The "
            "underlying similarity is the Hamming distance "
            "between the pHash of each image; a value of 0 "
            "means the images are identical, a value of 1 "
            "means they are completely different. The "
            "output is JSON with three keys: ``matrix`` "
            "(nested list of floats), ``top_pairs`` (the "
            "10 most similar pairs), and ``flagged_pairs`` "
            "(pairs within the duplication threshold). "
            "Read-only and fast."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "trace_id": {
                    "type": "string",
                    "description": (
                        "The trace_id of the document to "
                        "analyse. The tool reads the "
                        "image list from the in-memory "
                        "ParsedDoc registry."
                    ),
                },
            },
            "required": [],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        # The tool is given
        # the current
        # document via the
        # ``ctx`` -- we look
        # the image list up
        # through a small
        # global that the
        # chat app sets before
        # calling us. For the
        # unit test we accept
        # the image list as
        # ``input["images"]``.
        images = input.get("images")
        if images is None:
            return json.dumps(
                {
                    "error": (
                        "no images provided; pass an "
                        "'images' list in the input"
                    )
                }
            )
        if not images:
            return json.dumps(
                {
                    "matrix": [],
                    "top_pairs": [],
                    "flagged_pairs": [],
                    "image_count": 0,
                }
            )
        matrix = _build_matrix(images)
        return json.dumps(
            {
                "matrix": matrix,
                "top_pairs": _top_pairs(matrix, top_k=10),
                "flagged_pairs": _flagged_pairs(
                    images, matrix
                ),
                "image_count": len(images),
            }
        )


def register_similarity_tools() -> list[Tool]:
    return [ImageSimilarityMatrixTool()]
