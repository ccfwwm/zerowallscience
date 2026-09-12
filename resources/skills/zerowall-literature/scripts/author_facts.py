#!/usr/bin/env python3
"""author_facts.py — ZeroWall Literature author-profile extraction kernel.

Why this module exists
----------------------
Author profiles were previously extracted with a fixed regex table hard-coded
inside the executor.  That fails the basic requirement "是啥就是啥": a person
can hold a role or an honour that no table anticipates, and the table silently
returns nothing instead of reporting what the page actually says.

Measured on P002, three independent failure modes all came from the table:

  * a first author was a **Chief Resident** on his department's page — the table
    had no clinical-training ranks, so the profile came back empty even though
    the page had been fetched and correctly identity-gated;
  * honours and appointments were searched with separate patterns, so a page
    that stated them in ordinary prose ("recipient of the ... Award", "serves
    as ... Editor") yielded nothing;
  * a truncated fragment ("President of The") was emitted as a fact.

This module replaces the closed table with three layers, in order:

  1. **Vocabulary + context grammar** (primary).  A curated list of role nouns,
     award nouns and office nouns is combined with grammatical cues — "is a
     <role> at", "serves as", "recipient of", "named <role>", "appointed" —
     so any wording the vocabulary recognises is accepted in any sentence
     shape, not just the two the old patterns happened to encode.
  2. **Generic noun-phrase capture** (fallback).  Any capitalised phrase that
     ends in an award/office head noun ("... Award", "... Medal", "Editor of
     ...") is accepted even when the vocabulary does not list it, because the
     head noun is the reliable signal, not the specific name.
  3. **Locality gate**.  Extraction only ever runs on the text window that
     contains the author's own given+surname, so a colleague's award on a
     shared directory page cannot leak into this record.

Everything a caller needs is exported through :func:`extract_author_facts`,
which also reports *which* sentences produced each fact so a reviewer can
audit a profile instead of trusting it.

The module deliberately has no third-party dependencies and never performs
network I/O: callers pass page text in.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable

__all__ = [
    "extract_author_facts",
    "extract_profile_title",
    "extract_fact_list",
    "name_keys",
    "normalize_key",
    "window_for_author",
    "FACT_KINDS",
]

# ── Text helpers ──────────────────────────────────────────────────────────────


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_key(value: Any) -> str:
    """Fold a name or phrase to bare alphanumerics for tolerant comparison.

    Profile pages spell the same person many ways ("Yi‐Jen Hung" with a Unicode
    hyphen, "William Ramses Bishai" against OpenAlex's "William R. Bishai"), so
    both sides of every comparison go through this.
    """
    folded = unicodedata.normalize("NFKD", clean(value))
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", folded.lower())


def name_keys(full_name: str, surname: str = "") -> list[str]:
    """Comparison keys for a person: concatenated "given+surname", longest first.

    Concatenating (rather than keeping the space) makes the key insensitive to
    whether the page writes "Mohammed Yaman Al Matni" or "Al Matni, Mohammed Y."
    A page whose text is folded the same way always contains the key, which is
    what the locality gate needs.
    """
    parts = [p for p in re.split(r"[\s,]+", clean(full_name)) if p]
    keys: list[str] = []
    if len(parts) >= 2:
        given, last = parts[:-1], parts[-1]
        keys.append(normalize_key("".join(given) + last))
        for token in given:
            keys.append(normalize_key(token + last))
    if not keys and surname:
        keys.append(normalize_key(surname))
    seen: set[str] = set()
    ordered: list[str] = []
    for key in sorted([k for k in keys if len(k) >= 5], key=len, reverse=True):
        if key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def _sentence_spans(text: str) -> list[tuple[int, int]]:
    """Character spans of sentence-ish units.

    A page is split once and windows are then expanded to whole spans, so an
    award phrase is never cut in half ("... University of Christopher M").
    """
    spans: list[tuple[int, int]] = []
    start = 0
    for match in re.finditer(r"[.;:!?]\s+|\n{2,}|\s{3,}", text):
        end = match.end()
        if end - start >= 2:
            spans.append((start, end))
        start = end
    if len(text) - start >= 2:
        spans.append((start, len(text)))
    return spans


def window_for_author(text: str, full_name: str, surname: str = "",
                      radius: int = 1500, max_windows: int = 3) -> str:
    """Text around the author's own name, expanded to whole words.

    A department directory page lists many people; without this gate a
    namesake's award becomes this author's award.  Two lessons shaped this:

    * a raw character-radius cut split a long sentence in half, so the extractor
      reported "... University of Christopher M" as an honour — boundaries are
      therefore snapped to whitespace, never to a mid-word offset;
    * splitting by sentence alone was too narrow on pages that pack a whole
      biography into one long line, so the window expands by characters and then
      grows outward to the enclosing sentence ends when it can.
    """
    if not text:
        return ""
    # Build the folded comparison text together with a map back to original
    # character offsets.  Using an index from ``normalize_key(text)`` directly
    # against the original text is invalid because normalization removes every
    # space and punctuation mark.  On a long bilingual profile the resulting
    # window landed hundreds of characters away from the author's name and cut
    # out ranks/sections that were visibly present on the page.
    folded_chars: list[str] = []
    original_offsets: list[int] = []
    for original_index, char in enumerate(text):
        normalized = unicodedata.normalize("NFKD", char)
        normalized = "".join(c for c in normalized if not unicodedata.combining(c))
        for candidate in normalized.lower():
            if re.match(r"[a-z0-9\u4e00-\u9fff]", candidate):
                folded_chars.append(candidate)
                original_offsets.append(original_index)
    folded = "".join(folded_chars)
    if not folded:
        return text
    folded_hits: list[int] = []
    for key in name_keys(full_name, surname):
        start = 0
        while True:
            idx = folded.find(key, start)
            if idx < 0:
                break
            folded_hits.append(idx)
            start = idx + len(key)
        if folded_hits:
            break
    hits = [original_offsets[idx] for idx in folded_hits if idx < len(original_offsets)]
    if not hits and (full_name or surname):
        parts = [p for p in re.split(r"[\s,]+", clean(full_name)) if p]
        if len(parts) >= 2:
            pattern = re.compile(re.escape(parts[0]) + r"[^A-Za-z]{0,4}" + re.escape(parts[-1]), re.I)
            hits = [m.start() for m in pattern.finditer(text)]
    if not hits:
        return text

    # Take ONE contiguous region around the FIRST name hit.  Collecting a
    # window per hit and concatenating them cut phrases that straddled two
    # ranges ("Kenneth M." in one, "Singer Endowed Professor" in the next), so a
    # single block is both simpler and lossless.  The block is then widened
    # outward on sentence boundaries while the total stays within a budget.
    anchor = hits[0]
    start = max(0, anchor - radius)
    end = min(len(text), anchor + radius)
    while start > 0 and not text[start - 1].isspace():
        start -= 1
    while end < len(text) and not text[end].isspace():
        end += 1
    left = max(text.rfind(". ", max(0, start - 300), anchor),
               text.rfind("\n", max(0, start - 300), anchor))
    if left >= 0:
        start = left + 1
    right = text.find(". ", anchor, min(len(text), end + 300))
    if right >= 0:
        end = right + 1
    # Extend forward to include a trailing profile block when the anchor sits in
    # a page header/navigation band (as on department directory pages), while
    # keeping the total bounded so an unrelated colleague's entry stays out.
    tail = text[end:end + radius]
    if tail and not re.search(r"(?:professor|director|honou?r|award|editor|"
                              r"chair|fellow|research|department|institute)",
                              text[start:end], re.I):
        end = min(len(text), end + radius)
    return text[start:end]


# ── §1 Vocabulary ─────────────────────────────────────────────────────────────
#
# Highest rank first: the first role noun matched in the author's own window is
# reported as current_title, so ordering encodes seniority.  The list is
# intentionally broader than any single person needs — a profile must be able to
# say "Resident" or "Engineer" when that is what the page says.

_ROLE_VOCABULARY: list[tuple[str, str]] = [
    # Professorial ranks
    (r"professor\s+emerit(?:us|a)", "荣誉退休教授(Professor Emeritus)"),
    (r"(?:university\s+|institute\s+|research\s+)?distinguished\s+professor",
     "特聘教授(Distinguished Professor)"),
    (r"regents?\s+professor", "校董讲席教授(Regents Professor)"),
    (r"(?:named|endowed|chaired|chair)\s+profess(?:or|orship)", "讲席教授(Chair Professor)"),
    (r"university\s+professor", "校级教授(University Professor)"),
    (r"clinical\s+professor", "临床教授(Clinical Professor)"),
    (r"research\s+professor", "研究教授(Research Professor)"),
    (r"teaching\s+professor", "教学教授(Teaching Professor)"),
    (r"adjunct\s+professor", "兼职教授(Adjunct Professor)"),
    (r"visiting\s+professor", "访问教授(Visiting Professor)"),
    (r"emerit(?:us|a)\s+professor", "荣誉退休教授(Emeritus Professor)"),
    (r"full\s+professor", "正教授(Full Professor)"),
    (r"associate\s+professor|assoc\.?\s+professor", "副教授(Associate Professor)"),
    (r"assistant\s+professor|asst\.?\s+professor", "助理教授(Assistant Professor)"),
    (r"reader\s+in\s+[A-Z]", "准教授(Reader)"),
    (r"senior\s+lecturer", "高级讲师(Senior Lecturer)"),
    (r"principal\s+lecturer", "首席讲师(Principal Lecturer)"),
    (r"associate\s+lecturer", "副讲师(Associate Lecturer)"),
    (r"lecturer", "讲师(Lecturer)"),
    (r"professor", "教授(Professor)"),
    # Clinical ranks, including training grades: a first author on a clinical
    # paper is very often a trainee and their own page says so.
    (r"chief\s+(?:of\s+)?(?:resident|residents)|chief\s+resident", "总住院医师(Chief Resident)"),
    (r"attending\s+(?:physician|surgeon)", "主治医师(Attending Physician)"),
    (r"(?:internal\s+medicine|general\s+surgery|surgical|clinical|medical|"
     r"research|teaching|family\s+medicine|pediatric|psychiatry|neurology|"
     r"radiology|anesthesiology|pathology)\s+resident", "住院医师(Resident)"),
    (r"resident\s+physician", "住院医师(Resident)"),
    (r"(?:clinical|research|postdoctoral|post-?doc(?:toral)?|medical)\s+fellow",
     "专科医师(Fellow)"),
    (r"house\s+officer|intern\b", "实习医师(Intern)"),
    (r"senior\s+consultant", "高级顾问医师(Senior Consultant)"),
    (r"consultant\s+(?:physician|surgeon)", "顾问医师(Consultant)"),
    (r"registrar\b", "专科培训医师(Registrar)"),
    (r"resident\b", "住院医师(Resident)"),
    (r"nurse\s+practitioner", "执业护师(Nurse Practitioner)"),
    (r"physician\s+assistant", "医师助理(Physician Assistant)"),
    (r"research\s+(?:assistant\s+)?nurse", "研究护士(Research Nurse)"),
    # Research / academic staff
    (r"chief\s+(?:scientist|researcher|technology\s+officer)|chief\s+scientific\s+officer",
     "首席研究员(Chief Scientist)"),
    (r"senior\s+principal\s+(?:research\s+)?scientist", "资深首席研究员(Senior Principal Scientist)"),
    (r"senior\s+(?:research\s+)?scientist", "高级研究员(Senior Scientist)"),
    (r"research\s+scientist|staff\s+scientist|scientist\b", "研究员(Scientist)"),
    (r"senior\s+research\s+fellow", "高级研究员(Senior Research Fellow)"),
    (r"research\s+fellow|research\s+scholar", "研究员(Research Fellow)"),
    (r"post-?doc(?:toral)?\s+(?:fellow|researcher|associate)", "博士后(Postdoctoral Researcher)"),
    (r"principal\s+investigator", "PI(Principal Investigator)"),
    (r"group\s+leader|team\s+leader", "课题组长(Group Leader)"),
    (r"lab(?:oratory)?\s+manager", "实验室主管(Laboratory Manager)"),
    # Administrative / other careers
    (r"(?:department|section)\s+chair(?:man|person)?|chair\s+of\s+the\s+(?:department|division)",
     "系主任(Department Chair)"),
    (r"vice\s+(?:chancellor|president|provost|dean)", "副校长/副院长(Vice President)"),
    (r"chancellor|president\b|provost", "校长/院长(President)"),
    (r"associate\s+dean", "副院长(Associate Dean)"),
    (r"assistant\s+dean", "院长助理(Assistant Dean)"),
    (r"dean\b", "院长(Dean)"),
    (r"director\b|head\s+of\s+(?:the\s+)?(?:department|division|unit|program)",
     "主任/所长(Director)"),
    (r"manager\b|supervisor\b", "经理/主管(Manager)"),
    (r"editor(?:-in-chief)?\b", "编辑(Editor)"),
    (r"engineer\b", "工程师(Engineer)"),
    (r"statistician\b", "统计师(Statistician)"),
    (r"pharmacist\b", "药师(Pharmacist)"),
    (r"librarian\b", "馆员(Librarian)"),
    (r"technician\b", "技术员(Technician)"),
    (r"student\b|graduate\s+student|doctoral\s+(?:student|candidate)|ph\.?d\.?\s+(?:student|candidate)",
     "研究生(Graduate Student)"),
    # Chinese rank words (matched against Chinese page text)
    (r"主任医师", "主任医师"),
    (r"副主任医师", "副主任医师"),
    (r"主治医师", "主治医师"),
    (r"住院医师", "住院医师"),
    (r"特聘教授", "特聘教授"),
    (r"讲席教授", "讲席教授"),
    (r"副教授", "副教授"),
    (r"教授", "教授"),
    (r"研究员", "研究员"),
    (r"副研究员", "副研究员"),
    (r"助理研究员", "助理研究员"),
    (r"技师", "技师"),
]

# Grammatical cues that turn a sentence into a statement of role.  The role
# vocabulary supplies the noun; these supply the shapes ("X is a Y at Z",
# "serves as Y", "appointed Y"), so we are not limited to the sentence forms
# someone thought of in advance.
_ROLE_CUES = (
    r"is\s+(?:a|an|the)\s+", r"serves\s+as\s+(?:a|an|the)?\s*",
    r"works\s+as\s+(?:a|an|the)?\s*", r"currently\s+(?:a|an|the)\s+",
    r"appointed\s+(?:as\s+)?(?:a|an|the)?\s*", r"position\s+of\s+(?:a|an|the)?\s*",
    r"title\s+of\s+(?:a|an|the)?\s*", r"holds\s+the\s+(?:position|title)\s+of\s+",
    r"joined\s+as\s+(?:a|an|the)?\s*",
)

# ── §2 Honor and office head nouns ────────────────────────────────────────────
#
# The head noun is the reliable anchor: any capitalised phrase ending in
# "Award", "Medal", "Fellow", "Editor of ..." is a fact worth reporting even if
# nobody listed that particular prize in a regex.

_HONOR_HEADS = (
    "award", "awards", "prize", "prizes", "medal", "medals", "lectureship",
    "lectureships", "scholarship", "fellowship", "fellowships", "grant",
    "honorary", "honoris causa", "laureate", "distinction", "decoration",
    "academician", "fellow", "fellow of", "member of", "elected", "elected member",
    "named chair", "professorship", "endowed chair", "hall of fame",
)

_OFFICE_HEADS = (
    "editor-in-chief", "editor in chief", "associate editor", "deputy editor",
    "senior editor", "section editor", "guest editor", "managing editor",
    "editorial board", "editorial board member", "advisory board",
    "board member", "council member", "committee member", "committee chair",
    "president", "vice-president", "vice president", "past president",
    "chairman", "chairperson", "chair", "co-chair", "secretary", "treasurer",
    "director of", "head of", "dean of", "chief of", "president of",
    "convenor", "convener", "spokesperson", "chair of the",
)

_CN_HEAD_WORDS = ("院士", "杰青", "长江学者", "优青", "千人计划", "万人计划",
                  "国家杰出青年", "国家自然科学奖", "国家科技进步奖", "973首席",
                  "863计划", "主编", "副主编", "编委", "理事长", "副理事长",
                  "会长", "副会长", "主任委员", "荣誉", "奖", "津贴", "人才")

# Whole-string noise: discard when the candidate matches this.
_NOISE = re.compile(
    r"(?:h-index|impact\s+factor|read\s+\d+\s+publication|cited\s+by\s+\d|"
    r"researchgate\.net|scholar\.google|scopus|orcid\.org|pubmed|doi\.org|"
    r"cookie|privacy\s+policy|terms\s+of\s+use|sign\s+in|log\s+in|"
    r"back\s+to\s+top|skip\s+to\s+(?:main\s+)?content|"
    r"all\s+rights\s+reserved|©|\bwe\s+use\s+cookies\b|"
    r"^\s*(?:home|about|contact|search|menu|news|events|donate)\s*$)",
    re.I,
)

# A fact must not begin or end on a dangling connective or article.
_DANGLING = re.compile(
    r"(?:^|\b)(?:of|for|the|and|at|in|to|with|from|by|on|as|a|an|"
    r"de|del|della|von|van|der|und|et|y|i)$", re.I)

# Training and employment phrases use the same head nouns as honours
# ("fellow", "member") but are not awards.  Minson's "post-doctoral fellow at
# the Mayo Clinic in Minnesota" was reported as an honour until these were
# excluded.
_NOT_HONOR = re.compile(
    r"\b(?:post-?doc(?:toral)?|training|trained\s+as|intern|residency|resident|"
    r"clinical\s+fellow|research\s+fellow\s+at|faculty\s+member|staff\s+member|"
    r"team\s+member|member\s+of\s+the\s+(?:faculty|staff|team|department|division)|"
    r"joined|worked\s+at|employed|serves?\s+as|is\s+a|is\s+an)\b", re.I)

# Mid-word truncation happens when a regex starts inside a word
# ("i of the Mayo Clinic").  A fact must start at a word boundary with a
# capital or a digit.
_STARTS_CLEAN = re.compile(r"^(?:[A-Z0-9\u4e00-\u9fff]|\d)")

# Candidate capture stops at these, so a phrase never swallows the next clause.
_STOP_CHARS = r"[.;:!?|•·\n]"
# The same set as bare class *contents*, for use inside a negated class.
# Interpolating ``_STOP_CHARS`` there produced "[^[.;:!?|•·\n]]", a broken class
# that matched a literal "[" and made every prose cue ("recipient of …",
# "awarded the …") fail silently on English pages.
_STOP_CHARS_INNER = r".;:!?|•·\n"

_MIN_FACT_LEN = 4
_MAX_FACT_LEN = 140


def _tidy(value: str) -> str:
    value = clean(value)
    value = value.strip(" ,;:.-—–|/()[]{}'\"")
    value = re.sub(r"^(?:and|or|the|of|in|at|a|an)\s+", "", value, flags=re.I)
    value = re.sub(r"\s+(?:and|or|the|of|in|at|a|an)$", "", value, flags=re.I)
    # Close a parenthesis or bracket that the capture window cut in half, so a
    # real fact reads as the page wrote it ("... Award, Society (2018" became a
    # visibly truncated value in P004's report).
    for opener, closer in (("(", ")"), ("[", "]")):
        if value.count(opener) > value.count(closer):
            value = value + closer * (value.count(opener) - value.count(closer))
    return clean(value)


# Navigation headings and generic section labels contain an honour head noun but
# do not describe an award received by the author.  P004's University of Macau
# page exposed "Our award" in site navigation; an earlier extractor promoted it
# to a personal honour and the merge kept it across later runs.
_GENERIC_FACT_LABEL = re.compile(
    r"^(?:(?:our|the|my|his|her|their)\s+)?(?:award|awards|honou?rs?|"
    r"prizes?|medals?|recognition|achievements?|news|events?|"
    r"荣誉(?:奖励|称号)?|获奖(?:情况|荣誉)?|奖励(?:荣誉)?|学术任职|"
    r"社会兼职|学会任职|专业学会|编委|兼职情况)$",
    re.I,
)


def _acceptable(item: str) -> bool:
    if not (_MIN_FACT_LEN <= len(item) <= _MAX_FACT_LEN):
        return False
    if _GENERIC_FACT_LABEL.fullmatch(item.strip()):
        return False
    if _NOISE.search(item) or "http" in item.lower():
        return False
    if _DANGLING.search(item):
        return False
    if not _STARTS_CLEAN.match(item):
        return False
    if not re.search(r"[A-Za-z\u4e00-\u9fff]", item):
        return False
    # Require a real word, not a punctuation artifact.
    if not re.search(r"[A-Za-z\u4e00-\u9fff]{3,}", item):
        return False
    # A phrase that names a person inline usually means the capture ran across
    # two sentences ("... Award and a Faculty Innovator Award Christopher
    # Minson"); truncate at the second name instead of reporting it.
    return True


def _truncate_at_repeat(item: str) -> str:
    """Drop only a clearly appended person name from a long captured clause.

    The former rule removed *any* final two capitalised words.  That destroyed
    valid English facts such as ``Edwin Bierman Award`` (became ``Edwin``) and
    ``Associate Editor of Circulation Research``.  A cleanup is now attempted
    only for a long, multi-clause capture whose final pair is not itself an
    award, office, organisation, discipline or role phrase.
    """
    words = item.split()
    if len(words) < 8 or len(item) < 55:
        return item
    match = re.search(r"\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)\s*$", item)
    if not match:
        return item
    protected_tail = re.compile(
        r"(?:Award|Prize|Medal|Fellowship|Society|Association|Academy|University|"
        r"Institute|College|Hospital|Research|Medicine|Engineering|Sciences?|"
        r"Editor|Director|Chair|President|Professor|Physician)$", re.I)
    if protected_tail.search(match.group(2)):
        return item
    return item[:match.start()].strip()


def _dedupe(items: Iterable[str]) -> list[str]:
    """Deduplicate exact and nested renderings of the same fact.

    English pages often state one award twice: a list item says ``Recipient of
    the Edwin Bierman Award`` and a phrase matcher also finds the nested
    ``Edwin Bierman Award``.  Keep the more informative wording instead of
    presenting those as two honours.  Substring folding is only used for facts
    of meaningful length, so short role nouns never collapse unrelated items.
    """
    out: list[str] = []
    keys: list[str] = []
    for item in items:
        key = normalize_key(item)
        if not key:
            continue
        duplicate = False
        for index, existing in enumerate(keys):
            if key == existing:
                duplicate = True
                break
            if min(len(key), len(existing)) >= 10 and (key in existing or existing in key):
                if len(key) > len(existing):
                    out[index] = item
                    keys[index] = key
                duplicate = True
                break
        if duplicate:
            continue
        keys.append(key)
        out.append(item)
    return out


# ── §3 Title extraction ───────────────────────────────────────────────────────

# Rank words are *recognised* generically rather than enumerated: any phrase
# built from these head nouns is a job title, whatever the institution calls it.
# The closed vocabulary above stays only as a normalising fallback, so a title
# the list never anticipated is still reported verbatim ("是啥就是啥").
_TITLE_HEAD_CN = (
    "教授", "研究员", "医师", "技师", "讲师", "工程师", "主任", "副主任", "院长",
    "副院长", "系主任", "所长", "校长", "副校长", "组长", "护师", "药师", "统计师",
    "博士后", "研究生", "站长", "总监", "顾问", "专家",
)
_TITLE_HEAD_EN = (
    "professor", "lecturer", "reader", "scientist", "researcher", "fellow",
    "investigator", "physician", "surgeon", "resident", "registrar", "intern",
    "consultant", "director", "dean", "chair", "chairman", "chairperson",
    "president", "provost", "chancellor", "head", "chief", "manager",
    "supervisor", "engineer", "statistician", "pharmacist", "librarian",
    "technician", "nurse", "practitioner", "associate", "assistant",
    "coordinator", "specialist", "officer", "leader", "analyst",
)
# Chinese supervisor/qualification lines that accompany a rank on faculty pages.
_TITLE_QUALIFIER_CN = ("博士生导师", "硕士生导师", "博导", "硕导")

# A verbatim title must not be a sentence, a navigation label, or prose.
_TITLE_REJECT = re.compile(
    r"(?:https?://|@|\bcookie\b|\bmenu\b|\bsearch\b|\blogin\b|\blog in\b|"
    r"版权|登录|首页|返回|导航|个人简介|联系方式|电子邮箱|邮箱|电话|"
    r"\bemail\b|\bphone\b|\bcontact\b|\bhome\b|\bpublications?\b)", re.I)


# Contexts that describe PAST training or SOMEBODY ELSE, not the current rank.
# A faculty page's "个人经历" block lists former posts ("浙江大学博士后") and names
# advisors ("合作导师：刘玉生教授"); reading a rank out of either states the wrong
# job, so those spans are demoted rather than trusted.
_TITLE_HISTORY_SECTION = re.compile(
    r"(个人经历|教育经历|工作经历|学习经历|求学经历|工作简历|履历|经历|"
    r"education|training|employment\s+history|previous\s+positions?|"
    r"work\s+experience|professional\s+experience|career\s+history)", re.I)
_TITLE_ADVISOR = re.compile(r"(导师|指导教师|supervisor|advisor|mentor)\s*[:：]?\s*$")
_TITLE_PERSON_NAME = re.compile(r"^[\u4e00-\u9fff]{2,4}(?:教授|老师|研究员|院士)$")


def _title_context_penalty(text: str, start: int) -> int:
    """How much to distrust a rank found at ``start``.

    Position alone is not enough: a bilingual page repeats its heading, so the
    decisive signal is whether the rank sits inside a history section or right
    after an advisor label.
    """
    before = text[max(0, start - 40):start]
    if _TITLE_ADVISOR.search(before):
        return 99
    head = text[:start]
    last_history = None
    for match in _TITLE_HISTORY_SECTION.finditer(head):
        last_history = match
    if last_history is not None and start - last_history.end() < 1500:
        return 6
    return 0


def _labelled_title_candidates(text: str) -> list[tuple[int, str]]:
    """Titles the page itself labels as a position field.

    Any layout that says "职称：副教授", "职务: 科室主任" or "Position: Attending
    Physician" is telling us the answer directly, in its own words.  Reading the
    label is site-independent, which is the point: no per-university rule, and
    no closed rank table deciding what a title may be.
    """
    out: list[tuple[int, str]] = []
    if not text:
        return out
    label = (r"(?:职称|职务|职位|现任职务|现任职称|岗位|当前职位|"
             r"Position|Title|Job\s*Title|Academic\s*Title|Rank|Appointment)")
    for match in re.finditer(rf"{label}\s*[:：]\s*([^\n]{{2,90}})", text, re.I):
        item = _tidy(match.group(1))
        item = re.split(r"[；;。|]", item)[0].strip()
        if not item or _TITLE_REJECT.search(item):
            continue
        if not re.search(r"[A-Za-z\u4e00-\u9fff]{2,}", item):
            continue
        out.append((12, item[:90]))
    return out


def _verbatim_title_candidates(text: str) -> list[tuple[int, str]]:
    """Job titles exactly as the page words them, scored (higher is better).

    Reading the page's own wording is what makes this generic: every
    institution names ranks differently, and a fixed table silently returns
    nothing for anything it does not list.  Candidates are short phrases built
    around a rank head noun, kept in the page's own language and order.
    """
    out: list[tuple[int, str]] = _labelled_title_candidates(text)
    if not text:
        return out

    # Chinese pages print the rank as its own short field, often stacked with
    # supervisor qualifications: "马金连 副教授 博士生导师 硕士生导师".
    cn_head = "|".join(re.escape(h) for h in
                       sorted(_TITLE_HEAD_CN, key=len, reverse=True))
    for match in re.finditer(rf"[\u4e00-\u9fff]{{0,12}}(?:{cn_head})", text):
        item = _tidy(match.group(0))
        if not item or len(item) > 24 or _TITLE_REJECT.search(item):
            continue
        # "刘玉生教授" in "合作导师：刘玉生教授" is an advisor's rank, not this
        # person's; a personal-name-plus-rank token is only a title when the page
        # is not naming somebody else.
        penalty = _title_context_penalty(text, match.start())
        if penalty >= 99:
            continue
        if _TITLE_PERSON_NAME.match(item):
            penalty += 4
        score = 6 if match.start() < 400 else 3
        score += 1 if len(item) >= 3 else 0
        out.append((score - penalty, item))
    for word in _TITLE_QUALIFIER_CN:
        if word in text:
            out.append((2, word))

    # English pages state the rank as a capitalised phrase, usually followed by
    # "of/in/at <unit>".  Keep the unit: "Associate Professor of Radiology" is
    # more informative than "Professor".
    en_head = "|".join(re.escape(h) for h in
                       sorted(_TITLE_HEAD_EN, key=len, reverse=True))
    # Only the rank head is case-insensitive.  Applying re.I to the entire
    # expression made ``[A-Z]`` accept ordinary lowercase prose, so a sentence
    # fragment such as "is a Full professor in the school ..." became a title.
    # Horizontal whitespace is intentional: separate stacked fields
    # ("Professor\nDirector") are two roles, not one title phrase.
    pattern = re.compile(
        rf"\b((?:[A-Z][\w'’\-]*[ \t]+){{0,3}}(?i:{en_head})"
        rf"(?:[ \t]+(?i:of|in|for|at)[ \t]+(?:(?i:the)[ \t]+)?"
        rf"(?:[A-Z][\w'’&\-]*(?:[ \t]+(?:[A-Z][\w'’&\-]*|of|and|the)){{0,4}}))?)\b")
    for match in pattern.finditer(text):
        item = _tidy(match.group(1))
        if not item or _TITLE_REJECT.search(item):
            continue
        if not (4 <= len(item) <= 90):
            continue
        if _DANGLING.search(item):
            continue
        penalty = _title_context_penalty(text, match.start())
        if penalty >= 99:
            continue
        # A page states its subject's rank in title case near the top
        # ("Associate Professor"), while running prose mentions activities in
        # lower case ("director of the Chinese Music Ensemble", "fellow at the
        # Mayo Clinic").  Case is therefore a real signal, not cosmetics: the
        # regex is case-insensitive so nothing is missed, and scoring decides.
        title_case = bool(re.match(r"^(?:[A-Z][\w'’\-]*)(?:\s+(?:[A-Z][\w'’&\-]*|of|in|for|at|and|the))*$",
                                   item))
        score = 5 if match.start() < 600 else 2
        score += 2 if title_case else -2
        score += 1 if re.search(r"\b(?:of|in|at|for)\b", item) else 0
        out.append((score - penalty, item))

    ordered: list[tuple[int, str]] = []
    seen: set[str] = set()
    for score, item in sorted(out, key=lambda pair: -pair[0]):
        key = normalize_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append((score, item))
    return ordered


def extract_profile_title(text: str, extra_text: str = "", full_name: str = "",
                          surname: str = "") -> str:
    """The role the page states about THIS author, in the page's own words.

    Order of preference, learned from measurement:

    * **verbatim** wording from the author's own window, because a closed table
      cannot cover every institution's ranks and returns nothing when it misses
      (a Shandong faculty page states "副教授 博士生导师"; a hospital page states
      "Attending Physician, Division of Cardiology");
    * the curated vocabulary as a *fallback*, which also supplies a bilingual
      normalisation for the common ranks;
    * ``extra_text`` (search snippets) last, when the page said nothing.
    """
    blob = text or ""
    if full_name or surname:
        blob = window_for_author(blob, full_name, surname) or blob
    blob = f"{blob} {extra_text or ''}"
    if not blob.strip():
        return ""

    verbatim = _verbatim_title_candidates(blob)
    best_vocab = ""
    for pattern, label in _ROLE_VOCABULARY:
        if re.search(rf"(?:{pattern})", blob, re.I):
            best_vocab = label
            break

    # A bilingual profile is read as one document, so both language versions
    # compete.  The local-language rank ("副教授") is the institution's own
    # statement, while the English mirror often renders only the supervisor
    # qualification ("Supervisor of Doctorate Candidates").  Prefer a rank in
    # the page's dominant script when both are present.
    if verbatim:
        cjk = len(re.findall(r"[\u4e00-\u9fff]", blob))
        if cjk >= 80:
            top_score = verbatim[0][0]
            local = [(score, item) for score, item in verbatim
                     if re.search(r"[\u4e00-\u9fff]", item)
                     and item not in _TITLE_QUALIFIER_CN
                     and score >= top_score - 2]
            if local:
                verbatim = local + [pair for pair in verbatim if pair not in local]

    if verbatim:
        top_score, top_item = verbatim[0]
        # Chinese pages stack rank and supervisor qualifications as separate
        # fields; report them together the way the page presents them.
        if re.search(r"[\u4e00-\u9fff]", top_item):
            extras = [item for _, item in verbatim[1:]
                      if item in _TITLE_QUALIFIER_CN and item not in top_item]
            if extras:
                top_item = "，".join([top_item] + extras[:2])
        # The page's own wording wins whenever it is a confident match.  The
        # curated label is only a fallback for weak, bare matches, so a title
        # nobody enumerated ("医学人工智能平台主管兼首席算法科学家") survives
        # instead of being replaced by a generic vocabulary entry.
        if top_score >= 3 or not best_vocab:
            return top_item

    if best_vocab:
        return best_vocab
    if extra_text:
        for score, item in _verbatim_title_candidates(extra_text):
            if score >= 3:
                return item
    return ""


# ── §4 Honours and appointments ───────────────────────────────────────────────


# Navigation / boilerplate text that surrounds a real fact on a web page.
_NAV = re.compile(
    r"(?:skip\s+to|cookie|privacy|sign\s+in|log\s+in|menu|search\s+this\s+site|"
    r"all\s+rights\s+reserved|email:|phone:|office:|research\s+interests:|"
    r"download\s+cv|website:|read\s+more|view\s+profile|apply\s+now|"
    r"register|submit\s+abstract|browse\s+all)", re.I)


def _cn_section_facts(text: str) -> list[tuple[str, str]]:
    """Chinese honour/office facts, found by section heading or by sentence cue.

    Chinese faculty pages almost never contain the word "Award", so the English
    head-noun capture returns nothing for them — which is why honours came back
    empty for every Chinese author.  Two generic signals work across sites
    without hard-coding any single university's layout:

    * a **section heading** ("荣誉称号"、"获奖情况"、"社会兼职"、"学术兼职" …) is
      followed by that section's items until the next heading;
    * a **sentence cue** ("获…奖"、"入选…计划"、"担任…委员"、"兼任…主编") states the
      fact inline in a biography paragraph.

    Both return the page's own wording, so an honour nobody enumerated in a
    vocabulary is still reported.
    """
    out: list[tuple[str, str]] = []
    if not re.search(r"[\u4e00-\u9fff]", text):
        return out

    heading = re.compile(
        r"(荣誉称号|荣誉奖励|获奖情况|获奖荣誉|奖励荣誉|荣誉|获奖|奖励|表彰|"
        r"人才称号|人才计划|社会兼职|学术兼职|学术任职|社会服务|学会任职|"
        r"编委|兼职情况|专业学会|学术组织)")
    stops = re.compile(
        r"(个人简介|个人经历|研究方向|科研方向|科研项目|主要论文|发表论文|论文著作|"
        r"专利著作|专利|著作|教学|团队成员|招生|联系方式|电子邮箱|返回|登录|首页|版权)")
    for match in heading.finditer(text):
        # Sections are bounded by the NEXT heading, a following blank-ish break,
        # or an unrelated section label.  Reading to a fixed character budget
        # merged "荣誉奖励" with the following "学术任职" block and produced facts
        # that spanned both, so the boundary is structural, not a length guess.
        tail = text[match.end():match.end() + 1200]
        stop = stops.search(tail)
        if stop:
            tail = tail[:stop.start()]
        next_head = heading.search(tail, 1)
        if next_head:
            tail = tail[:next_head.start()]
        for piece in re.split(r"[；;。\n•·|]|\s{2,}|(?<=\d)[、,]", tail):
            item = _tidy(piece)
            if not item or not re.search(r"[\u4e00-\u9fff]{2,}", item):
                continue
            if len(item) > 90:
                item = item[:90]
            section_kind = ("office" if re.search(
                r"兼职|任职|服务|学会|组织|编委|委员会", match.group(1)) else "honor")
            out.append((item, f"[[SECTION_{section_kind.upper()}]] {match.group(1)}：{item}"))

    cues = (
        r"获(?:得)?[^，。；;\n]{0,40}?(?:奖|奖励|荣誉|称号|基金|资助|表彰)",
        r"荣获[^，。；;\n]{0,40}",
        r"入选[^，。；;\n]{0,40}?(?:计划|工程|人才|项目|库)",
        r"被授予[^，。；;\n]{0,40}",
        r"(?:担任|兼任|任)[^，。；;\n]{0,40}?"
        r"(?:主编|副主编|编委|审稿人|理事长|副理事长|常务理事|理事|会长|副会长|"
        r"秘书长|主任委员|副主任委员|committee|委员|专家|顾问)",
        r"(?:中国|国家|教育部|省|市)[^，。；;\n]{0,24}?(?:学会|协会|委员会)"
        r"[^，。；;\n]{0,20}?(?:理事|委员|主编|会长|副会长|秘书长)",
    )
    for cue in cues:
        for match in re.finditer(cue, text):
            item = _tidy(match.group(0))
            if item and re.search(r"[\u4e00-\u9fff]{2,}", item):
                out.append((item, text[max(0, match.start() - 60):match.end() + 60]))
    return out


_SECTION_HONOR_LABEL = re.compile(
    r"(honors?|awards?|prizes?|medals?|distinctions?|recognitions?|fellowships?|"
    r"grants?|荣誉|获奖|奖励|表彰|称号|人才)", re.I)
_SECTION_OFFICE_LABEL = re.compile(
    r"(service|activities|memberships?|affiliations?|appointments?|editorial|"
    r"committees?|leadership|societ|兼职|任职|服务|编委|学会|协会|委员)", re.I)


def _en_section_facts(text: str) -> list[tuple[str, str]]:
    """English honour/office facts taken from the page's own section headings.

    The phrase-level captures below read running prose.  A great many faculty
    pages instead present these facts as a **list under a heading**:

        Honors and Awards
        Edwin Bierman Award, American Diabetes Association
        Professional Service
        Associate Editor, Circulation Research

    With one item per line there is no sentence, no cue verb and no boundary
    punctuation, so prose capture returns nothing — this was why English honours
    stayed empty even on pages that clearly listed them.  Heading detection is
    generic (any of the usual section words, however the site words them), and
    the section ends at the next heading, so no per-site layout is encoded.
    """
    out: list[tuple[str, str]] = []
    if not text:
        return out
    heading = re.compile(
        r"^\s*(honors?(?:\s*(?:and|&)\s*awards?)?|awards?(?:\s*(?:and|&)\s*honors?)?|"
        r"prizes?|distinctions?|recognitions?|fellowships?|grants?\s*(?:and|&)\s*awards?|"
        r"professional\s+(?:service|activities|memberships?|affiliations?)|"
        r"academic\s+(?:service|appointments?|activities)|"
        r"editorial\s+(?:board|activities|service)|"
        r"service(?:\s*(?:and|&)\s*outreach)?|memberships?|"
        r"societ(?:y|ies)\s+(?:membership|service)|committees?|"
        r"leadership(?:\s+(?:roles?|positions?))?|appointments?)"
        r"\s*[:：]?\s*$", re.I)
    other = re.compile(
        r"^\s*(publications?|selected\s+publications?|research(?:\s+interests?)?|"
        r"biography|education|training|teaching|courses?|patents?|grants?|"
        r"funding|contact|news|students?|lab(?:oratory)?\s+members?|"
        r"presentations?|books?|media)\s*[:：]?\s*$", re.I)

    lines = text.split("\n")
    for index, line in enumerate(lines):
        if not heading.match(line):
            continue
        label = _tidy(line)
        for follow in lines[index + 1:index + 26]:
            item = _tidy(follow)
            if not item:
                continue
            if heading.match(follow) or other.match(follow):
                break
            # A section body line is a fact; long prose paragraphs are left to
            # the sentence-level captures.
            if not (4 <= len(item) <= 160):
                continue
            if not re.search(r"[A-Za-z\u4e00-\u9fff]{3,}", item):
                continue
            out.append((item, f"[[SECTION_{'OFFICE' if _SECTION_OFFICE_LABEL.search(label) and not re.search(r'honou?rs?|awards?|prizes?|medals?', label, re.I) else 'HONOR'}]] {label}: {item}"))
    return out


def _candidate_phrases_with_context(text: str) -> list[tuple[str, str]]:
    """Award-shaped and office-shaped phrases, each with a little context.

    Context is returned so the scorer can penalise phrases that only look like
    facts because they sit inside page chrome.
    """
    out: list[tuple[str, str]] = []
    head_alt = "|".join(re.escape(h) for h in
                        sorted(set(_HONOR_HEADS) | set(_OFFICE_HEADS), key=len, reverse=True))
    boundary = (rf"(?:^|[.;:!?|•·]\s|\s(?:and|or|of|the|a|an|received|awarded|won|"
                rf"earned|holds|was|is|as|his|her|their|its|named|elected)\s+)")
    name_run = (r"(?:[A-Z][\w'’&.\-]*"
                r"(?:\s+(?:[A-Z][\w'’&.\-]*|of|the|for|and|in|de|del|von|van)){0,7})")

    # (a) Capitalised run before a head noun: "Edwin Bierman Award".
    for match in re.finditer(rf"{boundary}({name_run}\s+(?:{head_alt}))\b", text):
        out.append((match.group(1), text[max(0, match.start() - 120):match.end() + 60]))
    # (b) Head noun plus a proper-noun phrase: "Fellow of the Royal Society".
    for match in re.finditer(
            rf"\b({head_alt})\b\s+(?:of|for|in|at)\s+"
            rf"((?:the\s+)?(?:[A-Z][\w'’&.\-]*|of|and|for)"
            rf"(?:\s+(?:[A-Z][\w'’&.\-]*|of|and|for)){{0,6}})", text):
        phrase = f"{match.group(1).title()} of {match.group(2)}"
        out.append((phrase, text[max(0, match.start() - 120):match.end() + 60]))
    # (c) Statement cues in prose: "recipient of ...", "serves as ...".
    for cue in (r"recipient\s+of\s+(?:the\s+)?", r"awarded\s+(?:the\s+)?",
                r"received\s+(?:the\s+)?", r"honou?red\s+with\s+(?:the\s+)?",
                r"inducted\s+into\s+(?:the\s+)?", r"named\s+(?:as\s+)?(?:a\s+|an\s+)?",
                r"serves?\s+as\s+(?:a\s+|an\s+|the\s+)?",
                r"appointed\s+(?:as\s+)?(?:a\s+|an\s+|the\s+)?",
                r"holds?\s+(?:the\s+)?(?:position|title|role)\s+of\s+(?:a\s+|an\s+|the\s+)?"):
        for match in re.finditer(cue + rf"([^{_STOP_CHARS_INNER}]{{4,120}})", text, re.I):
            out.append((match.group(1), text[max(0, match.start() - 120):match.end() + 60]))
    # (d) Chinese honours need no capitalisation and no English boundary.  The
    # class excludes newlines as well, so a wildcard can never run from one
    # section into the next ("…一等奖 青年科技创新领军人才 学术任职 …" used to be
    # captured as one fact because the page's line breaks were ignored).
    for word in _CN_HEAD_WORDS:
        for match in re.finditer(
                rf"[^，。；,;|\n]{{0,24}}{re.escape(word)}[^，。；,;|\n]{{0,24}}", text):
            out.append((match.group(0), text[max(0, match.start() - 60):match.end() + 30]))
    # (e) Section headings in either language, which carry the honours and
    # academic offices that the prose captures above cannot see when a page
    # presents them as a bare list under a heading.
    out.extend(_en_section_facts(text))
    out.extend(_cn_section_facts(text))
    return out


def _candidate_phrases(segment: str) -> list[str]:
    """Backwards-compatible view returning phrases without context."""
    return [phrase for phrase, _ in _candidate_phrases_with_context(segment)]


_CN_HONOR_SIGNAL = re.compile(
    r"(?:获奖|奖励|荣誉|表彰|称号|奖章|奖项|奖学金|基金|资助|院士|杰青|优青|"
    r"长江学者|人才计划|人才工程|入选|授予|享受.*津贴)")
_CN_OFFICE_SIGNAL = re.compile(
    r"(?:社会兼职|学术兼职|学术任职|学会任职|社会服务|主编|副主编|编委|审稿人|"
    r"理事长|副理事长|常务理事|理事|会长|副会长|秘书长|主任委员|副主任委员|"
    r"委员会委员|学会委员|协会委员|学术委员会|专家委员会|顾问)")


def _has_head(item: str) -> bool:
    low = item.lower()
    return any(head in low for head in _HONOR_HEADS) or bool(_CN_HONOR_SIGNAL.search(item))


def _has_office(item: str) -> bool:
    low = item.lower()
    return any(head in low for head in _OFFICE_HEADS) or bool(_CN_OFFICE_SIGNAL.search(item))


def _strip_leading_period(item: str) -> str:
    """Remove a leading year or year range that a CV line starts with.

    CV sections are usually written "2018-2020 Second Vice-President"; the date
    belongs to the layout, not to the fact, and keeping it makes the field read
    like a raw table row.
    """
    return re.sub(r"^(?:19|20)\d{2}\s*(?:[-–—/]\s*(?:(?:19|20)\d{2}|present|now))?"
                  r"[\s.,:;)\]]*", "", item).strip() or item


def _is_bare_organization(item: str) -> bool:
    """True for a line that names only an organisation, with no role or award.

    Section bodies interleave organisation headers with the roles held there
    ("Presser Foundation" above "2007-2010 Publications Editor").  A header on
    its own states neither an honour nor an appointment, so it is not reported.
    """
    if re.search(r"\d", item):
        return False
    if _has_head(item) or _has_office(item):
        return False
    words = item.split()
    if re.search(r"[\u4e00-\u9fff]", item):
        return False
    return len(words) <= 5


def extract_fact_list(text: str, kind: str, cap: int = 8) -> list[str]:
    """Extract honours (kind="honors") or offices (kind="appointments").

    Scanning runs over the WHOLE window rather than pre-split sentences.  An
    earlier version split first, which cut award phrases that straddled a
    boundary ("... Endowed Professor of Human Physiology. He has received ...
    Award" lost both halves).  Candidate regexes now stop at punctuation
    themselves, so sentence structure is respected without pre-splitting.

    Items harvested from a labelled section are classified by **that heading**
    rather than by requiring a head noun inside the item.  A page that lists
    "Edwin Bierman Award" under "Honors" is unambiguous, and so is
    "中国生物医学工程学会…常务委员" under "学术任职" — demanding the head noun in
    the item itself is what previously discarded both.
    """
    if not text:
        return []
    wanted_office = kind == "appointments"
    bucket: list[tuple[int, str]] = []
    for phrase, context in _candidate_phrases_with_context(text):
        item = _truncate_at_repeat(_tidy(phrase))
        if not _acceptable(item):
            continue
        section_marked = "[[SECTION_" in context
        if section_marked:
            # A CV line carries its own date column; the fact is the role or the
            # award, so a leading year range is layout, not content.
            item = _tidy(_strip_leading_period(item))
            if not _acceptable(item) or _is_bare_organization(item):
                continue
        # Section provenance travels with the candidate as an explicit marker.
        # Parsing it out of free context text was unreliable: a biography line
        # containing "职务：" or "Smith, MD\nPosition" was mistaken for the
        # heading and the real section label was lost.
        section_honor = "[[SECTION_HONOR]]" in context
        section_office = "[[SECTION_OFFICE]]" in context
        is_office = _has_office(item) or section_office
        is_honor = _has_head(item) or section_honor
        if wanted_office and not is_office:
            continue
        if not wanted_office and not is_honor:
            continue
        if not wanted_office and _NOT_HONOR.search(item) and not section_honor:
            continue
        # An item that its own page filed under offices is not an honour, and
        # vice versa, so the two lists stay distinct.
        if wanted_office and section_honor and not section_office and not _has_office(item):
            continue
        if not wanted_office and section_office and not section_honor and not _has_head(item):
            continue
        # Prefer facts that name something specific over bare nouns, and dislike
        # anything that smells like navigation text.
        score = 0
        score += 3 if (is_office if wanted_office else is_honor) else 0
        score += 2 if (section_office if wanted_office else section_honor) else 0
        score += 1 if re.search(r"[A-Z][a-z]+\s+[A-Z]", item) else 0
        score += 1 if len(item) >= 16 else 0
        score -= 2 if _NAV.search(context + " " + item) else 0
        score -= 1 if len(item) < 12 else 0
        bucket.append((score, item))
    bucket.sort(key=lambda pair: -pair[0])
    return _dedupe([item for _, item in bucket])[:cap]


FACT_KINDS = ("honors", "appointments")


# ── §5 Public entry point ─────────────────────────────────────────────────────


def extract_author_facts(text: str, full_name: str = "", surname: str = "",
                         cap: int = 8) -> dict[str, Any]:
    """Structured profile facts from page text, restricted to this author.

    Returns::

        {"current_title": str,
         "honors": [...], "appointments": [...],
         "window_chars": int, "evidence": {kind: [sentence, ...]}}
    """
    window = window_for_author(text, full_name, surname) if (full_name or surname) else (text or "")
    # The caller has already passed the page through name, page-subject and
    # country/institution gates.  Scan the complete verified profile for all
    # fields.  Current rank is normally declared in the page header, while
    # honours and academic offices often sit near the bottom; a name-radius
    # window can miss either when the same name appears again in a lab URL or a
    # publication list.  ``extract_profile_title`` itself rejects history and
    # advisor contexts, so whole-page title reading remains attributable.
    whole_page = text or window
    facts: dict[str, Any] = {
        "current_title": extract_profile_title(whole_page),
        "honors": extract_fact_list(whole_page, "honors", cap),
        "appointments": extract_fact_list(whole_page, "appointments", cap),
        "window_chars": len(window),
        "page_chars": len(whole_page),
        "evidence": {},
    }
    for kind in FACT_KINDS:
        snippets: list[str] = []
        for item in facts[kind]:
            key = normalize_key(item)[:24]
            for segment in re.split(rf"{_STOP_CHARS}\s*", whole_page):
                if key and key in normalize_key(segment):
                    snippets.append(clean(segment)[:220])
                    break
        facts["evidence"][kind] = snippets[:6]
    return facts


# ── §6 Optional table extension ───────────────────────────────────────────────


def load_extra_vocabulary(path: str | Path | None) -> None:
    """Merge operator-supplied role/honour terms from a JSON file.

    The vocabulary above cannot anticipate every institution's wording, so a
    deployment may add terms without editing code::

        {"roles": [["dean of research", "研究院长"], ...],
         "honors": ["<head noun>", ...],
         "offices": ["<head noun>", ...]}
    """
    global _ROLE_VOCABULARY, _HONOR_HEADS, _OFFICE_HEADS
    if not path:
        return
    file = Path(path)
    if not file.is_file():
        return
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    for row in data.get("roles") or []:
        if isinstance(row, (list, tuple)) and len(row) == 2:
            pattern, label = str(row[0]), str(row[1])
            if pattern and label:
                _ROLE_VOCABULARY.append((pattern, label))
    _HONOR_HEADS = tuple(_HONOR_HEADS) + tuple(str(x).lower() for x in (data.get("honors") or []))
    _OFFICE_HEADS = tuple(_OFFICE_HEADS) + tuple(str(x).lower() for x in (data.get("offices") or []))
