"""Versioned, evidence-first integrity reports shared by HTML, Word and PDF.

This compiler does not invent scientific verdicts. It validates supplied findings,
retains an exhaustive machine-candidate ledger, computes the overall disposition,
and freezes source hashes in an immutable report revision. PDF conversion belongs
to the Host officeToPdf service, using the Word file from that same revision.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import html
import json
import mimetypes
import os
import re
import sys
import time
import uuid
from collections import Counter, defaultdict
from contextlib import contextmanager
from pathlib import Path

SCHEMA = 1
STATUSES = {"issue", "review_required", "verified", "unverifiable"}
LABELS = {"issue": "确认问题", "review_required": "需作者澄清", "verified": "本项已核验", "unverifiable": "材料不足"}
VERDICTS = {"issues_found": "发现需要更正的问题", "review_required": "存在需要澄清的证据", "insufficient_evidence": "现有材料不足以形成结论", "no_issue_detected": "在已核查范围内未发现问题"}
SEVERITY = {"critical": 0, "high": 1, "medium": 2, "info": 3}


class ReportError(ValueError):
    """A rejected input leaves the latest committed report revision unchanged."""


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def save(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def inside(root, value, *, exists=True):
    path = (root / value).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ReportError("Report paths must remain inside the current workspace: " + str(value))
    if exists and not path.is_file():
        raise ReportError("Evidence file is missing: " + str(value))
    return path


@contextmanager
def lock(root):
    path = root / ".report.lock"
    stream = path.open('a+b')
    stream.seek(0)
    if path.stat().st_size == 0:
        stream.write(b'0')
        stream.flush()
    stream.seek(0)
    try:
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        stream.close()
        raise ReportError("Another report operation is active. Retry after it finishes.") from error
    try:
        yield
    finally:
        # OS locks release even when a cancelled worker is terminated.
        stream.close()


def source_receipt(root, source, receipts):
    if not isinstance(source, dict) or not isinstance(source.get("path"), str):
        raise ReportError("Each evidence source requires a local path")
    path = inside(root, source["path"])
    actual = digest(path)
    if source.get("sha256") and actual != source["sha256"]:
        raise ReportError("Evidence changed; obtain a new review before exporting: " + source["path"])
    receipts[str(path.relative_to(root))] = actual
    return {**source, "path": str(path.relative_to(root)), "sha256": actual}


def candidate_ledger(root, spec, receipts):
    """Group identical source pairs without transferring judgments between signals."""
    if not spec:
        return {"total": 0, "counts": {}, "categories": {}, "pending_by_category": {}, "groups": [], "records": []}
    path = inside(root, spec["path"])
    receipts[str(path.relative_to(root))] = digest(path)
    machine = read(path)
    manual = {}
    if spec.get("reviews"):
        reviews = inside(root, spec["reviews"])
        receipts[str(reviews.relative_to(root))] = digest(reviews)
        manual = {row["candidate_id"]: row for row in read(reviews).get("records", [])}
    groups = defaultdict(list)
    records = []
    identifiers = set()
    for item in machine.get("findings", []):
        identity = item["finding_id"]
        if identity in identifiers:
            raise ReportError("Duplicate machine candidate id: " + identity)
        identifiers.add(identity)
        pair = sorted(json.dumps([source.get("file", ""), source.get("page"), source.get("image")], ensure_ascii=False)
                      for source in item.get("sources", []))
        group_key = json.dumps([item["detector"], pair], ensure_ascii=False, sort_keys=True)
        group_id = hashlib.sha256(group_key.encode()).hexdigest()[:16]
        record = {"id": identity, "group": group_id, "detector": item["detector"],
                  "title": item["title"], "status": "pending", "note": "机器信号尚未人工裁决"}
        review = manual.get(identity)
        if review and review.get("pixel_reviewed") is True:
            evidence = inside(root, str(Path(spec["reviews"]).parent / review["evidence"]))
            expected = review.get("evidence_sha256") or review.get("evidence_sha256_at_close")
            if not expected or digest(evidence) != expected:
                record["note"] = "既往复核证据哈希缺失或已变化，需要重新复核"
            else:
                record.update(status="reviewed", note=review.get("observation", ""),
                              decision=review.get("decision", ""), evidence=str(evidence.relative_to(root)),
                              evidence_sha256=expected)
                receipts[str(evidence.relative_to(root))] = expected
        # Forensics diagnostics are measurements, not duplication claims. They
        # remain explicitly unreviewed; grouping only changes their presentation.
        record["category"] = "diagnostic" if item["detector"] == "image_forensics" else "similarity"
        groups[group_id].append(identity)
        records.append(record)
    unknown = set(manual) - identifiers
    return {"total": len(records), "counts": dict(Counter(row["status"] for row in records)),
            "categories": dict(Counter(row["category"] for row in records)),
            "pending_by_category": dict(Counter(row["category"] for row in records if row["status"] == "pending")),
            "unmatched_review_ids": sorted(unknown),
            "groups": [{"id": identity, "members": members} for identity, members in groups.items()], "records": records}


def normalize(root, spec, priority_limit=10):
    """Validate report data and bind all local evidence to its current bytes."""
    if spec.get("schema_version") != SCHEMA:
        raise ReportError("Unsupported integrity report schema_version")
    if type(priority_limit) is not int or not 1 <= priority_limit <= 100:
        raise ReportError("priority_limit must be between 1 and 100")
    if not isinstance(spec.get("paper"), dict) or not str(spec["paper"].get("title", "")).strip():
        raise ReportError("paper.title is required")
    if not isinstance(spec.get("findings"), list):
        raise ReportError("findings must be an explicit list, including when empty")
    data = copy.deepcopy(spec)
    receipts = {}
    identifiers = set()
    for finding in data.get("findings", []):
        identity = finding.get("id")
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", identity) or identity in identifiers:
            raise ReportError("Finding ids must be unique stable identifiers")
        identifiers.add(identity)
        if finding.get("status") not in STATUSES or finding.get("severity") not in SEVERITY:
            raise ReportError("Invalid finding status/severity: " + identity)
        for field in ("title", "summary", "limitation", "action", "module"):
            if not isinstance(finding.get(field), str) or not finding[field].strip():
                raise ReportError(identity + " requires " + field)
        blocks = finding.get("evidence", [])
        if finding["status"] in {"issue", "verified"} and not blocks:
            raise ReportError("Confirmed findings require visible evidence: " + identity)
        for block in blocks:
            block["source"] = source_receipt(root, block.get("source"), receipts)
            kind = block.get("kind")
            if kind == "image":
                block["asset"] = source_receipt(root, {"path": block["path"], **({"sha256": block["sha256"]} if block.get("sha256") else {})}, receipts)
                from PIL import Image
                with Image.open(root / block["asset"]["path"]) as image:
                    image.verify()
            elif kind == "table":
                if not block.get("headers") or not isinstance(block.get("rows"), list) or any(len(row) != len(block["headers"]) for row in block["rows"]):
                    raise ReportError("Evidence table columns do not match: " + identity)
            elif kind == "text":
                if not isinstance(block.get("text"), str) or not block["text"].strip():
                    raise ReportError("Evidence excerpt is empty: " + identity)
            else:
                raise ReportError("Unknown evidence kind")
    data["candidates"] = candidate_ledger(root, spec.get("candidate_input"), receipts)
    for source in data.get("inputs", []):
        source_receipt(root, source, receipts)
    data["source_receipts"] = receipts
    counts = dict(Counter(row["status"] for row in data.get("findings", [])))
    if counts.get("issue"):
        verdict = "issues_found"
    elif counts.get("review_required") or data["candidates"]["pending_by_category"].get("similarity"):
        verdict = "review_required"
    elif not counts.get("verified") or any(gap.get("blocking") for gap in data.get("gaps", [])):
        verdict = "insufficient_evidence"
    else:
        verdict = "no_issue_detected"
    priority = sorted((row for row in data.get("findings", []) if row["status"] != "verified"),
                      key=lambda row: (0 if row["status"] == "issue" else 1 if row["status"] == "review_required" else 2,
                                       row.get("priority", 999), SEVERITY[row["severity"]], row["id"]))
    data["summary"] = {"verdict": verdict, "label": VERDICTS[verdict], "counts": counts,
                       "priority_limit": priority_limit, "priority_ids": [row["id"] for row in priority[:priority_limit]],
                       "pending_candidates": data["candidates"]["counts"].get("pending", 0)}
    return data


def source_label(block):
    source = block["source"]
    label = source.get("label", Path(source["path"]).name)
    if source.get("page") is not None:
        label += " · 第 " + str(source["page"]) + " 页"
    if source.get("sheet"):
        label += " · " + source["sheet"] + ("!" + source["range"] if source.get("range") else "")
    return label


def asset_uri(root, block):
    path = root / block["asset"]["path"]
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
        raise ReportError("Unsupported report image format")
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode()


def table_html(headers, rows):
    e = lambda value: html.escape(str(value))
    return '<div class="table-scroll"><table><thead><tr>' + ''.join('<th>' + e(h) + '</th>' for h in headers) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join('<td>' + e(cell) + '</td>' for cell in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def ledger_note(ledger):
    pending = ledger['pending_by_category']
    return (str(ledger['total']) + ' 条机器信号；其中 ' + str(ledger['categories'].get('similarity', 0)) + ' 条相似线索、'
            + str(ledger['categories'].get('diagnostic', 0)) + ' 条图像诊断测量。'
            + str(ledger['counts'].get('reviewed', 0)) + ' 条有哈希匹配的像素复核记录；待裁决相似线索 '
            + str(pending.get('similarity', 0)) + ' 条、未人工解释的诊断测量 ' + str(pending.get('diagnostic', 0))
            + ' 条。机器信号不计为确认问题，分组不传递人工判断。')


def block_html(root, block):
    caption = html.escape(block.get("caption", ""))
    source = html.escape(source_label(block))
    if block["kind"] == "image":
        content = '<img loading="lazy" src="' + asset_uri(root, block) + '" alt="' + caption + '">'
    elif block["kind"] == "table":
        content = table_html(block["headers"], block["rows"])
    else:
        content = '<blockquote>' + html.escape(block["text"]) + '</blockquote>'
    return '<figure>' + content + '<figcaption>' + caption + '<span>' + source + '</span></figcaption></figure>'


def render_html(root, data, target):
    """Write a self-contained report; all untrusted text is escaped as plain text."""
    e = lambda value: html.escape(str(value))
    summary = data["summary"]
    priority = set(summary["priority_ids"])
    findings = sorted(data["findings"], key=lambda row: summary["priority_ids"].index(row["id"]) if row["id"] in priority else 1000)
    cards = []
    for finding in findings:
        visible = finding["id"] in priority
        body = '<p>' + e(finding["summary"]) + '</p>'
        body += ''.join(block_html(root, block) for block in finding.get("evidence", []))
        body += '<p class="limit"><strong>解释范围</strong> ' + e(finding["limitation"]) + '</p><p><strong>建议</strong> ' + e(finding["action"]) + '</p>'
        cards.append('<details class="finding ' + e(finding["status"]) + (' priority' if visible else '') + '"' + (' open' if visible else '') + '><summary><span class="badge">' + LABELS[finding["status"]] + '</span><span>' + e(finding["title"]) + '</span><small>' + e(finding["id"]) + '</small></summary><div class="finding-body">' + body + '</div></details>')
    counts = ''.join('<div><b>' + str(summary["counts"].get(status, 0)) + '</b><span>' + LABELS[status] + '</span></div>' for status in ("issue", "review_required", "verified", "unverifiable"))
    coverage = table_html(["检查内容", "已完成 / 应检查", "状态与范围"], [[row["title"], str(row.get("done", "—")) + " / " + str(row.get("total", "—")), row.get("note", row.get("status", ""))] for row in data.get("coverage", [])])
    gaps = ''.join('<li>' + e(gap["text"]) + '</li>' for gap in data.get("gaps", []))
    ledger = data["candidates"]
    ledger_rows = [[row["id"], row["detector"], "已留像素复核记录" if row["status"] == "reviewed" else "未人工裁决", row["note"]] for row in ledger["records"]]
    css = '''*{box-sizing:border-box}body{margin:0;background:#f3f4f5;color:#202b35;font:15px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;background:white;min-height:100vh;padding:48px 56px}header{border-bottom:1px solid #ccd5db;padding-bottom:26px}.brand{letter-spacing:.14em;font-size:12px;color:#5d7183}h1{font-size:30px;font-weight:500;line-height:1.3;margin:12px 0}h2{font-size:21px;font-weight:500;margin-top:36px}h3{font-size:17px;font-weight:500}.paper{color:#536372;max-width:900px}.verdict{font-size:25px;font-weight:500;color:#8b332b;margin:20px 0 8px}.counts{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:24px 0}.counts div{border-bottom:2px solid #d7dfe5;padding:8px 0}.counts b{font-size:30px;font-weight:500;display:block}.counts span,.muted{color:#61707d}.enhanced .toolbar{display:flex}.toolbar{display:none;gap:12px;flex-wrap:wrap;align-items:center;margin:24px 0}.toolbar label{flex:1;min-width:160px}input,select,button{font:inherit;padding:8px 12px;border:1px solid #bdc9d3;background:white;border-radius:4px;max-width:100%;color:inherit}input{width:100%}button{cursor:pointer}.finding{border:1px solid #dae1e6;border-radius:5px;margin:14px 0;break-inside:avoid}.finding>summary{cursor:pointer;display:flex;align-items:center;gap:12px;padding:18px;list-style:none}.finding>summary span:nth-child(2){flex:1;min-width:0;font-weight:500}.finding>summary small{color:#6a7680}.badge{font-size:12px;border:1px solid #c8d3dd;padding:3px 7px;border-radius:3px;white-space:nowrap}.issue .badge{color:#8b332b;background:#fff1ed;border-color:#e5beb4}.finding-body{padding:0 22px 16px}.finding-body p{margin:12px 0}figure{margin:18px 0}figure img{max-width:100%;max-height:410px;width:auto;height:auto;object-fit:contain;display:block;margin:auto}figcaption{font-size:12px;color:#61707d;margin-top:8px}figcaption span{display:block}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #d9dfe4;padding:9px 12px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf2f5;font-weight:500}tr:nth-child(even){background:#fafbfc}.table-scroll{overflow:auto}blockquote{margin:0;padding:10px 18px;border-left:2px solid #9dadba;background:#f7f9fa;white-space:pre-wrap}.limit{color:#63707b;font-size:13px}.hidden{display:none!important}footer{border-top:1px solid #ccd5db;margin-top:35px;padding-top:20px;font-size:12px;color:#647382}@media(max-width:650px){main{padding:24px 18px}h1{font-size:24px}.counts{gap:10px}.counts span{font-size:12px}.finding>summary{flex-wrap:wrap;padding:12px}.finding>summary small{width:100%}.finding-body{padding:0 12px 12px}.toolbar>*{flex:1}th,td{padding:7px}}@media print{body{background:white}main{padding:0;max-width:none}.toolbar{display:none}.hidden{display:block!important}details{display:block}details::details-content{content-visibility:visible}.finding{break-inside:auto}figure img{max-height:350px}header{break-after:avoid}}'''
    script = '''document.documentElement.classList.add('enhanced');const cards=[...document.querySelectorAll('.finding')];let all=false;const q=document.getElementById('search'),s=document.getElementById('status');function filter(){document.getElementById('remaining').open=all;for(const c of cards){const ok=(!s.value||c.classList.contains(s.value))&&c.textContent.toLowerCase().includes(q.value.toLowerCase());c.classList.toggle('hidden',!ok)}}document.getElementById('remaining').addEventListener('toggle',e=>{all=e.target.open;document.getElementById('all').textContent=all?'仅显示重点':'显示全部发现'});q.addEventListener('input',()=>{all=true;filter()});s.addEventListener('change',()=>{all=true;filter()});document.getElementById('all').addEventListener('click',e=>{all=!all;e.target.textContent=all?'仅显示重点':'显示全部发现';filter()});document.getElementById('expand').addEventListener('click',()=>{for(const c of cards)if(!c.classList.contains('hidden'))c.open=true});filter();'''
    content = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'"><title>论文核验结论报告</title><style>' + css + '</style></head><body><main><header><div class="brand">ZEROWALL SCIENCE · RESEARCH INTEGRITY</div><h1>论文核验结论报告</h1><p class="paper">' + e(data["paper"]["title"]) + '<br>' + e(data["paper"].get("citation", "")) + '</p><p class="muted">报告 ' + e(data["report_id"]) + ' · 修订 ' + str(data["revision"]) + ' · ' + e(data["generated_at"][:10]) + '</p></header><section><p class="verdict">' + summary["label"] + '</p><p>' + e(data.get("conclusion", "")) + '</p><div class="counts">' + counts + '</div><p class="limit">结论适用于所列材料与方法。机器信号不计为确认问题，材料缺失不证明存在不端行为。</p></section><h2>核查覆盖与材料限制</h2>' + coverage + '<ul>' + gaps + '</ul><h2>重点发现与直接证据</h2><p class="muted">默认展示 ' + str(summary["priority_limit"]) + ' 条重点；共 ' + str(len(findings)) + ' 条审查记录。点击标题可收起或展开证据。</p><div class="toolbar"><label><input id="search" type="search" placeholder="搜索图号、问题或证据" aria-label="搜索发现"></label><select id="status" aria-label="筛选结论"><option value="">全部状态</option>' + ''.join('<option value="' + status + '">' + LABELS[status] + '</option>' for status in LABELS) + '</select><button id="all">显示全部发现</button><button id="expand">展开证据</button></div>' + ''.join(cards[:len(priority)]) + '<details id="remaining"><summary>展开其余 ' + str(len(cards)-len(priority)) + ' 条核查记录</summary>' + ''.join(cards[len(priority):]) + '</details><details><summary>机器线索台账及既往复核记录</summary><p>' + e(ledger_note(ledger)) + '</p>' + table_html(["线索 ID", "检测器", "处理状态", "记录"], ledger_rows) + '</details><footer>证据图片、数据表和文字已嵌入，可离线阅读。Word 与 PDF 使用同一份已冻结的报告数据。<br>证据索引和源文件哈希保存在 report.json；本报告不认定学术不端。</footer></main><script>' + script + '</script></body></html>'
    target.write_text(content, encoding="utf-8")


def render_markdown(data, target):
    summary = data["summary"]
    lines = ["# 论文核验结论报告", "", "**" + summary["label"] + "**", "", data.get("conclusion", ""), "", data["paper"]["title"], "", "## 重点发现", ""]
    by_id = {row["id"]: row for row in data["findings"]}
    for identity in summary["priority_ids"]:
        row = by_id[identity]
        lines.extend(["### " + row["title"], "", LABELS[row["status"]] + " · " + identity, "", row["summary"], "", "建议：" + row["action"], ""])
    lines.extend(["完整图片、数据表和文字证据见同修订的 HTML、Word 或 PDF。", ""])
    target.write_text("\n".join(lines), encoding="utf-8")


def render_screening_html(output, payload, priority_limit=10):
    """Render detector signals safely, keeping scientific adjudication separate."""
    e = lambda value: html.escape(str(value))
    sections = []
    for index, finding in enumerate(payload["findings"]):
        images = []
        for image in finding.get("evidence_images", []):
            path = inside(output, image)
            uri = asset_uri(output, {"asset": {"path": str(path.relative_to(output))}})
            images.append('<img loading="lazy" src="' + uri + '" alt="匹配区域证据">')
        sections.append('<details' + (' open' if index < priority_limit else '') + '><summary>' + e(finding["title"]) + ' · ' + e(finding["finding_id"]) + '</summary><p>' + e(finding.get("location", "")) + '</p><p>' + e(finding["evidence"]) + '</p>' + ''.join(images) + '</details>')
    content = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>科研图像筛查结果</title><style>body{font:15px/1.7 system-ui;max-width:1050px;margin:36px auto;padding:20px;color:#23313d}h1{font-size:27px}details{border:1px solid #d5dde4;padding:16px;margin:12px 0}summary{cursor:pointer}img{max-width:100%;max-height:480px;object-fit:contain}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>科研图像筛查结果</h1><p>机器信号 ' + str(len(payload["findings"])) + ' 条；默认展开 ' + str(priority_limit) + ' 条。信号未经科学语境裁决，不能视为确认问题。</p><h2>执行覆盖</h2><pre>' + e(json.dumps(payload.get("coverage", {}), ensure_ascii=False, indent=2)) + '</pre>' + ''.join(sections) + '<details><summary>未执行检查与原因</summary><pre>' + e(json.dumps(payload.get("skipped", []), ensure_ascii=False, indent=2)) + '</pre></details></html>'
    (output / 'report.html').write_text(content, encoding='utf-8')


def render_docx(root, data, target):
    """Generate editable text/tables with embedded raster evidence in Word."""
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from PIL import Image
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Inches(.68)
    section.left_margin = section.right_margin = Inches(.78)
    for name in ("Normal", "Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3", "Caption"):
        style = doc.styles[name]
        style.font.name = "Arial"
        style.font.color.rgb = RGBColor(0, 0, 0)
        style._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    for border in list(doc.styles.element.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
    doc.styles["Normal"].font.size = Pt(10)
    doc.styles["Normal"].paragraph_format.space_after = Pt(7)
    doc.styles["Normal"].paragraph_format.line_spacing = 1.15
    doc.styles["Title"].font.size = Pt(23)
    doc.styles["Heading 1"].font.size = Pt(16)
    doc.styles["Heading 2"].font.size = Pt(12)
    doc.styles["Caption"].font.size = Pt(8)
    header = section.header.paragraphs[0]
    header.text = "ZEROWALL SCIENCE   论文核验"
    header.style = doc.styles["Caption"]
    footer = section.footer.paragraphs[0]
    footer.text = data["report_id"] + "  ·  r" + str(data["revision"]) + "    "
    field = OxmlElement("w:fldSimple"); field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)

    def table(headers, rows):
        t = doc.add_table(rows=1, cols=len(headers))
        t.style = "Table Grid"
        t.autofit = False
        ratios = ([.12, .20, .68] if headers[0] == 'ID' else [.42, .29, .29]) if len(headers) == 3 else ([.38, .18, .18, .26] if len(headers) == 4 and headers[0] not in LABELS.values() else [1 / len(headers)] * len(headers))
        for column, ratio in zip(t.columns, ratios):
            column.width = Inches(6.94 * ratio)
        repeat = OxmlElement("w:tblHeader"); t.rows[0]._tr.get_or_add_trPr().append(repeat)
        for cells, values in [(t.rows[0].cells, headers)] + [(t.add_row().cells, values) for values in rows]:
            for cell, value in zip(cells, values):
                cell.text = str(value)
                for p in cell.paragraphs:
                    p.paragraph_format.space_after = Pt(4)
                    p.paragraph_format.space_before = Pt(4)
                    for run in p.runs:
                        run.font.size = Pt(8.5)
            for cell, ratio in zip(cells, ratios):
                cell.width = Inches(6.94 * ratio)
        for row in t.rows:
            row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for cell in t.rows[0].cells:
            shade = OxmlElement("w:shd"); shade.set(qn("w:fill"), "E7EDF2"); cell._tc.get_or_add_tcPr().append(shade)
        # All grid borders are explicit and independent of Word theme defaults.
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            node = OxmlElement("w:" + edge); node.set(qn("w:val"), "single"); node.set(qn("w:sz"), "4"); node.set(qn("w:color"), "D9D9D9"); borders.append(node)
        t._tbl.tblPr.append(borders)
        doc.add_paragraph().paragraph_format.space_after = Pt(0)

    doc.add_paragraph("论文核验结论报告", "Title")
    doc.add_paragraph(data["paper"]["title"])
    doc.add_paragraph(data["paper"].get("citation", ""), "Caption")
    doc.add_paragraph('修订 ' + str(data['revision']) + ' · ' + data['generated_at'][:10], 'Caption')
    doc.add_paragraph(data["summary"]["label"], "Heading 1")
    doc.add_paragraph(data.get("conclusion", ""))
    table([LABELS[s] for s in ("issue", "review_required", "verified", "unverifiable")], [[data["summary"]["counts"].get(s, 0) for s in ("issue", "review_required", "verified", "unverifiable")]])
    doc.add_paragraph("优先更正事项", "Heading 1")
    table(["ID", "结论", "核查事项"], [[row['id'], LABELS[row['status']], row['title']] for row in data['findings'] if row['status'] == 'issue'])
    doc.add_paragraph("核查范围", "Heading 2")
    doc.add_paragraph('；'.join(row['title'] + ' ' + str(row.get('done', '—')) + '/' + str(row.get('total', '—')) for row in data.get('coverage', [])) + '。')
    for gap in data.get("gaps", []):
        doc.add_paragraph(gap["text"])
    doc.add_page_break()
    doc.add_paragraph("重点发现与直接证据", "Heading 1")
    doc.add_paragraph("默认展示 " + str(data["summary"]["priority_limit"]) + " 条重点。以下结论针对现有材料，不构成学术不端认定。", "Caption")
    by_id = {row["id"]: row for row in data["findings"]}
    ordered = data["summary"]["priority_ids"] + [row["id"] for row in data["findings"] if row["id"] not in data["summary"]["priority_ids"]]
    for index, identity in enumerate(ordered):
        if index == len(data["summary"]["priority_ids"]):
            doc.add_page_break()
            doc.add_paragraph("其他核查记录及证据", "Heading 1")
        row = by_id[identity]
        doc.add_paragraph(row["title"], "Heading 2")
        status = doc.add_paragraph(LABELS[row["status"]] + " · " + identity, "Caption")
        status.paragraph_format.keep_with_next = True
        doc.add_paragraph(row["summary"])
        for block in row.get("evidence", []):
            if block["kind"] == "image":
                path = root / block["asset"]["path"]
                with Image.open(path) as image:
                    width, height = image.size
                image_width = min(6.8, 2.25 * width / height)
                p = doc.add_paragraph(); p.paragraph_format.keep_with_next = True
                p.add_run().add_picture(str(path), width=Inches(image_width))
            elif block["kind"] == "table":
                table(block["headers"], block["rows"])
            else:
                doc.add_paragraph(block["text"])
            doc.add_paragraph(block.get("caption", "") + "  " + source_label(block), "Caption")
        doc.add_paragraph("解释范围：" + row["limitation"])
        doc.add_paragraph("建议：" + row["action"])
    doc.add_paragraph("全部核查记录", "Heading 1")
    table(["ID", "结论", "核查事项"], [[row["id"], LABELS[row["status"]], row["title"]] for row in data["findings"]])
    doc.add_paragraph("核查覆盖明细", "Heading 1")
    table(["检查内容", "完成情况", "范围"], [[row["title"], str(row.get("done", "—")) + "/" + str(row.get("total", "—")), row.get("note", "")] for row in data.get("coverage", [])])
    ledger = data["candidates"]
    doc.add_paragraph("机器线索说明", "Heading 1")
    doc.add_paragraph(ledger_note(ledger) + '完整台账见同修订 report.json。')
    doc.core_properties.title = "论文核验结论报告"
    doc.core_properties.subject = data["paper"]["title"]
    doc.core_properties.identifier = data["data_sha256"]
    doc.save(target)


def verify_sources(root, data):
    for path, expected in data["source_receipts"].items():
        if digest(inside(root, path)) != expected:
            raise ReportError("Source bytes changed; build a new review revision: " + path)


def publish(workspace, spec_path, output, *, priority_limit=10, formats=("html", "docx")):
    """Commit a new revision only after every requested local export succeeds."""
    root = Path(workspace).resolve()
    spec_path = inside(root, spec_path)
    run = inside(root, output, exists=False)
    run.mkdir(parents=True, exist_ok=True)
    with lock(run):
        latest = read(run / "latest.json") if (run / "latest.json").is_file() else None
        revision = latest["revision"] + 1 if latest else 1
        data = normalize(root, read(spec_path), priority_limit)
        data["source_receipts"][str(spec_path.relative_to(root))] = digest(spec_path)
        data.update(report_id=(latest["report_id"] if latest else "ri-" + uuid.uuid4().hex[:12]), revision=revision,
                    generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        data["data_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
        target = run / ("revision-" + str(revision).zfill(4))
        staging = run / (".staging-" + uuid.uuid4().hex)
        staging.mkdir()
        try:
            save(staging / "report.json", data)
            render_html(root, data, staging / "report.html")
            render_markdown(data, staging / "summary.md")
            if "docx" in formats or "pdf" in formats:
                render_docx(root, data, staging / "report.docx")
            verify_sources(root, data)
            artifacts = {path.name: {"sha256": digest(path), "bytes": path.stat().st_size} for path in staging.iterdir() if path.is_file()}
            save(staging / "exports.json", {"schema_version": SCHEMA, "data_sha256": data["data_sha256"], "artifacts": artifacts,
                                            "pdf": {"status": "pending" if "pdf" in formats else "not_requested"}})
            staging.rename(target)
            latest = {"report_id": data["report_id"], "revision": revision, "directory": str(target.relative_to(root)),
                      "data_sha256": data["data_sha256"], "verdict": data["summary"]["verdict"], "summary": data["summary"]}
            save(run / "latest.json", latest)
            return {"ok": True, **latest, "exports": str((target / "exports.json").relative_to(root)),
                    "html": str((target / "report.html").relative_to(root)),
                    **({"docx": str((target / "report.docx").relative_to(root))} if (target / "report.docx").is_file() else {})}
        except Exception:
            # Staging is retained for diagnostics. It never becomes the current revision.
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["build", "status"])
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--spec", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--priority-limit", type=int, default=10)
    parser.add_argument("--formats", nargs="+", choices=["html", "docx", "pdf"], default=["html", "docx", "pdf"])
    args = parser.parse_args()
    try:
        if args.action == "status":
            root = args.workspace.resolve()
            print(json.dumps(read(inside(root, args.output / "latest.json")), ensure_ascii=False))
        else:
            if not args.spec:
                raise ReportError("build requires --spec")
            print(json.dumps(publish(args.workspace, args.spec, args.output, priority_limit=args.priority_limit, formats=args.formats), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"ok": False, "code": "REPORT_REJECTED", "message": str(error)}, ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
