# -*- coding: utf-8 -*-
"""dsh-bio-genie — 来源审计模块（bio_source_audit 工具后端，2026-10-10 新增）。

把「先查后写」纪律工具化：核查被引用的数据与其权威来源是否相符。

与 rigor-guard / provenance 台账的分工：
  - provenance 台账：管「数字是否有工具出处」（回合内自动、软提醒）；
  - 本模块：管「标识符 / 序列是否与外部权威源相符」（显式调用、逐条留痕）。

三种模式（mode）：
  identifiers  标识符核验：ncbi_nucleotide / ncbi_protein / ncbi_gene /
               uniprot / pdb / ensembl / pmid 的存在性 + 比对项
               （organism_contains / title_contains / length / year / gene_contains）
  sequences    序列溯源核验：序列须在记录中逐字出现（正链），或与记录的反向
               互补一致（负链）；返回 1-based 位置
  scan         从文本/文件抽取候选标识符与序列（不联网；输出候选清单）

逐条状态语义（严格区分，不得混用）：
  verified    存在性 + 全部请求的比对项通过
  mismatch    记录存在，但至少一项比对失败
  partial     存在性通过、无失败项，但部分请求项该源不支持/字段缺失（不能算通过）
  not_found   权威源明确答复「无此记录」
  unreachable 未能完成查询（网络/超时/限流）——不是准确性结论
  error       条目无法处理（格式错误/该源不支持该模式）

纪律与边界：单次 ≤25 条；远程调用间隔 ≥0.35s；仅报告所查项——
未在 expect / sequence 中列出的内容一律不推断、不背书。
"""

import datetime
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_ITEMS = 25
MAX_SCAN_HITS = 200
MAX_TEXT_BYTES = 2_000_000
PACE_SECONDS = 0.35

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36 '
      '(+dsh-bio-genie; contact: dsh-bio-genie@users.noreply.github.com)')
ENSEMBL_UA = 'dsh-bio-genie/0.1.4'

_ID_DBS = ('ncbi_nucleotide', 'ncbi_protein', 'ncbi_gene', 'uniprot', 'pdb', 'ensembl', 'pmid')
_SEQ_DBS = ('ncbi_nucleotide', 'ncbi_protein', 'uniprot', 'ensembl')

# db 别名：真机 E2E（2026-10-10）实测 agent 会写 nuccore / ncbi_nuccore 等自然名，统一归一到规范 db。
_DB_ALIASES = {
    'nuccore': 'ncbi_nucleotide',
    'ncbi_nuccore': 'ncbi_nucleotide',
    'nucleotide': 'ncbi_nucleotide',
    'protein': 'ncbi_protein',
    'gene': 'ncbi_gene',
    'pubmed': 'pmid',
}

_CHECKS_SUPPORTED = {
    'ncbi_nucleotide': ('organism_contains', 'title_contains', 'length'),
    'ncbi_protein': ('organism_contains', 'title_contains', 'length'),
    'ncbi_gene': ('organism_contains', 'title_contains', 'gene_contains'),
    'uniprot': ('organism_contains', 'title_contains', 'length', 'gene_contains'),
    'pdb': ('title_contains',),
    'ensembl': ('organism_contains', 'title_contains', 'length'),
    'pmid': ('title_contains', 'year'),
}
_CHECK_FIELDS = {
    'organism_contains': 'organism',
    'title_contains': 'title',
    'length': 'length',
    'year': 'year',
    'gene_contains': 'gene',
}

_SOURCE_LABEL = {
    'ncbi_nucleotide': 'NCBI E-utilities esummary/efetch (nuccore)',
    'ncbi_protein': 'NCBI E-utilities esummary/efetch (protein)',
    'ncbi_gene': 'NCBI E-utilities esummary (gene)',
    'uniprot': 'UniProt REST (rest.uniprot.org)',
    'pdb': 'RCSB PDB Data API (data.rcsb.org)',
    'ensembl': 'Ensembl REST (rest.ensembl.org)',
    'pmid': 'NCBI E-utilities esummary (pubmed)',
}

STATUS_ORDER = ('verified', 'mismatch', 'partial', 'not_found', 'unreachable', 'error')

# ---------------------------------------------------------------- 基础工具

_last_remote = [0.0]


def _pace():
    """远程调用节流：两次远程请求之间至少间隔 PACE_SECONDS。"""
    wait = _last_remote[0] + PACE_SECONDS - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_remote[0] = time.monotonic()


