"""Compliance statement extractor (P2.1).

Many journals require five
kinds of statements in
every submission:

  1. **Data availability** --
     a sentence declaring
     whether the data is
     publicly available and,
     if so, where.
  2. **Ethics approval** --
     a sentence declaring
     that the study was
     approved by an
     institutional review
     board (IRB) or animal
     care committee (IACUC).
  3. **Funding** -- a
     sentence declaring the
     funding source.
  4. **Conflict of interest**
     -- a sentence declaring
     whether the authors
     have any conflicts.
  5. **Trial registration**
     -- a sentence declaring
     the trial registration
     number (for clinical
     trials).

The detector extracts each
of these from the document
text and reports which
are *missing*. A missing
statement is not proof of
fraud -- many older papers
omit them by editorial
choice -- but a *modern*
paper (e.g. post-2018) that
omits one is a small red
flag. The detector does
*not* check that the
statements are true; it only
checks that they exist.

The detector uses simple
keyword / regex matching.
We do not attempt to parse
the statements semantically
-- a proper implementation
would use a small LLM call
or a fine-tuned classifier,
but for the *absence* test a
keyword match is enough.

Borrowed from the ICMJE
recommendations and the
CONSORT 2010 checklist.
"""
from __future__ import annotations

import json
import re

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Regexes for each statement
# type. The order of
# alternation matters --
# longer phrases first to
# avoid the "of interest"
# prefix of "conflict of
# interest" matching the
# "interest" sub-pattern
# of "funding".
_PATTERNS: dict[str, re.Pattern[str]] = {
    "data_availability": re.compile(
        r"\b(data availability|data availability "
        r"statement|data are available|data is "
        r"available|raw data are|data sharing|"
        r"data access|raw data|raw data underlying)\b",
        re.IGNORECASE,
    ),
    "ethics_approval": re.compile(
        r"\b(ethics approval|ethical approval|"
        r"institutional review board|irb "
        r"approval|animal care and use|"
        r"iacuc|ethics committee|ethical "
        r"review|research ethics|ethics "
        r"statement|approved by the)\b",
        re.IGNORECASE,
    ),
    "funding": re.compile(
        r"\b(funding|funded by|financial "
        r"support|grant number|grant support|"
        r"supported by|funder|sponsored by)\b",
        re.IGNORECASE,
    ),
    "conflict_of_interest": re.compile(
        r"\b(conflict[s]? of interest|"
        r"competing interests|conflict of "
        r"interest statement|coi statement|"
        r"no conflict[s]?|disclosure "
        r"statement|disclosures)\b",
        re.IGNORECASE,
    ),
    "trial_registration": re.compile(
        r"\b(trial registration|registered "
        r"at|clinicaltrials\.gov|chictr\.org\.cn|"
        r"anzctr\.org\.au|isrctn\.com|"
        r"clinical trials? registry|"
        r"registration number|"
        r"unique trial id)\b",
        re.IGNORECASE,
    ),
}


# Statements that are
# *mandatory* for clinical
# trial papers. We do not
# yet check whether the
# document is a clinical
# trial; for now we report
# all five categories as
# "missing" or "present".
REQUIRED = [
    "data_availability",
    "ethics_approval",
    "funding",
    "conflict_of_interest",
    "trial_registration",
]


class ComplianceStatementDetector:
    """Scan the document text
    for the five mandatory
    compliance statements."""

    name = "compliance"

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
        present: dict[str, list[str]] = {}
        for label, pat in _PATTERNS.items():
            hits = list(pat.finditer(text))
            if hits:
                # Capture the
                # first match as
                # evidence.
                present[label] = [
                    text[
                        max(0, m.start() - 30) : m.end() + 30
                    ]
                    for m in hits[:3]
                ]
        missing = [r for r in REQUIRED if r not in present]
        if not missing:
            return DetectorResult(
                detector=self.name,
                findings=[],
                ok=True,
            )
        # Build a finding per
        # missing category.
        findings: list[Finding] = []
        for label in missing:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="low",
                    title=(
                        f"Missing compliance "
                        f"statement: {label.replace('_', ' ')}"
                    ),
                    location="text",
                    evidence=json.dumps(
                        {
                            "category": label,
                            "present": sorted(present.keys()),
                            "missing": missing,
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )
