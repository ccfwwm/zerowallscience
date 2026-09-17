"""Finding aggregation (P1.1) — group flat findings into issues.

The detector pipeline emits a flat list of findings; the same figure is
often hit by several channels at once (``image_dup`` + ``image_forensics``
+ ``panel_duplicate`` + ...), which inflates the review queue. This module
adds a *view* on top of that list: findings that point at the same
evidence object are grouped into one :class:`Issue`.

Discipline (same as ``finding_calibration``): **never drop a finding**.
The input list is not modified; every finding lands in exactly one issue
and the issue only references its members by ``finding_id``.

Grouping rules
--------------
* **image** — findings from image detectors are keyed by image identity.
  Pair findings (``raw.image_a`` / ``raw.image_b`` with ``page`` /
  ``index``) union their two endpoints in a union-find, so pairs sharing
  one image collapse into a connected cluster. Single-image findings
  (``raw.page`` + ``raw.index``, or the ``image N on page M`` location
  convention) attach to the cluster of their image. Endpoints with equal
  or near-equal pHash (Hamming <= ``_PHASH_BRIDGE_HAMMING``) are bridged
  as well. Page-level (``page_raster_dup``) and panel-level
  (``panel_dup``) pairs use their own identity namespaces.
* **table** — keyed by table identity (``raw.fig_name`` /
  ``raw.table_id`` / ``raw.left_table``+``raw.right_table`` / the table
  label in ``location``) plus the check cluster (``raw.check`` /
  ``raw.kind`` with the ``cross_table_`` prefix folded in).
* **text / metadata** — keyed by detector family, so a chatty detector
  produces one issue instead of N near-identical rows.

Determinism: the same input list always yields the same issue ids and the
same ordering. Issue ids are content hashes of ``kind|group_key``; the
output is sorted by ``(-severity_rank, -member_count, issue_id)``.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from ..contracts import Finding

_SEV_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3}

# pHash endpoints within this Hamming distance are considered the same
# image even when page/index disagree (conservative: 4 of 64 bits).
_PHASH_BRIDGE_HAMMING = 4

_IMAGE_DETECTORS = frozenset(
    {
        "image_dup",
        "image_forensics",
        "image_sift_copymove",
        "sift_copymove",
        "panel_duplicate",
        "panel_dup",
        "page_raster_dup",
        "image_noise_inconsistency",
        "image_statistics",
        "imagehash_phash",
        "imagehash_ahash",
        "imagehash_dhash",
        "imagehash_whash",
        "image_ssim",
        "ai_generated_figure",
        "photoholmes",
    }
)

_TABLE_DETECTORS = frozenset(
    {
        "table_relationships",
        "table_benford",
        "table_duplicate_row",
        "table_near_duplicate_row",
        "table_outlier",
        "table_round_bias",
        "table_cross_copy",
        "table_forensics",
        "table_file_metadata",
        "table_highlight_focus",
        "stat_grim",
        "stat_percent",
        "stat_pvalue",
        "figure_grim",
        "figure_table_ocr",
        "figure_table_consistency",
        "chart_data_extract",
        "source_data_consistency",
    }
)

_METADATA_DETECTORS = frozenset(
    {
        "metadata",
        "pdf_metadata",
        "compliance",
        "supplementary",
        "author_emails",
        "data_availability_concern",
        "paper_mill_template",
        "paper_mill_authorship",
    }
)

# Text/metadata detectors sharing one issue. Detectors missing from this
# map form their own single-detector family.
_DETECTOR_FAMILY = {
    "metadata": "metadata",
    "pdf_metadata": "metadata",
    "author_emails": "metadata",
    "compliance": "compliance",
    "supplementary": "supplementary",
    "data_availability_concern": "compliance",
    "paper_mill_template": "paper_mill",
    "paper_mill_authorship": "paper_mill",
    "text_patterns": "text",
    "text_tortured_phrases": "text",
    "figure_stat_text": "text",
    "ref_duplicate": "references",
    "ref_format_anomaly": "references",
}


@dataclass(frozen=True)
class Issue:
    """An aggregated view over one or more findings.

    Members are referenced by ``finding_id`` only — the original
    ``Finding`` objects stay authoritative.
    """

    issue_id: str
    kind: str  # "image" | "table" | "text" | "metadata"
    severity: str  # max severity across members
    title: str
    detectors: tuple[str, ...]
    finding_ids: tuple[str, ...]
    member_count: int
    group_key: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "issue_id": self.issue_id,
            "kind": self.kind,
            "severity": self.severity,
            "title": self.title,
            "detectors": list(self.detectors),
            "finding_ids": list(self.finding_ids),
            "member_count": self.member_count,
            "group_key": self.group_key,
        }


# ---------------------------------------------------------------------------
# union-find
# ---------------------------------------------------------------------------


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[Any, Any] = {}

    def find(self, x: Any) -> Any:
        self.parent.setdefault(x, x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        # path compression
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a: Any, b: Any) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        # deterministic root choice: smaller repr wins
        if repr(ra) <= repr(rb):
            self.parent[rb] = ra
        else:
            self.parent[ra] = rb


def _rank(sev: str) -> int:
    return _SEV_RANK.get(str(sev or "info"), 0)


def _hamming_hex(a: str, b: str) -> int | None:
    """Bit Hamming distance between two equal-length hex hashes."""
    a, b = (a or "").strip().lower(), (b or "").strip().lower()
    if not a or not b or len(a) != len(b):
        return None
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# image identity extraction
# ---------------------------------------------------------------------------

# ``image 3 on page 0`` — the detector location convention: the image
# number is the 1-based enumeration on the page, the page is 0-based
# (matches ``raw.page`` / ``raw.index``).
_LOC_IMAGE_ON_PAGE = re.compile(r"image\s+(\d+)\s+on\s+page\s+(\d+)", re.I)
# imagehash_* fallback: ``page A <-> page B`` (no index available).
_LOC_PAGE_PAIR = re.compile(r"page\s+(\d+)\s*<->\s*page\s+(\d+)", re.I)


def _int_or_none(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _img_node(d: Any) -> tuple | None:
    """``raw.image_a``-style dict → (``img``, page, index) node."""
    if not isinstance(d, dict):
        return None
    page = _int_or_none(d.get("page"))
    if page is None:
        return None
    index = _int_or_none(d.get("index"))
    if index is None:
        # page known, index unknown (imagehash_* evidence JSON)
        return ("page", page)
    return ("img", page, index)


def _evidence_dict(f: Finding) -> dict[str, Any]:
    """Some detectors (imagehash_*) put the pair payload in ``evidence``
    as a JSON string instead of ``raw``. Best-effort parse."""
    ev = f.evidence or ""
    if not ev.startswith("{"):
        return {}
    try:
        d = json.loads(ev)
    except (ValueError, TypeError):
        return {}
    return d if isinstance(d, dict) else {}


def _image_nodes(f: Finding) -> tuple[set[tuple], list[tuple[tuple, str]]]:
    """Return (identity nodes, (node, phash) pairs) for one image finding.

    Every node a finding touches is unioned, so a pair finding merges the
    clusters of both endpoints.
    """
    raw = f.raw if isinstance(f.raw, dict) else {}
    nodes: set[tuple] = set()
    phashes: list[tuple[tuple, str]] = []

    def add(node: tuple | None, phash: Any = None) -> None:
        if node is None:
            return
        nodes.add(node)
        ph = str(phash or "").strip().lower()
        if ph:
            phashes.append((node, ph))

    # 1. explicit pair: raw.image_a / raw.image_b
    ia, ib = raw.get("image_a"), raw.get("image_b")
    if ia is not None or ib is not None:
        add(_img_node(ia), (ia or {}).get("phash") if isinstance(ia, dict) else None)
        add(_img_node(ib), (ib or {}).get("phash") if isinstance(ib, dict) else None)
    else:
        # imagehash_* style: pair payload lives in evidence JSON
        ev = _evidence_dict(f)
        if ev:
            ea, eb = ev.get("image_a"), ev.get("image_b")
            add(_img_node(ea), (ea or {}).get("phash") if isinstance(ea, dict) else None)
            add(_img_node(eb), (eb or {}).get("phash") if isinstance(eb, dict) else None)

    # 2. image_forensics full_image_duplicate: raw.images = [{page, index}, ...]
    imgs = raw.get("images")
    if isinstance(imgs, list):
        for d in imgs:
            add(_img_node(d), d.get("phash") if isinstance(d, dict) else None)

    # 3. single image: raw.page + raw.index / raw.image_index
    page = _int_or_none(raw.get("page"))
    index = _int_or_none(raw.get("index", raw.get("image_index")))
    if page is not None and index is not None:
        add(("img", page, index), raw.get("phash"))

    # 4. page-level pair: page_raster_dup (raw.page_a / raw.page_b)
    pa, pb = _int_or_none(raw.get("page_a")), _int_or_none(raw.get("page_b"))
    if pa is not None and pb is not None:
        panel_a, panel_b = raw.get("panel_a"), raw.get("panel_b")
        if panel_a is not None and panel_b is not None:
            # panel_dup: panel identity within a page
            add(("panel", pa, str(panel_a)), raw.get("phash_a"))
            add(("panel", pb, str(panel_b)), raw.get("phash_b"))
        else:
            add(("page", pa), raw.get("phash_a"))
            add(("page", pb), raw.get("phash_b"))

    # 5. location fallback for detectors with empty raw
    #    (panel_duplicate, image_noise_inconsistency, image_sift_copymove,
    #    image_ssim, ...). Only used when raw gave us nothing.
    if not nodes:
        loc = f.location or ""
        found = _LOC_IMAGE_ON_PAGE.findall(loc)
        if found:
            for n_img, n_page in found:
                add(("img", int(n_page), int(n_img) - 1))
        else:
            m = _LOC_PAGE_PAIR.search(loc)
            if m:
                add(("page", int(m.group(1))))
                add(("page", int(m.group(2))))

    return nodes, phashes


# ---------------------------------------------------------------------------
# table identity extraction
# ---------------------------------------------------------------------------

_LOC_TABLE_LABEL = re.compile(r"(?i)\s*((?:table|fig(?:ure)?)\s*\.?\s*[^,;]*)")


def _norm_label(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def _table_identity(f: Finding, raw: dict[str, Any]) -> str | None:
    for key in ("fig_name", "table_id"):
        v = _norm_label(raw.get(key))
        if v:
            return v
    left = _norm_label(raw.get("left_table"))
    right = _norm_label(raw.get("right_table"))
    if left or right:
        a, b = sorted([left, right])
        return f"{a} <-> {b}"
    loc = f.location or ""
    host = re.split(r",\s*columns?\b", loc, maxsplit=1, flags=re.I)[0]
    m = _LOC_TABLE_LABEL.match(host)
    if m:
        label = _norm_label(m.group(1))
        if label:
            return label
    label = _norm_label(host)
    return label or None


def _check_cluster(raw: dict[str, Any]) -> str:
    check = str(raw.get("check") or raw.get("kind") or "").strip().lower()
    # fold cross-table variants into the same check cluster
    if check.startswith("cross_table_"):
        check = check[len("cross_table_"):]
    return check or "general"


# ---------------------------------------------------------------------------
# aggregation
# ---------------------------------------------------------------------------


def _make_issue(kind: str, group_key: str, title: str, members: list[Finding]) -> Issue:
    issue_id = "ISS-" + hashlib.sha1(f"{kind}|{group_key}".encode()).hexdigest()[:12]
    severity = max(members, key=lambda f: _rank(f.severity)).severity
    detectors = tuple(sorted({f.detector for f in members}))
    finding_ids = tuple(sorted(f.finding_id for f in members))
    return Issue(
        issue_id=issue_id,
        kind=kind,
        severity=str(severity),
        title=title,
        detectors=detectors,
        finding_ids=finding_ids,
        member_count=len(members),
        group_key=group_key,
    )


def _aggregate_images(findings: list[Finding]) -> list[Issue]:
    uf = _UnionFind()
    per_finding: list[tuple[Finding, set[tuple]]] = []
    phash_pairs: list[tuple[tuple, str]] = []

    for f in findings:
        nodes, phs = _image_nodes(f)
        nodes = set(nodes)
        # a finding unions every node it touches (pair → merge endpoints)
        node_list = sorted(nodes, key=repr)
        for a, b in zip(node_list, node_list[1:]):
            uf.union(a, b)
        per_finding.append((f, nodes))
        phash_pairs.extend(phs)

    # pHash near-neighbour bridge: union nodes whose hashes nearly match
    by_hash: list[tuple[tuple, str]] = sorted(phash_pairs, key=lambda t: (t[1], repr(t[0])))
    for i in range(len(by_hash)):
        for j in range(i + 1, len(by_hash)):
            (na, ha), (nb, hb) = by_hash[i], by_hash[j]
            d = _hamming_hex(ha, hb)
            if d is not None and d <= _PHASH_BRIDGE_HAMMING:
                uf.union(na, nb)

    # bucket findings by cluster root; findings without any identity fall
    # back to one issue per detector (e.g. summary rows, ai_generated_figure)
    buckets: dict[str, list[Finding]] = {}
    titles: dict[str, str] = {}
    for f, nodes in per_finding:
        if nodes:
            root = min((uf.find(n) for n in nodes), key=repr)
            key = f"image|{repr(root)}"
            node_set = {n for n in uf.parent if uf.find(n) == root}
        else:
            key = f"image|detector:{f.detector}"
            node_set = set()
        buckets.setdefault(key, []).append(f)
        if key not in titles:
            titles[key] = _image_title(node_set)

    return [
        _make_issue("image", key, titles[key], members)
        for key, members in buckets.items()
    ]


def _image_title(nodes: set[tuple]) -> str:
    pages = sorted({n[1] for n in nodes if n and n[0] in ("img", "page")})
    if pages:
        shown = ", ".join(str(p + 1) for p in pages[:6])
        suffix = f", +{len(pages) - 6} more" if len(pages) > 6 else ""
        return f"Image evidence cluster on page(s) {shown}{suffix}"
    kinds = {n[0] for n in nodes if n}
    if "panel" in kinds:
        return "Panel-level reuse cluster"
    return "Image evidence cluster"


def _aggregate_tables(findings: list[Finding]) -> list[Issue]:
    buckets: dict[str, list[Finding]] = {}
    titles: dict[str, str] = {}
    for f in findings:
        raw = f.raw if isinstance(f.raw, dict) else {}
        identity = _table_identity(f, raw)
        check = _check_cluster(raw)
        if identity:
            key = f"table|{identity}|{check}"
            title = (
                f"Table '{identity}' — {check} signals"
                if check != "general"
                else f"Table '{identity}' — detector signals"
            )
        else:
            key = f"table|detector:{f.detector}|{check}"
            title = f"{f.detector} — {check} signals"
        buckets.setdefault(key, []).append(f)
        titles.setdefault(key, title)
    return [
        _make_issue("table", key, titles[key], members)
        for key, members in buckets.items()
    ]


def _aggregate_text_metadata(findings: list[Finding], *, kind: str) -> list[Issue]:
    buckets: dict[str, list[Finding]] = {}
    for f in findings:
        family = _DETECTOR_FAMILY.get(f.detector, f.detector)
        buckets.setdefault(f"{kind}|family:{family}", []).append(f)
    issues: list[Issue] = []
    for key, members in buckets.items():
        family = key.rsplit(":", 1)[-1]
        title = f"{family} — {len(members)} finding(s)"
        issues.append(_make_issue(kind, key, title, members))
    return issues


def aggregate_findings(findings: Iterable[Finding]) -> list[Issue]:
    """Group findings into issues. Input list is never modified.

    Every finding lands in exactly one issue. The output order is
    deterministic: severity rank desc, member count desc, issue id asc.
    """
    items = list(findings)
    if not items:
        return []

    image_fs = [f for f in items if f.detector in _IMAGE_DETECTORS]
    table_fs = [f for f in items if f.detector in _TABLE_DETECTORS]
    meta_fs = [
        f
        for f in items
        if f.detector not in _IMAGE_DETECTORS
        and f.detector not in _TABLE_DETECTORS
        and f.detector in _METADATA_DETECTORS
    ]
    text_fs = [
        f
        for f in items
        if f.detector not in _IMAGE_DETECTORS
        and f.detector not in _TABLE_DETECTORS
        and f.detector not in _METADATA_DETECTORS
    ]

    issues: list[Issue] = []
    issues.extend(_aggregate_images(image_fs))
    issues.extend(_aggregate_tables(table_fs))
    issues.extend(_aggregate_text_metadata(meta_fs, kind="metadata"))
    issues.extend(_aggregate_text_metadata(text_fs, kind="text"))

    issues.sort(key=lambda i: (-_rank(i.severity), -i.member_count, i.issue_id))
    return issues
