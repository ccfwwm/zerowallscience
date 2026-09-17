"""Tortured-phrases detector (P1.1).

A "tortured phrase" is a
synonym-paraphrase of a
common scientific term that
shows up in a paper because
the author (or the paper-
mill they paid) used a
neural-machine-translation
tool to rewrite the
manuscript. The classic
example is "unprecedented"
becoming "unpresidented" --
a phrase no native English
speaker has ever used.

Cabanac, Labbe and
Lovet-Lorski (2021,
"Detection of tortured
phrases in scientific
literature") compiled a
dictionary of tortured
phrases by mining
retracted papers.

2026-07 precision overhaul:
the dictionary now comes
from a *verified* curated
source -- the PaperGuard /
Cabanac-derived CSV (5,802
phrases), loaded at import
time from
``tortured_phrases_data.json``
(built by
``scripts/build_tortured_dict.py``).
The previous hand-written
dictionary flagged *ordinary*
scientific English ("data
availability", "p-value",
"cell viability", ...) as
tortured, which fired on
every legitimate paper;
those entries were removed.

The detector is read-only
and string-based: we scan
``doc.text_blocks`` for
each tortured phrase and
emit a finding per match.
The severity is
"medium" for any single
match and "high" when the
document contains 3+ total
occurrences (the threshold
at which the authors of the
original paper consider the
document suspicious).

Borrowed from Cabanac et
al. 2021 / 2024 (Springer
Scientometrics) and the
PaperGuard curated CSV
(Cabanac-derived, verified).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Hand-curated core list of
# tortured phrases, EXTENDED at
# import time by the verified
# Cabanac-derived dictionary in
# ``tortured_phrases_data.json``
# (see ``_load_external`` below;
# built by
# ``scripts/build_tortured_dict.py``).
# Only *non-standard* phrasings
# belong here: entries that are
# ordinary scientific English
# (e.g. "data availability",
# "p-value", "cell viability")
# were removed in the 2026-07
# precision overhaul because they
# fired on every legitimate paper.
_TORTURED: dict[str, str] = {
    "unpresidented": "unprecedented",
    "non-negotiated": "non-negotiable",
    "non-negotiables": "non-negotiable",
    "sars-cov-19": "SARS-CoV-2",
    "covid-2019": "COVID-19",
    "deeply learning": "deep learning",
    "deeply-learned": "deep learning",
    "deeply learnt": "deep learning",
    "machine-learned": "machine learning",
    "to computationally": "to compute",
}


# R-2026-06-19 (P2-C8):
# Chinese tortured-phrases
# dictionary.  This
# is a *small* starter
# set (50 entries) that
# covers the most common
# paraphrased-from-English
# mistakes observed in
# Chinese scientific
# writing.  The pattern
# is the same as the
# English dict: the
# KEY is the tortured
# phrase (a non-standard
# or broken translation),
# the VALUE is the
# canonical / correct
# form.  The detector
# merges both dicts at
# import time.
_TORTURED_CN: dict[str, str] = {
    # English
    # terms
    # that
    # get
    # mistakenly
    # translated
    # into
    # Chinese
    # and
    # then
    # back
    # to
    # broken
    # English.
    # Example:
    # "深度学习" → "deep learning" (good)
    # "深学习" → "deep learning" (bad,
    # drops the 度)
    "深学习": "deep learning",
    "机器学习": "machine learning",
    "机学习": "machine learning",
    "深度神经网路": "deep neural network",
    "类神经网路": "neural network",
    "类神经网络": "neural network",
    "卷积神经网路": "convolutional neural network",
    "递回神经网路": "recurrent neural network",
    "资料探勘": "data mining",
    "资料采矿": "data mining",
    "大数据分析": "big data analysis",
    "巨量资料": "big data",
    "云端运算": "cloud computing",
    "边缘运算": "edge computing",
    "物联网": "Internet of Things",
    "人工智慧": "artificial intelligence",
    "知识发现": "knowledge discovery",
    "知识擷取": "knowledge extraction",
    "决策树": "decision tree",
    "支持向量机": "support vector machine",
    "随机森林": "random forest",
    "梯度提升": "gradient boosting",
    "特征擷取": "feature extraction",
    "特征选择": "feature selection",
    "特征工程": "feature engineering",
    "正规化": "regularization",
    "归一化": "normalization",
    "标准化": "standardization",
    "过拟合": "overfitting",
    "欠拟合": "underfitting",
    "训练集": "training set",
    "测试集": "test set",
    "验证集": "validation set",
    "交叉验证": "cross-validation",
    "性能指标": "performance metric",
    "精确率": "precision",
    "召回率": "recall",
    "F1分数": "F1 score",
    "受试者工作特征": "ROC",
    "ROC曲线": "ROC curve",
    "曲线下面积": "AUC",
    "均方误差": "mean squared error",
    "交叉熵": "cross-entropy",
    "梯度下降": "gradient descent",
    "反向传播": "backpropagation",
    "权重": "weight",
    "偏差": "bias",
    "激活函数": "activation function",
    "卷积层": "convolutional layer",
    "池化层": "pooling layer",
    "全连接层": "fully connected layer",
    "Dropout层": "dropout layer",
    "嵌入式": "embedded",
    "词向量": "word embedding",
    "变换器": "transformer",
    "自注意力": "self-attention",
    "大型语言模型": "large language model",
    "生成式人工智能": "generative AI",
}


def _normalise_phrase(s: str) -> str:
    """Lowercase, collapse
    whitespace, strip. The
    detector matches case-
    insensitively by
    lowercasing both the
    dictionary and the
    search text."""
    return re.sub(r"\s+", " ", s.strip().lower())


def _load_external() -> dict[str, str]:
    """Load the verified Cabanac-derived dictionary
    (``tortured_phrases_data.json``, built by
    ``scripts/build_tortured_dict.py`` from the
    PaperGuard curated CSV). Returns an empty dict
    when the data file is missing -- the hand-curated
    core in ``_TORTURED`` still works on its own."""
    data_path = Path(__file__).with_name("tortured_phrases_data.json")
    try:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}
    return {
        _normalise_phrase(str(k)): str(v)
        for k, v in raw.items()
        if str(k).strip()
    }


# Merge: external verified dictionary first,
# hand-curated core wins on key conflicts.
_EXTERNAL = _load_external()
_TORTURED = {**_EXTERNAL, **_TORTURED}

# Pre-compile the
# normalised dictionary
# once at import time.
_NORMALISED = {
    _normalise_phrase(k): v for k, v in _TORTURED.items()
}
# R-2026-06-19 (P2-C8):
# also merge the Chinese
# dict into
# ``_NORMALISED``
# (stored verbatim --
# lowercase is a no-op
# on CJK).
for k, v in _TORTURED_CN.items():
    _NORMALISED.setdefault(k, v)


def _has_cjk(s: str) -> bool:
    return any(
        "一" <= ch <= "鿿"
        or "぀" <= ch <= "ゟ"
        or "゠" <= ch <= "ヿ"
        for ch in s
    )


# ASCII phrases are matched with ONE combined
# alternation regex (longest-first so the most
# specific phrase wins at each position). With
# several thousand verified phrases, per-phrase
# ``finditer`` loops are too slow; a single
# alternation scans the text in one pass.
_ASCII_PHRASES = sorted(
    (p for p in _NORMALISED if p and not _has_cjk(p)),
    key=len,
    reverse=True,
)
_ASCII_PATTERN: re.Pattern[str] | None = None
if _ASCII_PHRASES:
    _ASCII_PATTERN = re.compile(
        r"(?<![A-Za-z])(?:"
        + "|".join(re.escape(p) for p in _ASCII_PHRASES)
        + r")(?![A-Za-z])",
        re.IGNORECASE,
    )

# CJK phrases keep per-phrase patterns with
# CJK-boundary anchors (Chinese has no ASCII
# word boundaries).
_CJK_PATTERNS: list[tuple[re.Pattern[str], str, str]] = []
for _phrase in sorted(
    (p for p in _NORMALISED if p and _has_cjk(p)),
    key=len,
    reverse=True,
):
    _pat = re.compile(r"(?<![一-鿿])" + re.escape(_phrase) + r"(?![一-鿿])")
    _CJK_PATTERNS.append((_pat, _phrase, _NORMALISED[_phrase]))


# Severity thresholds.
# The original Cabanac
# paper uses 5+ matches
# for a "high" verdict;
# we use a more
# conservative 3+.
HIGH_SEVERITY_THRESHOLD = 3


class TorturedPhrasesDetector:
    """Scan the document text
    for the curated set of
    tortured phrases."""

    name = "text_tortured_phrases"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        text = " ".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        if not text:
            return DetectorResult(
                detector=self.name,
                findings=[],
                ok=True,
            )
        text_lower = text.lower()
        matches: list[dict[str, Any]] = []
        if _ASCII_PATTERN is not None:
            for m in _ASCII_PATTERN.finditer(text_lower):
                phrase = _normalise_phrase(m.group(0))
                matches.append(
                    {
                        "phrase": phrase,
                        "intended": _NORMALISED.get(phrase, ""),
                        "start": m.start(),
                    }
                )
        for pat, phrase, _intended in _CJK_PATTERNS:
            for m in pat.finditer(text_lower):
                matches.append(
                    {
                        "phrase": phrase,
                        "intended": _intended,
                        "start": m.start(),
                    }
                )
        if not matches:
            return DetectorResult(
                detector=self.name,
                findings=[],
                ok=True,
            )
        # Deduplicate: we
        # report a *finding*
        # per distinct tortured
        # phrase, not per
        # match. The LLM can
        # ask for the full
        # evidence.
        distinct = sorted(
            {m["phrase"] for m in matches}
        )
        # The total count
        # includes duplicates
        # (a phrase repeated
        # many times in a long
        # paper is also
        # evidence).
        total = len(matches)
        severity = (
            "high"
            if total >= HIGH_SEVERITY_THRESHOLD
            else "medium"
        )
        finding = Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity=severity,
            title=(
                f"Document contains {len(distinct)} "
                f"distinct tortured phrase(s) "
                f"({total} total occurrences)"
            ),
            location="text",
            evidence=json.dumps(
                {
                    "distinct_phrases": [
                        {
                            "phrase": p,
                            "likely_intended": _NORMALISED[p],
                        }
                        for p in distinct
                    ],
                    "total_occurrences": total,
                    "examples": matches[:5],
                }
            ),
        )
        return DetectorResult(
            detector=self.name,
            findings=[finding],
            ok=True,
        )
