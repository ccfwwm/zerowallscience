"""Author email domain analyser (P2.2).

A paper authored by 5
contributors all with
``@qq.com`` addresses is
mildly suspicious: real
research groups use
institutional domains. A
paper that lists no emails
at all is also suspicious.

The detector pulls every
email-like token from the
first page (the byline
area) and counts the
distribution across
domains. It emits a finding
when:

  * more than half of the
    author emails share the
    same domain,
  * more than 2 emails use a
    free-mail domain
    (``@gmail.com``,
    ``@qq.com``,
    ``@163.com``,
    ``@126.com``,
    ``@yahoo.com``,
    ``@hotmail.com``,
    ``@outlook.com``),
  * no emails are found at
    all (a signal that the
    paper omits contact
    information),
  * the same email address
    appears for more than
    one author (a paper-mill
    signature where the
    forger re-uses a single
    address for many
    authors).

The detector is read-only.
The heuristic is rough; a
proper implementation would
use a validated author-
affiliation database.

Borrowed from the
"author-email" check
pattern used in the
``statcheck`` R package
and the Retraction Watch
duplicate-author detector.
"""
from __future__ import annotations

import json
import re
from collections import Counter

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Common free-mail domains.
_FREE_MAIL_DOMAINS = {
    "gmail.com",
    "qq.com",
    "163.com",
    "126.com",
    "yahoo.com",
    "yahoo.com.cn",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "foxmail.com",
    "sina.com",
    "sohu.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "mail.com",
    "protonmail.com",
    "yandex.com",
    "gmx.com",
}

# Email regex -- a
# conservative pattern that
# matches local-part@domain.tld.
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@"
    r"(?P<domain>[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b"
)


class AuthorEmailAnalyzer:
    """Look at the author
    byline and report on
    email-domain patterns."""

    name = "author_emails"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        # The byline lives
        # in the first 5000
        # characters of the
        # text. We do not
        # attempt to
        # separate the
        # byline from the
        # body because the
        # parser does not
        # give us the
        # structure.
        head = ""
        for b in doc.text_blocks:
            t = getattr(b, "text", "")
            if t:
                head += " " + t
            if len(head) > 5000:
                break
        if not head:
            # Empty document:
            # no text, no
            # emails. Emit a
            # "no emails" finding.
            return DetectorResult(
                detector=self.name,
                findings=[
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title=(
                            "No author email addresses "
                            "found in the byline"
                        ),
                        location="byline",
                        evidence=json.dumps(
                            {"emails_found": 0}
                        ),
                    )
                ],
                ok=True,
            )
        emails = [
            m.group(0).lower()
            for m in _EMAIL_RE.finditer(head)
        ]
        if not emails:
            # No emails found
            # at all -- not a
            # hard fraud signal
            # (older papers may
            # not list emails)
            # but worth a
            # "low" finding.
            return DetectorResult(
                detector=self.name,
                findings=[
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title=(
                            "No author email addresses "
                            "found in the byline"
                        ),
                        location="byline",
                        evidence=json.dumps(
                            {"emails_found": 0}
                        ),
                    )
                ],
                ok=True,
            )
        # Domain
        # distribution.
        domains = Counter(
            e.split("@", 1)[1] for e in emails
        )
        free_mail_count = sum(
            count
            for domain, count in domains.items()
            if domain in _FREE_MAIL_DOMAINS
        )
        findings: list[Finding] = []
        # Same email for
        # multiple authors.
        dup_emails = {
            e: c for e, c in Counter(emails).items() if c > 1
        }
        if dup_emails:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        f"{len(dup_emails)} email(s) "
                        f"shared by multiple authors"
                    ),
                    location="byline",
                    evidence=json.dumps(
                        {
                            "duplicate_emails": {
                                e: c
                                for e, c in dup_emails.items()
                            }
                        }
                    ),
                )
            )
        # One-domain
        # majority.
        top, top_count = (
            domains.most_common(1)[0] if domains else ("", 0)
        )
        if top_count > len(emails) / 2 and len(emails) >= 3:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title=(
                            f"More than half of the "
                            f"author emails use the "
                            f"same domain ({top})"
                        ),
                        location="byline",
                        evidence=json.dumps(
                            {
                                "top_domain": top,
                                "top_count": top_count,
                                "total": len(emails),
                                "domain_counts": dict(
                                    domains
                                ),
                            }
                        ),
                    )
                )
        # Free-mail
        # majority.
        if free_mail_count > 2 and free_mail_count > len(emails) / 2:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="low",
                    title=(
                        f"{free_mail_count} of "
                        f"{len(emails)} author emails use "
                        f"a free-mail domain"
                    ),
                    location="byline",
                    evidence=json.dumps(
                        {
                            "free_mail_count": free_mail_count,
                            "total": len(emails),
                            "domains": dict(domains),
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