def _now_iso():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()


def _handle_read(handle):
    """Bio.Entrez 的 read() 在不同路径/版本下可能返回 str 或 bytes。"""
    data = handle.read()
    if isinstance(data, bytes):
        data = data.decode('utf-8', errors='replace')
    return data


def _revcomp(s):
    table = str.maketrans('ACGTNRYKMSWBDHVacgtnrykmswbdhv',
                          'TGCANYRMKSWVHDBtgcanrykmswvhdb')
    return s.translate(table)[::-1]


def _parse_fasta(text):
    """极简 FASTA 解析（名称, 序列）列表；仅取所需，不引入额外依赖。"""
    recs = []
    name = None
    chunks = []
    for line in text.splitlines():
        if line.startswith('>'):
            if name is not None:
                recs.append((name, ''.join(chunks)))
            name = line[1:].strip()
            chunks = []
        elif line.strip():
            chunks.append(line.strip())
    if name is not None:
        recs.append((name, ''.join(chunks)))
    return recs


def _get_json_checked(url, headers=None, timeout=30):
    """HTTP GET → (state, data, detail)；state ∈ ok / not_found / unreachable / error。

    区分语义（供逐条状态机使用）：
      404              → not_found（权威源明确无此记录）
      400              → error（源拒绝该 ID——条目问题，不是存在性结论）
      其他 HTTP / 网络 → unreachable（未能查询，不是结论）
    """
    try:
        req = urllib.request.Request(
            url, headers=headers or {'User-Agent': UA, 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 'ok', json.loads(resp.read().decode('utf-8')), ''
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return 'not_found', None, 'HTTP 404'
        if e.code == 400:
            return 'error', None, 'HTTP 400（源拒绝了该 ID）'
        return 'unreachable', None, 'HTTP %s' % e.code
    except Exception as e:
        return 'unreachable', None, '%s: %s' % (type(e).__name__, str(e)[:160])


def _ensembl_get(url):
    """Ensembl 专用：直连优先、系统代理回退（与 op_ref_genome 同一实测策略）。"""
    openers = (
        ('direct', urllib.request.build_opener(urllib.request.ProxyHandler({}))),
        ('proxy', urllib.request.build_opener()),
    )
    last = ''
    for label, opener in openers:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': ENSEMBL_UA})
            with opener.open(req, timeout=15 if label == 'direct' else 30) as resp:
                return 'ok', json.loads(resp.read().decode('utf-8')), ''
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 'not_found', None, 'HTTP 404'
            last = 'HTTP %s (%s)' % (e.code, label)
        except Exception as e:
            last = '%s: %s (%s)' % (type(e).__name__, str(e)[:120], label)
    return 'unreachable', None, last


# ---------------------------------------------------------------- 抓取层

def _fetch_ncbi_summary(kind, rid):
    """NCBI esummary（nuccore / protein / gene / pubmed）。"""
    _pace()
    try:
        from bio_ops import _entrez
        Entrez = _entrez()
        handle = Entrez.esummary(db=kind, id=rid, retmode='json')
        raw = _handle_read(handle)
        handle.close()
        data = json.loads(raw)
    except Exception as e:
        msg = str(e)
        if 'not found' in msg.lower() or 'Invalid uid' in msg:
            return 'not_found', None, msg[:160]
        return 'unreachable', None, '%s: %s' % (type(e).__name__, msg[:160])
    res = data.get('result') or {}
    uids = res.get('uids') or []
    err = data.get('error') or res.get('error') or ''
    if not uids:
        # 实测：不存在/非法 ID 返回 {"error": "Invalid uid ...", "result": {"uids": []}}
        if err:
            return 'not_found', None, str(err)[:160]
        return 'not_found', None, 'esummary 返回空结果集'
    doc = res[uids[0]]
    fields = _normalize_ncbi_fields(kind, doc)
    fields['uid'] = uids[0]
    return 'ok', {'fields': fields}, ''


def _normalize_ncbi_fields(kind, doc):
    if kind in ('nuccore', 'protein'):
        return {
            'organism': str(doc.get('organism') or '') or None,
            'title': str(doc.get('title') or '') or None,
            'length': doc.get('slen'),
            'accession': doc.get('accessionversion') or doc.get('caption'),
            'taxid': doc.get('taxid'),
        }
    if kind == 'gene':
        org = doc.get('organism') or {}
        if isinstance(org, dict):
            orgname = org.get('scientificname') or org.get('commonname')
            taxid = org.get('taxid')
        else:
            orgname, taxid = str(org) or None, None
        name = str(doc.get('name') or doc.get('nomenclaturesymbol') or '')
        desc = str(doc.get('description') or '')
        title = (name + ' — ' + desc).strip(' —') if (name or desc) else None
        return {'organism': orgname, 'title': title or None, 'length': None,
                'gene': name or None, 'accession': 'GeneID:' + str(doc.get('uid') or ''),
                'taxid': taxid}
    if kind == 'pubmed':
        pubdate = str(doc.get('pubdate') or '')
        year = None
        for tok in pubdate.replace('-', ' ').split():
            if len(tok) >= 4 and tok[:4].isdigit():
                year = int(tok[:4])
                break
        return {'organism': None, 'title': str(doc.get('title') or '') or None,
                'journal': str(doc.get('source') or '') or None,
                'year': year, 'length': None,
                'accession': 'PMID:' + str(doc.get('uid') or '')}
    return {}


def _fetch_ncbi_sequence(kind, rid):
    """NCBI efetch FASTA（nuccore / protein），取第一条记录。"""
    _pace()
    try:
        from bio_ops import _entrez
        Entrez = _entrez()
        handle = Entrez.efetch(db=kind, id=rid, rettype='fasta', retmode='text')
        raw = _handle_read(handle)
        handle.close()
    except Exception as e:
        if isinstance(e, urllib.error.HTTPError) and e.code == 400:
            return 'not_found', None, 'HTTP 400（NCBI 无法解析该 ID）'
        msg = str(e)
        if 'not found' in msg.lower() or 'Invalid uid' in msg:
            return 'not_found', None, msg[:160]
        return 'unreachable', None, '%s: %s' % (type(e).__name__, msg[:160])
    recs = _parse_fasta(raw)
    if not recs:
        return 'not_found', None, '未取到 FASTA 记录'
    header, seq = recs[0]
    return 'ok', {'sequence': seq, 'fasta_header': header[:200], 'length': len(seq)}, ''


def _fetch_uniprot(rid, need_seq):
    _pace()
    state, data, detail = _get_json_checked(
        'https://rest.uniprot.org/uniprotkb/' + urllib.parse.quote(rid) + '.json')
    if state != 'ok':
        return state, None, detail
    pd_ = data.get('proteinDescription') or {}
    name = ''
    for key in ('recommendedName', 'submissionNames'):
        v = pd_.get(key)
        if v:
            if isinstance(v, list):
                v = v[0]
            nm = (v.get('fullName') or {}).get('value', '') if isinstance(v, dict) else ''
            if nm:
                name = nm
                break
    genes = [g.get('geneName', {}).get('value') for g in (data.get('genes') or [])
             if g.get('geneName')]
    seqobj = data.get('sequence') or {}
    org = data.get('organism') or {}
    fields = {
        'organism': org.get('scientificName'),
        'title': name or None,
        'length': seqobj.get('length'),
        'gene': genes[0] if genes else None,
        'accession': data.get('primaryAccession') or rid,
        'entry_name': data.get('uniProtkbId'),
        'taxid': org.get('taxonId'),
    }
    out = {'fields': fields}
    if need_seq and seqobj.get('value'):
        out['sequence'] = seqobj.get('value')
        out['fasta_header'] = 'sp|%s|%s' % (fields.get('accession') or rid,
                                            fields.get('entry_name') or '')
    return 'ok', out, ''


def _fetch_pdb(rid):
    if not re.fullmatch('[0-9][A-Za-z0-9]{3}', rid):
        return 'error', None, 'PDB ID 格式须为 4 字符且以数字开头（如 1TUP）'
    _pace()
    state, data, detail = _get_json_checked(
        'https://data.rcsb.org/rest/v1/core/entry/' + rid.upper())
    if state != 'ok':
        return state, None, detail
    struct = data.get('struct') or {}
    info = data.get('rcsb_entry_info') or {}
    ids = data.get('rcsb_entry_container_identifiers') or {}
    fields = {
        'organism': None,
        'title': struct.get('title'),
        'length': None,
        'accession': ids.get('entry_id') or rid.upper(),
        'experimental_method': info.get('experimental_method'),
    }
    return 'ok', {'fields': fields}, ''


def _fetch_ensembl(rid, need_seq):
    _pace()
    state, data, detail = _ensembl_get(
        'https://rest.ensembl.org/lookup/id/' + urllib.parse.quote(rid) +
        '?content-type=application/json')
    if state != 'ok':
        return state, None, detail
    start, end = data.get('start'), data.get('end')
    length = (end - start + 1) if isinstance(start, int) and isinstance(end, int) else None
    title = ' | '.join([x for x in (data.get('display_name'), data.get('description')) if x])
    fields = {
        'organism': data.get('species'),
        'title': title or None,
        'length': length,
        'accession': data.get('id'),
        'biotype': data.get('biotype'),
        'assembly': data.get('assembly_name'),
        'version': data.get('version'),
    }
    out = {'fields': fields}
    if need_seq:
        _pace()
        s2, d2, dt2 = _ensembl_get(
            'https://rest.ensembl.org/sequence/id/' + urllib.parse.quote(rid) +
            '?content-type=application/json')
        if s2 != 'ok':
            return s2, out, '记录存在，但序列获取失败: %s' % dt2
        out['sequence'] = d2.get('seq')
        out['fasta_header'] = 'ensembl|%s|%s' % (data.get('id') or rid,
                                                 data.get('display_name') or '')
    return 'ok', out, ''


def _fetch_record(db, rid, need_seq=False):
    """按来源抓取记录 → 统一结构。

    {'state': ok|not_found|unreachable|error, 'fields': dict|None,
     'sequence': str|None, 'detail': str, 'source': str, 'retrieved_at': str}
    """
    out = {'state': 'error', 'fields': None, 'sequence': None,
           'detail': '', 'source': _SOURCE_LABEL.get(db, db), 'retrieved_at': _now_iso()}
    if db == 'ncbi_nucleotide':
        kind = 'nuccore'
    elif db == 'ncbi_protein':
        kind = 'protein'
    else:
        kind = None
    if kind:
        if need_seq:
            state, payload, detail = _fetch_ncbi_sequence(kind, rid)
        else:
            state, payload, detail = _fetch_ncbi_summary(kind, rid)
    elif db == 'ncbi_gene':
        if need_seq:
            return dict(out, state='error', detail='该来源不支持序列核验（可用: %s）' % ', '.join(_SEQ_DBS))
        state, payload, detail = _fetch_ncbi_summary('gene', rid)
    elif db == 'pmid':
        if need_seq:
            return dict(out, state='error', detail='该来源不支持序列核验（可用: %s）' % ', '.join(_SEQ_DBS))
        state, payload, detail = _fetch_ncbi_summary('pubmed', rid)
    elif db == 'uniprot':
        state, payload, detail = _fetch_uniprot(rid, need_seq)
    elif db == 'pdb':
        if need_seq:
            return dict(out, state='error', detail='该来源不支持序列核验（可用: %s）' % ', '.join(_SEQ_DBS))
        state, payload, detail = _fetch_pdb(rid)
    elif db == 'ensembl':
        state, payload, detail = _fetch_ensembl(rid, need_seq)
    else:
        return dict(out, state='error', detail='未知来源: %s（可用: %s）' % (db, ', '.join(_ID_DBS)))
    out['state'] = state
    out['detail'] = detail or ''
    if payload:
        out['fields'] = payload.get('fields')
        out['sequence'] = payload.get('sequence')
        out['fasta_header'] = payload.get('fasta_header')
    return out


# ---------------------------------------------------------------- 核验层

def _eval_checks(fields, checks, db):
    """逐项评估 expect 中的比对项 → [{name, expected, observed, status, detail}]。

    status ∈ pass / fail / unsupported（unsupported = 该来源不支持或记录缺该字段，
    不能算通过；与 fail 严格区分）。
    """
    supported = _CHECKS_SUPPORTED.get(db, ())
    results = []
    for name, expected in (checks or {}).items():
        if name not in _CHECK_FIELDS:
            results.append({'name': name, 'expected': expected, 'observed': None,
                            'status': 'unsupported',
                            'detail': '未知比对项（可用: %s）' % ', '.join(sorted(_CHECK_FIELDS))})
            continue
        if name not in supported:
            results.append({'name': name, 'expected': expected, 'observed': None,
                            'status': 'unsupported', 'detail': '该来源不支持此项核验（v1）'})
            continue
        observed = (fields or {}).get(_CHECK_FIELDS[name])
        if observed is None:
            results.append({'name': name, 'expected': expected, 'observed': None,
                            'status': 'unsupported', 'detail': '记录中缺该字段，无法核验'})
            continue
        if name.endswith('_contains'):
            exp = str(expected)
            obs = str(observed)
            ok = exp.lower() in obs.lower()
            results.append({'name': name, 'expected': exp, 'observed': obs,
                            'status': 'pass' if ok else 'fail', 'detail': ''})
        else:  # length / year：整数相等
            try:
                ok = int(expected) == int(observed)
            except Exception:
                results.append({'name': name, 'expected': expected, 'observed': observed,
                                'status': 'unsupported',
                                'detail': '比对值或记录值不是整数，无法核验'})
                continue
            results.append({'name': name, 'expected': int(expected), 'observed': int(observed),
                            'status': 'pass' if ok else 'fail', 'detail': ''})
    return results


def _resolve_status(checks):
    if any(c['status'] == 'fail' for c in checks):
        return 'mismatch'
    if any(c['status'] == 'unsupported' for c in checks):
        return 'partial'
    return 'verified'


def _all_positions(text, sub, cap=50):
    pos = []
    i = text.find(sub)
    while i != -1:
        pos.append(i + 1)  # 1-based
        if len(pos) >= cap:
            break
        i = text.find(sub, i + 1)
    return pos


def _match_sequence(query, subject):
    """序列匹配：正向逐字出现（+ 链）或与反向互补一致（- 链）。"""
    q = ''.join(str(query).split()).upper().replace('U', 'T')
    s = ''.join(str(subject).split()).upper().replace('U', 'T')
    info = {'query_length': len(q), 'subject_length': len(s), 'match': False}
    if not q or not s:
        info['note'] = '查询或记录序列为空'
        return info
    fwd = _all_positions(s, q)
    if fwd:
        info.update({'match': True, 'strand': '+', 'positions_1based': fwd[:5],
                     'occurrences': len(fwd)})
        return info
    rc = _revcomp(q)
    rev = _all_positions(s, rc)
    if rev:
        info.update({'match': True, 'strand': '-', 'positions_1based': rev[:5],
                     'occurrences': len(rev),
                     'note': '查询与记录的反向互补一致（对应记录的负链读向）'})
        return info
    return info


# ---------------------------------------------------------------- 抽取层（scan）

_SCAN_PATTERNS = [
    ('ncbi_nucleotide', re.compile(r'(?:NC|NG|NM|NR|NT|NW|NZ|XM|XR)_[0-9]{6,9}(?:\.[0-9]+)?')),
    ('ncbi_protein', re.compile(r'(?:NP|XP|WP|YP|AP)_[0-9]{6,9}(?:\.[0-9]+)?')),
    ('ensembl', re.compile(r'ENS[A-Z]{0,6}[GTPE][0-9]{6,}(?:\.[0-9]+)?')),
    ('pmid', re.compile(r'PMID[ :：]{0,2}([0-9]{6,9})')),
    ('pdb', re.compile(r'PDB[ :：]{0,2}([0-9][A-Za-z0-9]{3})')),
    ('sequence', re.compile(r'(?<![A-Za-z0-9])[ACGT]{15,}(?![A-Za-z0-9])')),
]


def _scan_text(text):
    """抽取候选标识符/序列（不联网）。返回 (hits, counts)。"""
    hits = []
    seen = set()
    for kind, pat in _SCAN_PATTERNS:
        for m in pat.finditer(text):
            val = m.group(1) if (kind in ('pmid', 'pdb') and m.lastindex) else m.group(0)
            key = (kind, val)
            if key in seen:
                continue
            seen.add(key)
            a = max(0, m.start() - 40)
            b = min(len(text), m.end() + 40)
            ctx = text[a:b].replace(chr(10), ' ').replace(chr(13), ' ')
            hits.append({'kind': kind, 'value': val, 'offset': m.start(), 'context': ctx})
            if len(hits) >= MAX_SCAN_HITS:
                break
        if len(hits) >= MAX_SCAN_HITS:
            break
    hits.sort(key=lambda h: (h['offset'], h['kind']))
    counts = {}
    for h in hits:
        counts[h['kind']] = counts.get(h['kind'], 0) + 1
    return hits, counts


# ---------------------------------------------------------------- 模式实现

def _load_items(args):
    items = None
    fpath = str(args.get('items_file') or '').strip()
    raw_json = args.get('items_json')
    if fpath:
        p = os.path.expanduser(fpath)
        if not os.path.exists(p):
            raise ValueError('items_file 不存在: ' + fpath)
        raw = open(p, 'rb').read().decode('utf-8', errors='replace')
        try:
            items = json.loads(raw)
        except Exception as e:
            raise ValueError('items_file 不是合法 JSON: %s' % e)
    elif raw_json is not None and str(raw_json).strip():
        try:
            items = json.loads(str(raw_json))
        except Exception as e:
            raise ValueError('items_json 不是合法 JSON: %s' % e)
    if items is None:
        raise ValueError('需要 items_json 或 items_file（JSON 数组）')
    if not isinstance(items, list) or not items:
        raise ValueError('items 须为非空 JSON 数组')
    if len(items) > MAX_ITEMS:
        raise ValueError('单次最多 %d 条（当前 %d）：请拆分批次' % (MAX_ITEMS, len(items)))
    return items


def _audit_item(mode, idx, item):
    base = {'index': idx}
    try:
        if not isinstance(item, dict):
            return dict(base, status='error', detail='条目须为对象（dict）')
        db = str(item.get('db') or '').strip().lower()
        db = _DB_ALIASES.get(db, db)
        rid = str(item.get('id') or item.get('accession') or '').strip()
        if not db:
            return dict(base, status='error', detail='缺少 db 字段')
        if db not in _ID_DBS:
            return dict(base, status='error', detail='未知来源: %s（可用: %s）' % (db, ', '.join(_ID_DBS)))
        if not rid:
            return dict(base, db=db, status='error', detail='缺少 id 字段')

        if mode == 'sequences':
            if db not in _SEQ_DBS:
                return dict(base, db=db, id=rid, status='error',
                            detail='该来源不支持序列核验（可用: %s）' % ', '.join(_SEQ_DBS))
            query = str(item.get('sequence') or '').strip()
            if not query:
                return dict(base, db=db, id=rid, status='error', detail='缺少 sequence 字段')

        expect = item.get('expect') or {}
        if expect and not isinstance(expect, dict):
            return dict(base, db=db, id=rid, status='error', detail='expect 须为对象')

        fr = _fetch_record(db, rid, need_seq=(mode == 'sequences'))
        out = dict(base, db=db, id=rid, source=fr['source'], retrieved_at=fr['retrieved_at'])
        state = fr['state']
        if state == 'not_found':
            out.update(status='not_found', detail=fr['detail'] or '权威源无此记录')
            return out
        if state in ('unreachable', 'error'):
            out.update(status=state, detail=fr['detail'])
            return out
        fields = fr.get('fields') or {}

        if mode == 'sequences':
            seq = fr.get('sequence') or ''
            if not seq:
                out.update(status='error',
                           detail='记录存在，但未能取得序列（%s）' % (fr.get('detail') or '未知'))
                return out
            match = _match_sequence(query, seq)
            if match.get('match'):
                out.update(status='verified', match=match, sequence_length=len(seq),
                           evidence={'fasta_header': fr.get('fasta_header'),
                                     'accession': fields.get('accession')})
            else:
                out.update(status='mismatch', match=match,
                           detail='未在记录中检到该序列（正向与反向互补均未命中）',
                           sequence_length=len(seq),
                           evidence={'fasta_header': fr.get('fasta_header'),
                                     'accession': fields.get('accession')})
            return out

        checks = _eval_checks(fields, expect, db)
        status = _resolve_status(checks)
        warnings = []
        if not expect:
            warnings.append('未提供比对项（expect）：仅核验存在性；verified 仅表示记录存在')
        out.update(status=status, checks=checks, evidence=fields, warnings=warnings)
        if status == 'mismatch':
            out['detail'] = '存在性通过，但 %d 项比对失败' % sum(
                1 for c in checks if c['status'] == 'fail')
        return out
    except Exception as e:
        return dict(base, status='error',
                    detail='条目处理异常: %s: %s' % (type(e).__name__, str(e)[:160]))


def _run_audit(mode, args):
    items = _load_items(args)
    audited = [_audit_item(mode, i, it) for i, it in enumerate(items)]
    summary = {'total': len(audited)}
    for st in STATUS_ORDER:
        summary[st] = sum(1 for x in audited if x.get('status') == st)
    summary['all_verified'] = summary['total'] > 0 and summary['verified'] == summary['total']
    result = {
        'mode': mode,
        'method': {
            'name': 'genie.source_audit.v1',
            'semantics': ('verified=存在性+全部请求项通过；mismatch=有失败项；'
                          'partial=存在性通过但部分请求项无法核验；not_found=源明确无记录；'
                          'unreachable=未能查询（不是准确性结论）；error=条目无法处理'),
            'sources': sorted({x['source'] for x in audited if x.get('source')}),
            'limits': {'max_items': MAX_ITEMS, 'pace_seconds': PACE_SECONDS},
            'scope_note': '仅报告所查项（存在性 + expect/sequence 中列出的内容）；不推断未查内容。',
        },
        'summary': summary,
        'items': audited,
        'retrieved_at': _now_iso(),
    }
    md_path = str(args.get('out_md') or '').strip()
    if md_path:
        result['report_file'] = _write_md(os.path.expanduser(md_path), result)
    return result


def _run_scan(args):
    text = args.get('text')
    fpath = str(args.get('file') or '').strip()
    if fpath:
        p = os.path.expanduser(fpath)
        if not os.path.exists(p):
            raise ValueError('文件不存在: ' + fpath)
        size = os.path.getsize(p)
        if size > MAX_TEXT_BYTES:
            raise ValueError('文件过大（%d 字节 > 上限 %d）：请拆分后再扫描' % (size, MAX_TEXT_BYTES))
        with open(p, 'rb') as f:
            text = f.read().decode('utf-8', errors='replace')
    if not text or not str(text).strip():
        raise ValueError('scan 模式需要 text 或 file 之一')
    hits, counts = _scan_text(str(text))
    return {
        'mode': 'scan',
        'counts': counts,
        'candidates': hits,
        'note': ('候选清单（正则抽取、未核验、可能含误报）；对需要的条目用 '
                 'identifiers / sequences 模式逐项核验。本模式不联网。'),
        'limits': {'max_hits': MAX_SCAN_HITS},
    }


def _write_md(path, result):
    lines = []
    lines.append('# 来源审计报告（genie.source_audit.v1）')
    lines.append('')
    lines.append('- 模式: %s' % result['mode'])
    lines.append('- 时间(UTC): %s' % result['retrieved_at'])
    s = result['summary']
    lines.append('- 汇总: 共 %d；verified %d / mismatch %d / partial %d / '
                 'not_found %d / unreachable %d / error %d' % (
                     s['total'], s['verified'], s['mismatch'], s['partial'],
                     s['not_found'], s['unreachable'], s['error']))
    lines.append('')
    for it in result['items']:
        head = '- [%s] #%d %s / %s' % (str(it.get('status', '?')).upper(),
                                       it.get('index', 0) + 1,
                                       it.get('db', '?'), it.get('id', '?'))
        if it.get('detail'):
            head += ' — %s' % it['detail']
        lines.append(head)
        for c in it.get('checks') or []:
            lines.append('    - %s: %s（期望 %s / 实测 %s）' % (
                c.get('name'), c.get('status'), c.get('expected'), c.get('observed')))
        m = it.get('match')
        if m:
            lines.append('    - 序列匹配: %s链 位置%s（查询 %s nt / 记录 %s nt）' % (
                m.get('strand'), m.get('positions_1based'), m.get('query_length'),
                m.get('subject_length')))
        for w in it.get('warnings') or []:
            lines.append('    - 注意: %s' % w)
    lines.append('')
    lines.append('> 语义提醒：not_found=源明确无记录；unreachable=未能查询（不是准确性结论）；'
                 '本报告仅覆盖所查项。')
    abspath = os.path.abspath(path)
    parent = os.path.dirname(abspath)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(abspath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(chr(10).join(lines) + chr(10))
    return abspath


# ---------------------------------------------------------------- 入口

def op_source_audit(args):
    """bio_source_audit 工具入口：按 mode 分发。"""
    mode = str(args.get('mode') or '').strip().lower()
    if mode == 'scan':
        return _run_scan(args)
    if mode in ('identifiers', 'sequences'):
        return _run_audit(mode, args)
    raise ValueError('mode 必须为 identifiers / sequences / scan（当前: %r）' % args.get('mode'))
