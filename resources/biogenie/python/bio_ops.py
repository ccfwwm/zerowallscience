"""dsh-biology Python 操作层 — JSON 协议分发器

TS 侧通过 stdin 发送 {"op": "...", "args": {...}}，本脚本执行后
将 {"ok": true, "result": ...} 或 {"ok": false, "error": "..."} 写到 stdout。

每个 op 对应一个生物学操作，内部使用 Biopython。新增功能 = 新增 op 函数 + 注册。
"""
import json
import os
import sys
import traceback

# Windows 下 sys.stdin/stdout 默认按 GBK（locale）编解码，而 Node 侧
# 以 UTF-8 写入/读取。不显式重配置会导致中文参数/结果损坏。强制 UTF-8。
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# -I（isolated）模式下脚本目录不进 sys.path，同目录的 figurelib 包因此
# 不可 import。显式把脚本目录加回（仅插件自己的 payload 目录，不污染宿主）。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 网络 op 统一 20s 单请求上限：慢网络（如中国直连 NCBI）下防无限挂起。
# 带显式 timeout 参数的请求（enrichr/ref_genome）以各自参数为准。
import socket
# ---- ML 工具 ----
from ml_tools import op_ml_pipeline
from ml_tools_2 import op_ml_reduce, op_ml_feature, op_ml_cluster
from ml_tools_3 import op_stats_test
from dna_design import op_primer_design, op_seq_optimize
from dna_design_2 import op_assembly_design, op_plasmid_map
from deg_tools import op_deseq2_python, op_gsea_python
from synbio_tools import (op_primer3_design, op_dna_optimize, op_clone_simulate,
                          op_sbol_write, op_sbol_read)
from crispr_tools import op_crispr_guide, op_crispr_verify
from syncheck_tools import op_dna_syncheck
from wetlab_tools import op_wetlab_design
from circuit_tools import op_circuit_compile, op_circuit_simulate
# 质粒库检索（Addgene 公开目录页，零新增依赖：stdlib urllib + re）
from plasmid_repo import op_plasmid_search, op_plasmid_info
# 能力补缺（内含子外显子/点阵图/UniProt/树比较/RNA 折叠，2026-09-16）
from analysis_ext import (op_seq_introns, op_seq_dotplot, op_uniprot,
                          op_phylo_compare, op_rna_fold)
# 单细胞 RNA-seq 质控（scanpy，第二层按需依赖，2026-09-16）
from sc_tools import op_sc_qc
socket.setdefaulttimeout(20)
from retry_utils import retry_on_network_error


def _entrez():
    """配置好的 Bio.Entrez：单请求 20s（socket 级）+ 最多 2 试 + 5s 间隔。

    Bio.Entrez 默认 3 试 × 15s 间隔，最坏 3×30+30=120s 恰好顶满工具层超时；
    收紧后最坏 2×20+5=45s，保留一次重试应对瞬断。
    同时设置默认 email/tool 声明：匿名流量更易被 NCBI 限流，且无法溯源。
    调用方传了 email 参数时会被覆盖为调用方的值。
    """
    from Bio import Entrez
    Entrez.max_tries = 2
    Entrez.sleep_between_tries = 5
    if not getattr(Entrez, 'email', None):
        # 插件级默认声明（NCBI 建议提供联系方式；用户可在调用参数里覆盖）
        Entrez.email = 'dsh-bio-genie@users.noreply.github.com'
        Entrez.tool = 'dsh-bio-genie'
    return Entrez

# ---- 序列分析 ----

def op_seq_analyze(args):
    """分析 DNA/RNA/蛋白质序列：长度、GC%、翻译、互补、分子量等。"""
    from Bio.Seq import Seq
    from Bio.SeqUtils import gc_fraction, molecular_weight

    sequence = args['sequence']
    seq_type = args.get('seq_type', 'auto')  # auto | dna | rna | protein
    s = Seq(sequence)
    result = {
        'length': len(s),
        'sequence': sequence.upper(),
    }

    # 自动判断序列类型（含蛋白启发式：出现非核酸字母判为蛋白）
    if seq_type == 'auto':
        upper = sequence.upper()
        # 完整 IUPAC DNA 字母表：ACGTN + 模糊碱基 RYSWKMBDHV + X（未知/修饰碱基，
        # 引物/探针/SNP 标记常用；Biopython 的 gc_fraction/reverse_complement/translate 均支持 X）
        # + gap 字符 -/.（比对结果/多序列比对常见；只含核酸+gap 的序列判 DNA 而非蛋白，
        # 蛋白序列由于几乎总含 DNA 字母表外的氨基酸（E/L/P/Q/I/F 等）不受影响）
        dna_iupac = set('ACGTRYSWKMBDHVNX-.')
        if 'U' in upper and 'T' not in upper:
            seq_type = 'rna'
        elif set(upper) - dna_iupac - {'U'}:
            seq_type = 'protein'
        else:
            seq_type = 'dna'

    if seq_type in ('dna', 'rna'):
        result['seq_type'] = seq_type
        result['gc_fraction'] = gc_fraction(s)
        result['gc_percent'] = round(gc_fraction(s) * 100, 2)
        result['reverse_complement'] = str(s.reverse_complement())

        if seq_type == 'dna':
            result['complement'] = str(s.complement())
            # 六框翻译：正链 3 框 + 负链（反向互补）3 框。
            # 含 X（未知/修饰碱基）或 gap 字符（-/.，比对序列常见）的序列直接 translate
            # 会因 XXG / --A / ... 等模糊密码子抛 TranslationError——翻译前统一把
            # X → N、gap → N（未知碱基），Biopython 对 N 密码子正常翻译为 X 氨基酸，
            # 避免整个分析失败（长度不变，逐位对齐保持一致）。
            rc = s.reverse_complement()
            translate_seq = s.replace('X', 'N').replace('-', 'N').replace('.', 'N')
            translate_rc = rc.replace('X', 'N').replace('-', 'N').replace('.', 'N')
            frames = {}
            for frame in range(3):
                frames[f'+{frame + 1}'] = str(translate_seq[frame:].translate(to_stop=False))
                frames[f'-{frame + 1}'] = str(translate_rc[frame:].translate(to_stop=False))
            result['translations'] = frames
        elif seq_type == 'rna':
            result['complement'] = str(s.complement())
            # 与 DNA 分支一致：含 X 的 RNA（探针/引物常见修饰碱基）或 gap 序列翻译前
            # X/gap → N，避免 XXA / --A 等模糊密码子抛 TranslationError（WB 第二轮 S2 确认）
            translate_rna = s.replace('X', 'N').replace('-', 'N').replace('.', 'N')
            frames = {}
            for frame in range(3):
                frames[f'+{frame + 1}'] = str(translate_rna[frame:].translate())
            result['translations'] = frames

    if seq_type == 'protein':
        result['seq_type'] = 'protein'
        try:
            result['molecular_weight'] = round(molecular_weight(s, seq_type='protein'), 2)
        except ValueError:
            # 蛋白序列含 X（未知氨基酸，如重组蛋白 N 端 X 标记）时 molecular_weight
            # 会抛 ValueError——降级为 None，避免整个分析失败
            result['molecular_weight'] = None
        # 氨基酸组成
        from collections import Counter
        result['aa_composition'] = dict(Counter(sequence.upper()))

    if seq_type == 'dna' and args.get('codon_stats'):
        result['codon_stats'] = _codon_usage_stats(sequence.upper(),
                                                   args.get('codon_host', 'ecoli'))

    return result


# 宿主最优密码子表（与 dna_design.op_seq_optimize 保持一致，三处宿主）
_OPTIMAL_CODON_TABLES = {
    'ecoli': {
        'A': 'GCC', 'R': 'CGT', 'N': 'AAC', 'D': 'GAT', 'C': 'TGC',
        'E': 'GAA', 'Q': 'CAG', 'G': 'GGC', 'H': 'CAT', 'I': 'ATC',
        'L': 'CTG', 'K': 'AAA', 'M': 'ATG', 'F': 'TTT', 'P': 'CCG',
        'S': 'AGC', 'T': 'ACC', 'W': 'TGG', 'Y': 'TAT', 'V': 'GTG',
    },
    'human': {
        'A': 'GCC', 'R': 'CGC', 'N': 'AAC', 'D': 'GAC', 'C': 'TGC',
        'E': 'GAG', 'Q': 'CAG', 'G': 'GGC', 'H': 'CAC', 'I': 'ATC',
        'L': 'CTG', 'K': 'AAG', 'M': 'ATG', 'F': 'TTC', 'P': 'CCC',
        'S': 'AGC', 'T': 'ACC', 'W': 'TGG', 'Y': 'TAC', 'V': 'GTG',
    },
    'yeast': {
        'A': 'GCT', 'R': 'AGA', 'N': 'AAT', 'D': 'GAT', 'C': 'TGT',
        'E': 'GAA', 'Q': 'CAA', 'G': 'GGT', 'H': 'CAT', 'I': 'ATT',
        'L': 'TTG', 'K': 'AAG', 'M': 'ATG', 'F': 'TTT', 'P': 'CCA',
        'S': 'TCT', 'T': 'ACT', 'W': 'TGG', 'Y': 'TAT', 'V': 'GTT',
    },
}


def _codon_usage_stats(sequence, host='ecoli'):
    """简化密码子使用统计：最优密码子占比（非严格 CAI，供快速评估宿主适配）。"""
    from collections import Counter
    import Bio.Data.CodonTable as CT

    table = _OPTIMAL_CODON_TABLES.get(host)
    if table is None:
        return {'error': f'unknown codon_host: {host}',
                'supported': list(_OPTIMAL_CODON_TABLES.keys())}
    if len(sequence) % 3 != 0:
        return {'note': f'序列长度 {len(sequence)} 不是 3 的倍数，跳过密码子统计'}
    codons = [sequence[i:i + 3] for i in range(0, len(sequence), 3)]
    counter = Counter(codons)
    std = CT.unambiguous_dna_by_id[1]
    opt_count = 0
    for codon, cnt in counter.items():
        aa = std.forward_table.get(codon)
        if aa is not None and table.get(aa, '') == codon:
            opt_count += cnt
    total = len(codons)
    return {
        'host': host,
        'total_codons': total,
        'optimal_codons': opt_count,
        'optimal_codon_ratio': round(opt_count / total * 100, 1),
        'top_codons': dict(counter.most_common(8)),
        'note': '最优密码子占比为简化指标（基于宿主最优密码子表，非严格 CAI）；'
                '需要全基因组建参考的 CAI 时用 bio_python 计算。',
    }


def op_seq_translate(args):
    """翻译 DNA/RNA 为蛋白质。"""
    from Bio.Seq import Seq
    s = Seq(args['sequence'])
    table = args.get('table', 1)
    to_stop = args.get('to_stop', False)
    result = {
        'protein': str(s.translate(table=table, to_stop=to_stop)),
        'table': table,
        'to_stop': to_stop,
    }
    return result


def op_seq_gc_skew(args):
    """计算 GC skew (G-C)/(G+C)，可窗口化。"""
    from Bio.SeqUtils import GC_skew
    sequence = args['sequence']
    window = args.get('window', 100)
    skews = GC_skew(sequence, window=window)
    return {'window': window, 'gc_skew': [round(float(v), 4) for v in skews]}


def op_seq_find_orf(args):
    """查找最长 ORF（开放阅读框）。"""
    from Bio.Seq import Seq
    sequence = args['sequence']
    min_len = args.get('min_len', 30)  # 至少 10 个密码子
    table = args.get('table', 1)
    s = Seq(sequence)
    best = None
    for frame in range(3):
        for start in range(frame, len(s) - 2, 3):
            # 从 ATG 开始
            if s[start:start + 3] != 'ATG':
                continue
            for end in range(start + 3, len(s) - 2, 3):
                codon = s[end:end + 3]
                if codon in ('TAA', 'TAG', 'TGA'):
                    length = end - start + 3
                    if length >= min_len and (best is None or length > best['length']):
                        best = {
                            'start': start,
                            'end': end + 3,
                            'length': length,
                            'frame': frame + 1,
                            'protein': str(s[start:end + 3].translate(table=table, to_stop=True)),
                        }
                    break
    return {'orf': best}


def op_seq_restriction(args):
    """限制酶位点分析。"""
    from Bio.Restriction import RestrictionBatch, AllEnzymes, CommOnly
    from Bio.Seq import Seq

    sequence = args['sequence']
    enzymes = args.get('enzymes', None)  # 如 ["EcoRI", "BamHI"]，None = 全部
    enzyme_set = args.get('enzyme_set', 'commonly')  # commonly(商业常用) | all(含虚构)
    linear = args.get('linear', True)  # 线性/环状影响位点计数
    detail = bool(args.get('detail', False))  # false=摘要（每位点最多 10 个坐标）；true=全部
    s = Seq(sequence)

    if enzymes:
        batch = RestrictionBatch()
        missing = []
        for e in enzymes:
            try:
                batch.add(e)
            except Exception:
                missing.append(e)
    else:
        # 不指定 → 默认分析商业常用酶（CommOnly ~700 种）；enzyme_set=all 时用全量 AllEnzymes
        batch = RestrictionBatch(first=CommOnly if enzyme_set == 'commonly' else AllEnzymes)

    sites = {}
    for enz in batch:
        hits = enz.search(s, linear=linear)
        if hits:
            positions = [int(p) for p in hits]
            entry = {
                'recognition_site': enz.site,
                'count': len(hits),
            }
            # 摘要瘦身：detail=false 时——全库扫描只给计数（避免 45KB 级超长输出），
            # 指定酶列表时给坐标（≤10 个 + truncated 标记）；detail=true 给全部。
            if detail:
                entry['cut_positions'] = positions
            elif enzymes:
                entry['cut_positions'] = positions[:10]
                if len(positions) > 10:
                    entry['cut_positions_truncated'] = True
            sites[str(enz)] = entry
    result = {'sites': sites,
              'coordinate_base': '1-based',
              'cut_positions_are': 'cut site position (1-based, first base after the cut; '
                                   '不等于识别位点起始，offset 由酶切模式决定，如 NdeI 在识别位点后第 3 碱基处切割)'}
    if not detail and not enzymes:
        result['summary_note'] = ('全库扫描摘要模式：每位点仅返回识别位点与计数；'
                                  '需要坐标请传 detail=true 或指定 enzymes 列表')
    if enzymes:
        result['requested'] = enzymes
        if missing:
            result['missing_enzymes'] = missing
    return result


def op_seq_io_read(args):
    """读取序列文件（FASTA/GenBank 等），返回记录摘要。"""
    from Bio import SeqIO
    path = args['path']
    fmt = args.get('format', None)  # 不指定则自动推断
    limit = args.get('limit', 50)
    if fmt is None:
        # 简单自动推断
        lower = path.lower()
        if lower.endswith(('.fa', '.fasta', '.fna', '.ffn', '.faa', '.fas')):
            fmt = 'fasta'
        elif lower.endswith(('.gb', '.genbank', '.gbk')):
            fmt = 'genbank'
        else:
            fmt = 'fasta'
    records = []
    count = 0
    # 编码容错：先读原始字节，再尝试 UTF-8 解码，失败回退 GBK（中文 Windows 常见）。
    # 注意：open(encoding=...) 是惰性的，UnicodeDecodeError 在迭代时才抛，所以必须显式 decode。
    import io
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        text = raw.decode('gbk', errors='replace')
    handle = io.StringIO(text)
    for rec in SeqIO.parse(handle, fmt):
        if count >= limit:
            break
        records.append({
            'id': rec.id,
            'name': rec.name,
            'description': rec.description,
            'length': len(rec.seq),
            'seq_preview': str(rec.seq[:100]),
        })
        count += 1
    return {'format': fmt, 'count': count, 'records': records}


def op_seq_io_write(args):
    """写序列到文件（FASTA）。"""
    from Bio.Seq import Seq
    from Bio.SeqRecord import SeqRecord
    from Bio import SeqIO
    path = args['path']
    records = args['records']  # [{id, sequence, description?}]
    fmt = args.get('format', 'fasta')
    seq_records = [
        SeqRecord(Seq(r['sequence']), id=r['id'], name=r.get('name', r['id']),
                  description=r.get('description', ''))
        for r in records
    ]
    SeqIO.write(seq_records, path, fmt)
    return {'path': path, 'format': fmt, 'written': len(seq_records)}


def op_seq_kmer(args):
    """k-mer 频率统计。"""
    from collections import Counter
    sequence = args['sequence'].upper()
    k = args.get('k', 3)
    if k < 1:
        raise ValueError('k must be >= 1')
    counts = Counter(sequence[i:i + k] for i in range(len(sequence) - k + 1))
    top = args.get('top', 10)
    return {
        'k': k,
        'total_kmers': len(sequence) - k + 1,
        'unique_kmers': len(counts),
        'top': dict(counts.most_common(top)),
    }


# 常用 Entrez 数据库清单（报错指引用；2026-09-19 审计 P2：db='patents' 时
# Bio.Entrez 的 'Invalid db name' 原样透传、调用方无从知道可用库）。不拦截
# 合法用法（E-utilities 直通），只在「Invalid db name」报错时给出可行动清单。
_ENTREZ_COMMON_DBS = ('pubmed', 'protein', 'nucleotide', 'nuccore', 'gene', 'genome',
                      'assembly', 'bioproject', 'biosample', 'snp', 'structure',
                      'taxonomy', 'pmc', 'mesh', 'geo')


@retry_on_network_error(max_retries=2, delay=3)
def op_entrez_search(args):
    """NCBI Entrez 检索：esearch + efetch 摘要。"""
    Entrez = _entrez()
    term = args['term']
    db = args.get('db', 'nucleotide')
    retmax = args.get('retmax', 5)
    email = args.get('email', None)
    if email:
        Entrez.email = email
    try:
        handle = Entrez.esearch(db=db, term=term, retmax=retmax)
        search = Entrez.read(handle)
    except RuntimeError as e:
        if 'Invalid db name' in str(e):
            raise ValueError(
                f'不支持的 Entrez 数据库: {db!r}（NCBI 报错原文: {e}）。'
                f'常用库: {", ".join(_ENTREZ_COMMON_DBS)}。'
                f'注意：本工具走 NCBI E-utilities，不包含专利库；完整 db 列表见 '
                f'https://www.ncbi.nlm.nih.gov/books/NBK25497/'
            ) from e
        raise
    handle.close()
    ids = search.get('IdList', [])
    summaries = []
    if ids and db in ('nucleotide', 'protein', 'gene'):
        try:
            shandle = Entrez.esummary(db=db, id=','.join(ids))
            records = Entrez.read(shandle)
            shandle.close()
            if db == 'gene':
                # gene esummary 解析结果包了 DocumentSummarySet → DocumentSummary 两层
                # （与 nucleotide/protein 直接返回 ListElement 不同）
                ds = records.get('DocumentSummarySet', {}) if isinstance(records, dict) else {}
                items = ds.get('DocumentSummary', []) if isinstance(ds, dict) else []
                if isinstance(items, dict):
                    items = [items]
                # gene docsum 不含 UID 字段，用 esearch 的 IdList 按序回填
                for uid, r in zip(ids, items):
                    ginfo = (r.get('GenomicInfo') or [{}])[0] if r.get('GenomicInfo') else {}
                    summaries.append({
                        'id': uid,
                        'name': r.get('Name', ''),
                        'description': r.get('Description', ''),
                        'chromosome': r.get('Chromosome', ''),
                        'map_location': r.get('MapLocation', ''),
                        'chr_start': ginfo.get('ChrStart', ''),
                        'chr_stop': ginfo.get('ChrStop', ''),
                        'aliases': r.get('OtherAliases', ''),
                        'summary': (r.get('Summary', '') or '')[:300],
                    })
            else:
                for r in records:
                    summaries.append({
                        'id': r.get('Id', r.get('uid', '')),
                        'title': r.get('Title', ''),
                        'length': r.get('Length', ''),
                        'accession': r.get('Caption', r.get('Accession', '')),
                    })
        except Exception as e:
            summaries = [{'id': i, 'note': f'summary fetch failed: {e}'} for i in ids]
    out = {'db': db, 'count': int(search.get('Count', 0)), 'ids': ids, 'summaries': summaries}
    if out['count'] == 0:
        out['_hint'] = ('无匹配结果。建议：① 简化查询词（去掉过于严格的 field 限定，'
                        '如 [Organism]/[Gene Name]/AND 组合）；② 改用宽松字段 '
                        '（如 *[Title] 或 [All Fields]）；③ 减少引号精确匹配与多余括号；'
                        '④ 或先只检索 keyword 再在本地过滤。')
    return out


def op_entrez_fetch(args):
    """NCBI Entrez fetch：取序列。"""
    Entrez = _entrez()
    from Bio import SeqIO
    ids = args['ids']
    db = args.get('db', 'nucleotide')
    rettype = args.get('rettype', 'fasta')
    email = args.get('email', None)
    if email:
        Entrez.email = email
    handle = Entrez.efetch(db=db, id=','.join(ids), rettype=rettype, retmode='text')
    text = handle.read()
    handle.close()
    return {'db': db, 'rettype': rettype, 'data': text[:50000]}


@retry_on_network_error(max_retries=2, delay=3)
def op_enrichr(args):
    """Enrichr 通路/功能富集分析（maayanlab REST，两步：addList → enrich）。

    零新增依赖：urllib 标准库即可。生物背景：给定基因符号列表，
    返回其在 GO/KEGG/Reactome 等库中的显著富集条目（p 值、基因重叠）。
    """
    import json
    import urllib.parse
    import urllib.request

    genes = args['genes']
    if not isinstance(genes, list) or not genes:
        raise ValueError('genes must be a non-empty list of gene symbols')
    library = args.get('library', 'GO_Biological_Process_2023')
    top = int(args.get('top', 10))

    def _multipart_post(url, fields, timeout):
        # Enrichr addList 官方 API 用 multipart/form-data（requests files= 参数），
        # JSON POST 会被 400 拒绝。stdlib 手工构造 multipart 体。
        from uuid import uuid4
        boundary = '----dshbio' + uuid4().hex
        body = b''
        for name, value in fields.items():
            body += (f'--{boundary}\r\n'
                     f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                     f'{value}\r\n').encode('utf-8')
        body += f'--{boundary}--\r\n'.encode('utf-8')
        req = urllib.request.Request(
            url, data=body, method='POST',
            headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))

    # 1) 提交基因列表，换 userListId
    res = _multipart_post('https://maayanlab.cloud/Enrichr/addList',
                          {'list': '\n'.join(str(g).strip() for g in genes if str(g).strip()),
                           'description': 'dsh-bio-genie enrichment'},
                          timeout=30)
    user_list_id = res.get('userListId')
    if not user_list_id:
        raise ValueError(f'Enrichr addList 失败: {res}')

    # 2) 拉取富集结果。响应形如 {<library>: [[rank, term, p, z, combined, genes, adj_p], ...]}
    url = ('https://maayanlab.cloud/Enrichr/enrich'
           f'?userListId={user_list_id}&backgroundType={urllib.parse.quote(library)}')
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    terms = data.get(library, [])

    results = []
    for t in terms[:top]:
        if not isinstance(t, (list, tuple)) or len(t) < 7:
            continue
        results.append({
            'rank': t[0],
            'term': t[1],
            'p_value': t[2],
            'odds_ratio': t[3],
            'combined_score': t[4],
            'overlap_genes': t[5],
            'overlap_count': len(t[5]) if isinstance(t[5], list) else None,
            'adjusted_p_value': t[6],
        })
    return {
        'library': library,
        'gene_count': len(genes),
        'total_terms': len(terms),
        'top': top,
        'results': results,
    }


@retry_on_network_error(max_retries=2, delay=3)
def op_pubmed_search(args):
    """PubMed 检索：esearch + esummary，返回 PMID/标题/年份/期刊/作者/DOI。"""
    Entrez = _entrez()
    term = args['term']
    retmax = args.get('retmax', 10)
    email = args.get('email', None)
    if email:
        Entrez.email = email
    handle = Entrez.esearch(db='pubmed', term=term, retmax=retmax)
    search = Entrez.read(handle)
    handle.close()
    ids = search.get('IdList', [])
    results = []
    if ids:
        try:
            shandle = Entrez.esummary(db='pubmed', id=','.join(ids))
            records = Entrez.read(shandle)
            shandle.close()
            for r in records:
                article_ids = r.get('ArticleIds') or {}
                results.append({
                    'pmid': r.get('Id', ''),
                    'title': r.get('Title', ''),
                    'journal': r.get('FullJournalName', ''),
                    'date': r.get('PubDate', ''),
                    'authors': r.get('AuthorList', [])[:10],
                    'doi': article_ids.get('doi', ''),
                    'has_abstract': r.get('HasAbstract', 0),
                })
        except Exception as e:
            results = [{'pmid': i, 'note': f'summary fetch failed: {e}'} for i in ids]
    return {'db': 'pubmed', 'count': int(search.get('Count', 0)), 'pmids': ids, 'results': results}


def _pubmed_abstract_text(ab):
    """AbstractText 可能是 str / str 列表 / 分节 dict 列表（Label + #text）。"""
    if not isinstance(ab, dict):
        return str(ab or '')
    t = ab.get('AbstractText', '')
    if isinstance(t, str):
        return t
    if isinstance(t, list):
        parts = []
        for seg in t:
            if isinstance(seg, str):
                parts.append(seg)
            elif isinstance(seg, dict):
                label = seg.get('Label', '')
                txt = seg.get('#text', '')
                parts.append(f'[{label}] {txt}' if label else str(txt))
        return '\n'.join(p for p in parts if p)
    return str(t)


def op_pubmed_abstract(args):
    """按 PMID 取结构化摘要：标题/摘要/作者/期刊/日期/DOI。

    rettype=medline retmode=xml（text 模式是纯文本无法解析；Entrez.read 解析
    PubmedArticleSet）。走 Entrez.parse 会因根节点不是列表报错，故用 read。
    """
    import io
    Entrez = _entrez()
    ids = args['ids']
    if not isinstance(ids, list) or not ids:
        raise ValueError('ids must be a non-empty list of PMIDs')
    email = args.get('email', None)
    if email:
        Entrez.email = email
    handle = Entrez.efetch(db='pubmed', id=','.join(str(i) for i in ids),
                           rettype='medline', retmode='xml')
    data = handle.read()
    handle.close()
    parsed = Entrez.read(io.BytesIO(data))
    articles = parsed.get('PubmedArticle', [])
    if isinstance(articles, dict):
        articles = [articles]

    results = []
    for a in articles:
        med = a.get('MedlineCitation', {})
        art = med.get('Article', {})
        journal = art.get('Journal', {})
        pubdate = (journal.get('JournalIssue') or {}).get('PubDate', {})
        date = pubdate.get('Year', '')
        if pubdate.get('Month'):
            date = f"{date} {pubdate['Month']}"
        authors = []
        for au in art.get('AuthorList', []) or []:
            if isinstance(au, dict) and au.get('CollectiveName'):
                authors.append(au['CollectiveName'])
            elif isinstance(au, dict):
                authors.append(f"{au.get('LastName', '')} {au.get('ForeName', '')}".strip())
        # DOI：medline XML 的 ELocationID 是裸值（属性 EIdType='doi'），
        # 与 esummary 的 'doi: xxxx' 字符串形式不同，需按属性判断
        doi = ''
        eloc = art.get('ELocationID', '')
        if isinstance(eloc, list):
            for x in eloc:
                attrs = getattr(x, 'attributes', {}) or {}
                if attrs.get('EIdType') == 'doi' or str(x).startswith('doi'):
                    doi = str(x).replace('doi:', '').strip()
                    break
        elif eloc:
            doi = str(eloc).replace('doi:', '').strip()
        results.append({
            'pmid': med.get('PMID', ''),
            'title': art.get('ArticleTitle', ''),
            'abstract': _pubmed_abstract_text(art.get('Abstract')),
            'authors': authors,
            'journal': journal.get('Title', ''),
            'date': date,
            'doi': doi,
        })
    return {'db': 'pubmed', 'count': len(results), 'results': results}


def op_ref_genome(args):
    """参考基因组 assembly 信息（Ensembl REST）。

    Ensembl 要求显式 User-Agent 头（默认 urllib UA 会被 429 拒绝）。
    主站失败自动切 asia.ensembl.org 镜像。
    """
    import json
    import urllib.request

    SPECIES_ALIAS = {
        'human': 'homo_sapiens',
        'mouse': 'mus_musculus',
        'rat': 'rattus_norvegicus',
        'zebrafish': 'danio_rerio',
        'fly': 'drosophila_melanogaster',
        'drosophila': 'drosophila_melanogaster',
        'worm': 'caenorhabditis_elegans',
        'c.elegans': 'caenorhabditis_elegans',
        'arabidopsis': 'arabidopsis_thaliana',
        'rice': 'oryza_sativa',
        'yeast': 'saccharomyces_cerevisiae',
        'ecoli': 'escherichia_coli',
    }
    species = args['species'].strip().lower()
    species = SPECIES_ALIAS.get(species, species)

    headers = {'User-Agent': 'dsh-bio-genie/0.1.4'}
    url = f'https://rest.ensembl.org/info/assembly/{species}?content-type=application/json'
    # 网络策略（WB 审查发现）：部分代理环境对 rest.ensembl.org 超时/404，
    # 直连稳定。因此直连优先，失败回退系统代理。
    # 注意：只有 rest.ensembl.org 一个 host —— asia.ensembl.org 是网页门户
    # 而非 REST API，/info/assembly/ 路径必然 404，不可作 fallback。
    openers = (
        ('direct', urllib.request.build_opener(urllib.request.ProxyHandler({}))),
        ('proxy', urllib.request.build_opener()),
    )
    last_err = None
    for label, opener in openers:
        try:
            req = urllib.request.Request(url, headers=headers)
            with opener.open(req, timeout=15 if label == 'direct' else 30) as resp:
                d = json.loads(resp.read().decode('utf-8'))
            # 目录名首字母大写（Homo_sapiens）
            sdir = species[0].upper() + species[1:]
            # top_level_region 含数百条 scaffold，压缩为染色体列表 + scaffold 计数
            regions = d.get('top_level_region', [])
            chromosomes = [r for r in regions if r.get('coord_system') == 'chromosome']
            chromosomes.sort(key=lambda r: (int(r['name']), 0) if str(r.get('name', '')).isdigit() else (99, str(r.get('name', ''))))
            return {
                'species': species,
                'assembly_name': d.get('assembly_name', ''),
                'assembly_accession': d.get('assembly_accession', ''),
                'assembly_date': d.get('assembly_date', ''),
                'karyotype': d.get('karyotype', ''),
                'chromosomes': [
                    {'name': c.get('name'), 'length': c.get('length')} for c in chromosomes
                ],
                'scaffold_count': len(regions) - len(chromosomes),
                'download_urls': {
                    'fasta_dir': f'https://ftp.ensembl.org/pub/current_fasta/{sdir}/dna/',
                    'gtf_dir': f'https://ftp.ensembl.org/pub/current_gtf/{sdir}/',
                },
            }
        except Exception as e:
            last_err = e
    raise RuntimeError(
        f'Ensembl assembly 查询失败（{species}）: {last_err}。'
        'rest.ensembl.org 直连与系统代理均不可用；'
        '代理环境可尝试设置 NO_PROXY=rest.ensembl.org 后重试。')


def op_env_status(args):
    """环境状态：Python 版本 + 核心库可用性探测。
    让 agent 先调本工具确认 venv 有哪些库可用，再决定用哪个工具/怎么写 bio_python 代码。
    """
    import sys
    import importlib.util as ilu

    # 核心库探测：模块名 → (pip 包名, 层级, 用途)
    CORE_LIBS = [
        ('Bio',        'biopython',               'builtin', '序列/比对/BLAST/Entrez/PDB/Phylo/motifs/Restriction'),
        ('numpy',      'numpy',                   'builtin', '数值计算'),
        ('pandas',     'pandas',                  'builtin', '表格数据'),
        ('scipy',      'scipy',                   'builtin', '统计/数值（含 scipy.stats.false_discovery_control）'),
        ('sklearn',    'scikit-learn',            'builtin', '机器学习'),
        ('statsmodels','statsmodels',             'builtin', '统计建模'),
        ('matplotlib', 'matplotlib',              'builtin', '绘图'),
        ('seaborn',    'seaborn',                 'builtin', '统计图'),
        ('PIL',        'Pillow',                  'builtin', '图像'),
        ('reportlab',  'reportlab',               'builtin', 'PDF/GenomeDiagram 后端'),
        ('cobra',      'cobra',                   'builtin', '代谢建模 FBA/FVA/OptKnock'),
        ('primer3',    'primer3-py',              'auto',   '工业级引物设计（首调自动装）'),
        ('dnachisel',  'dnachisel',               'auto',   '多约束 DNA 优化（首调自动装）'),
        ('dna_features_viewer', 'dna-features-viewer', 'auto', '质粒图（首调自动装）'),
        ('sbol3',      'sbol3',                   'auto',   'SBOL 3 读写（首调自动装）'),
        ('tyto',       'tyto',                    'auto',   '本体查询（首调自动装）'),
        ('requests',   'requests',                'builtin', 'HTTP API'),
        ('pydna',      'pydna',                   'auto',   '克隆模拟（首调自动装）'),
        ('biocrnpyler','biocrnpyler',             'auto',   '基因回路编译（首调自动装）'),
        ('bioscrape',  'bioscrape',               'auto',   '回路仿真（首调自动装）'),
        ('networkx',   'networkx',                'auto',   '网络图'),
        ('scanpy',     'scanpy',                  'addon',  '单细胞（设置面板安装）'),
        ('pysam',      'pysam',                   'addon',  'NGS（设置面板安装）'),
    ]

    def version(mod_name):
        try:
            mod = __import__(mod_name)
            v = getattr(mod, '__version__', None)
            return v if v else 'present'
        except ImportError:
            return None
        except Exception:
            return 'present'

    libs = []
    for mod, pip, layer, purpose in CORE_LIBS:
        v = version(mod)
        libs.append({
            'import_name': mod,
            'pip_package': pip,
            'layer': layer,
            'installed': v is not None,
            'version': v,
            'purpose': purpose,
        })
    installed = [l for l in libs if l['installed']]
    missing = [l for l in libs if not l['installed']]
    try:
        import Bio
        bio_version = Bio.__version__
    except ImportError:
        bio_version = None
    return {
        'python': sys.version.split()[0],
        'python_path': sys.executable,
        'biopython': bio_version,
        'n_libraries_installed': len(installed),
        'n_libraries_missing': len(missing),
        'libraries': libs,
        'missing_libraries': [l['pip_package'] for l in missing],
        'note': 'builtin=环境引导时内置；auto=首次调用对应药工具时自动 uv pip install；addon=需在设置面板手动安装。',
    }


# ---- 出版级绘图（figurelib）----

def _to_jsonable(obj):
    """递归把 numpy 标量/数组转成原生 JSON 类型（fig_profile 报告含 numpy 值）。"""
    import numpy as np
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return _to_jsonable(obj.tolist())
    return obj


def op_fig_profile(args):
    """数据剖析 + 图型建议：CSV/TSV/Excel → 列类型/样本量/分布/异常/相关 + 建议。

    对应 scipilot「思考-绘制」工作流的第 1 步。相对路径基于工作区。
    """
    from figurelib.profile_data import profile_data
    path = args.get('path')
    if not path:
        raise ValueError('path is required (CSV/TSV/Excel 文件路径)')
    group_cols = args.get('group_cols') or []
    info = profile_data(path, group_cols=group_cols)
    return _to_jsonable(info)


def op_fig_export(args):
    """图文件合规审计 + 可选 PNG 预览：格式/DPI/尺寸/字体嵌入检查。

    对应 scipilot 工作流的第 7 步（投稿前机器审计）。对已落盘的 PDF/SVG/
    PNG/TIFF 文件逐张检查：JPEG 数据图、DPI 不足、尺寸偏离目标、PDF 含
    Type 3 字体等。preview=true 时额外渲染 PNG 预览（PDF 需要 pypdf/
    PyMuPDF 支持）。相对路径基于工作区。
    """
    import os
    from figurelib.check_figure import check_figure
    from figurelib.visual_qa import render_preview

    paths = args.get('paths')
    if not isinstance(paths, list) or not paths:
        raise ValueError('paths must be a non-empty list of figure file paths')
    min_dpi = args.get('min_dpi', 300)
    width_in = args.get('width_in')
    height_in = args.get('height_in')
    target = None
    if width_in and height_in:
        target = (float(width_in), float(height_in))
    preview = bool(args.get('preview', False))

    results = []
    for p in paths:
        issues, info = check_figure(p, min_dpi=min_dpi, target_inches=target)
        sev = {'INFO': 0, 'WARN': 1, 'FAIL': 2}
        verdict = 'PASS' if not issues else {0: 'INFO', 1: 'WARN', 2: 'FAIL'}[max(sev[s] for s, _ in issues)]
        entry = {
            'path': p,
            'verdict': verdict,
            'issues': [{'severity': s, 'message': m} for s, m in issues],
            'info': _to_jsonable(info),
        }
        if preview:
            try:
                out = os.path.splitext(os.path.abspath(p))[0] + '_preview.png'
                entry['preview_png'] = render_preview(p, out)
            except Exception as e:  # PDF 缺 pypdf/PyMuPDF 等：审计不受影响
                entry['preview_error'] = f'{type(e).__name__}: {e}'
        results.append(entry)
    return {'count': len(results), 'results': results}


def op_fig_lint(args):
    """FIG 级语义 lint：配色语义/排印/灰度/统计元数据的出版合规检查。

    与 fig_export（文件级：DPI/格式/字体）互补。推荐元数据模式：调用方自报
    colors_used / cmap_used / n_categorical / err_semantics / has_stat_metadata /
    n_available——画完图后立刻自检自己的视觉选择；不持有 fig 对象（对象级
    typography 检查由 bio_python 桥内直接调 figurelib.fig_lint.lint_typography）。

    也可直接检查一组 hex 色板的出版合规性（选色板时用）。
    """
    from figurelib.fig_lint import full_lint

    colors_used = args.get('colors_used')
    if colors_used is not None and not isinstance(colors_used, list):
        raise ValueError('colors_used must be a list of hex color strings')
    cmap_used = args.get('cmap_used')
    n_categorical = args.get('n_categorical')
    if n_categorical is not None:
        n_categorical = int(n_categorical)
    err_semantics = args.get('err_semantics')          # e.g. 'mean±SEM', '95% CI'
    has_stat_metadata = args.get('has_stat_metadata')  # 图上的 p 值/star 是否有检验元数据
    n_available = args.get('n_available')              # exact n 是否已声明
    min_pt = float(args.get('min_pt', 5.0))

    result = full_lint(fig=None,
                       colors_used=colors_used,
                       n_categorical=n_categorical,
                       cmap_used=cmap_used,
                       err_semantics=err_semantics,
                       has_stat_metadata=has_stat_metadata if has_stat_metadata is not None else None,
                       n_available=n_available if n_available is not None else None,
                       min_pt=min_pt)
    # 元数据类检查：调用方没提供时才提示（None = 未声明 → 提示；显式 false 已在 lint 内处理）
    result['hint'] = ('主用元数据模式：画完图后立刻把 colors_used/cmap_used/err_semantics/'
                      'has_stat_metadata/n_available 传进来自检。')
    return result


def op_metabolic_model(args):
    """代谢模型管理：加载、查看、列出可用模型。"""
    import cobra
    
    action = args.get('action', 'list')
    
    if action == 'list':
        # 列出可用模型
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
        if not os.path.exists(model_dir):
            os.makedirs(model_dir, exist_ok=True)
        
        models = [
            {'id': 'textbook', 'file': 'COBRApy built-in', 'description': 'E. coli core model (built-in)'},
        ]
        
        for f in os.listdir(model_dir):
            if f.endswith(('.xml', '.sbml', '.json')):
                model_path = os.path.join(model_dir, f)
                models.append({
                    'id': os.path.splitext(f)[0],
                    'file': f,
                    'path': model_path,
                    'size_kb': round(os.path.getsize(model_path) / 1024, 1)
                })
        return {'models': models}
    
    elif action == 'load':
        model_id = args.get('model_id', 'textbook')
        file_path = args.get('file_path')
        
        if file_path:
            if not os.path.exists(file_path):
                return {'error': f'Model file not found: {file_path}'}
            model = cobra.io.read_sbml_model(file_path)
        elif model_id == 'textbook' or model_id == 'e_coli_core':
            # 使用COBRApy自带的模型
            model = cobra.io.load_model('textbook')
        else:
            # 从默认目录加载
            model_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
            model_path = os.path.join(model_dir, f'{model_id}.xml')
            if not os.path.exists(model_path):
                return {'error': f'Model not found: {model_id}.xml in {model_dir}'}
            model = cobra.io.read_sbml_model(model_path)
        
        # 返回模型信息
        return {
            'id': model.id,
            'name': model.name,
            'reactions': len(model.reactions),
            'metabolites': len(model.metabolites),
            'genes': len(model.genes),
            'objective': str(model.objective),
            'compartments': model.compartments,
            'exchanges': len(model.exchanges),
        }
    
    elif action == 'info':
        model_id = args.get('model_id', 'textbook')
        
        if model_id == 'textbook' or model_id == 'e_coli_core':
            # 使用COBRApy自带的模型
            model = cobra.io.load_model('textbook')
        else:
            model_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
            model_path = os.path.join(model_dir, f'{model_id}.xml')
            
            if not os.path.exists(model_path):
                return {'error': f'Model not found: {model_id}.xml'}
            
            model = cobra.io.read_sbml_model(model_path)
        
        # 获取反应信息
        reactions = []
        for r in model.reactions:
            reactions.append({
                'id': r.id,
                'name': r.name,
                'reaction': r.reaction,
                'bounds': r.bounds,
            })
        
        # 获取代谢物信息
        metabolites = []
        for m in model.metabolites:
            metabolites.append({
                'id': m.id,
                'name': m.name,
                'formula': m.formula,
                'compartment': m.compartment,
            })
        
        return {
            'id': model.id,
            'name': model.name,
            'reactions': reactions,
            'metabolites': metabolites,
            'genes': [g.id for g in model.genes],
            'objective': str(model.objective),
        }
    
    else:
        return {'error': f'Unknown action: {action}'}


def op_fba(args):
    """通量平衡分析：fba（默认）/ fva（通量可变性分析）/ pfba（节俭 FBA）。
    可选 reactions="EX_succ_e,PPC"（逗号分隔 reaction id）只输出指定反应，缩小返回体积。"""
    import cobra

    model_id = args.get('model_id', 'ecoli_core_model')
    objective = args.get('objective')
    analysis_type = str(args.get('analysis_type', 'fba')).lower()

    # 加载模型
    if model_id == 'textbook' or model_id == 'e_coli_core':
        # 使用COBRApy自带的模型
        model = cobra.io.load_model('textbook')
    else:
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
        model_path = os.path.join(model_dir, f'{model_id}.xml')

        if not os.path.exists(model_path):
            return {'error': f'Model not found: {model_id}.xml'}

        model = cobra.io.read_sbml_model(model_path)

    # 设置目标函数
    if objective:
        if objective in model.reactions:
            model.objective = objective
        else:
            return {'error': f'Objective reaction not found: {objective}'}

    # 可选：reactions="EX_succ_e,PPC" 时只输出指定反应，缩小返回体积
    rxn_filter = None
    missing_reactions = None
    reactions_arg = args.get('reactions')
    if reactions_arg:
        requested = [r.strip() for r in str(reactions_arg).split(',') if r.strip()]
        known_ids = {r.id for r in model.reactions}
        found = [r for r in requested if r in known_ids]
        missing = [r for r in requested if r not in known_ids]
        if not found:
            return {
                'hint': (
                    f'未找到反应: {", ".join(missing)}。这些 reaction id 在模型 {model_id} 中不存在；'
                    'reactions 参数需为逗号分隔的 reaction id（如 "EX_succ_e,PPC"），'
                    '可先用 bio_model_info 查看模型反应列表。'
                ),
                'missing_reactions': missing,
                'flux_ranges': {},
                'fluxes': {},
                'model_id': model_id,
            }
        rxn_filter = set(found)
        if missing:
            missing_reactions = missing

    if analysis_type == 'fva':
        # 通量可变性分析：每个反应在最优解附近的 [min, max] 范围
        from cobra.flux_analysis import flux_variability_analysis
        fraction = float(args.get('fraction_of_optimum', 1.0))
        fva_df = flux_variability_analysis(model, fraction_of_optimum=fraction, processes=1)
        ranges = {}
        for rid, row in fva_df.iterrows():
            if rxn_filter is not None and rid not in rxn_filter:
                continue
            lo, hi = float(row['minimum']), float(row['maximum'])
            if rxn_filter is not None or abs(lo) > 1e-10 or abs(hi) > 1e-10:
                ranges[rid] = [round(lo, 6), round(hi, 6)]
        result = {
            'analysis_type': 'fva',
            'fraction_of_optimum': fraction,
            'n_reactions': len(fva_df),
            'n_variable': len(ranges),
            'flux_ranges': ranges,
            'model_id': model_id,
            'fraction_notes': (
                f'fraction_of_optimum={fraction} 应用于当前目标函数 '
                f'({"objective=" + objective if objective else "模型默认目标（biomass）"}) '
                '——即各反应范围在「目标函数 ≥ fraction×最优值」约束下计算；'
                '若 objective 为产物反应（如 EX_succ_e），则 biomass 会被压低至 0，'
                '这不是「固定生长率下的范围」。需要后者请用 production_envelope 或先以 biomass 为目标再 FVA。'
            ),
            'objective': str(model.objective),
        }
        if missing_reactions:
            result['missing_reactions'] = missing_reactions
            result['hint'] = f'以下 reaction id 不存在已跳过: {", ".join(missing_reactions)}'
        return result

    if analysis_type == 'pfba':
        # 节俭 FBA：在最优生长下最小化总通量
        from cobra.flux_analysis import pfba
        solution = pfba(model)
        if solution.status != 'optimal':
            return {'error': f'pFBA failed: {solution.status}'}
        fluxes = {r.id: round(float(solution.fluxes[r.id]), 6)
                  for r in model.reactions if (rxn_filter is not None and r.id in rxn_filter) or (rxn_filter is None and abs(solution.fluxes[r.id]) > 1e-10)}
        # pFBA 的 objective_value 是最小化后的总通量；生长率需从目标反应通量取
        # （目标表达式含 forward/reverse 两个变量，取正系数且存在于通量表的反应）
        growth = None
        try:
            coefs = model.objective.get_linear_coefficients(model.objective.variables)
            for var, coef in coefs.items():
                if coef > 0 and var.name in solution.fluxes.index:
                    growth = round(float(solution.fluxes[var.name]), 6)
                    break
        except Exception:
            pass
        return {
            'analysis_type': 'pfba',
            'objective_value': round(float(solution.objective_value), 6),
            'growth_rate': growth,
            'status': solution.status,
            'fluxes': fluxes,
            'total_flux': round(float(abs(solution.fluxes).sum()), 6),
            'model_id': model_id,
            'objective': str(model.objective),
            'note': 'pFBA 的 objective_value 为最小化总通量；生长率见 growth_rate。',
        }

    if analysis_type not in ('fba', 'fva', 'pfba', 'loopless', 'geometric', 'optionsfva'):
        return {'error': f'analysis_type 仅支持 fba / fva / pfba / loopless / geometric / optionsfva，收到: {analysis_type}'}

    if analysis_type == 'loopless':
        # Loopless FBA：消除热力学不可行循环
        from cobra.flux_analysis import loopless_solution
        base = model.optimize()
        if base.status != 'optimal':
            return {'error': f'基础 FBA 失败: {base.status}'}
        try:
            ll_sol = loopless_solution(model)
        except Exception as e:
            return {'error': f'Loopless FBA 失败: {e}'}
        if ll_sol.status != 'optimal':
            return {'error': f'Loopless FBA 不可行: {ll_sol.status}'}
        fluxes = {r.id: round(float(ll_sol.fluxes[r.id]), 6)
                  for r in model.reactions if (rxn_filter is not None and r.id in rxn_filter) or (rxn_filter is None and abs(ll_sol.fluxes[r.id]) > 1e-10)}
        growth = None
        try:
            coefs = model.objective.get_linear_coefficients(model.objective.variables)
            for var, coef in coefs.items():
                if coef > 0 and var.name in ll_sol.fluxes.index:
                    growth = round(float(ll_sol.fluxes[var.name]), 6)
                    break
        except Exception:
            pass
        return {
            'analysis_type': 'loopless',
            'objective_value': round(float(ll_sol.objective_value), 6),
            'growth_rate': growth,
            'status': ll_sol.status,
            'fluxes': fluxes,
            'n_reactions_with_flux': len(fluxes),
            'model_id': model_id,
            'note': 'Loopless FBA 在保持最优目标值的前提下消除热力学不可行循环，结果更接近真实代谢状态。',
        }

    if analysis_type == 'geometric':
        # Geometric FBA：最小化欧几里得通量范数（相比 pFBA 是一种不同的通量最小化策略）
        from cobra.flux_analysis import geometric_fba
        try:
            g_sol = geometric_fba(model)
        except Exception as e:
            return {'error': f'Geometric FBA 失败: {e}'}
        if g_sol.status != 'optimal':
            return {'error': f'Geometric FBA 不可行: {g_sol.status}'}
        fluxes = {r.id: round(float(g_sol.fluxes[r.id]), 6)
                  for r in model.reactions if (rxn_filter is not None and r.id in rxn_filter) or (rxn_filter is None and abs(g_sol.fluxes[r.id]) > 1e-10)}
        growth = None
        try:
            coefs = model.objective.get_linear_coefficients(model.objective.variables)
            for var, coef in coefs.items():
                if coef > 0 and var.name in g_sol.fluxes.index:
                    growth = round(float(g_sol.fluxes[var.name]), 6)
                    break
        except Exception:
            pass
        return {
            'analysis_type': 'geometric',
            'objective_value': round(float(g_sol.objective_value), 6),
            'growth_rate': growth,
            'status': g_sol.status,
            'fluxes': fluxes,
            'model_id': model_id,
            'note': 'Geometric FBA 最小化欧几里得通量范数，给出唯一的最小通量解。',
        }

    if analysis_type == 'optionsfva':
        # 所有可选 FVA：寻找所有等价最优解的通量范围
        from cobra.flux_analysis import flux_variability_analysis
        fraction = float(args.get('fraction_of_optimum', 1.0))
        fva_df = flux_variability_analysis(model, fraction_of_optimum=fraction, processes=1)
        # 所有 FVA 范围 [min, max]，包括固定的
        ranges = {}
        for rid, row in fva_df.iterrows():
            if rxn_filter is not None and rid not in rxn_filter:
                continue
            lo, hi = float(row['minimum']), float(row['maximum'])
            ranges[rid] = {'min': round(lo, 6), 'max': round(hi, 6), 'range': round(hi - lo, 6)}
        fixed_count = sum(1 for v in ranges.values() if abs(v['range']) < 1e-9)
        result = {
            'analysis_type': 'optionsfva',
            'fraction_of_optimum': fraction,
            'n_reactions': len(fva_df),
            'n_fixed': fixed_count,
            'n_variable': len(ranges) - fixed_count,
            'flux_ranges': ranges,
            'model_id': model_id,
            'note': 'optionsFVA 返回所有反应的完整 [min, max] 范围（含固定反应），n_fixed 为通量固定的反应数。',
        }
        if missing_reactions:
            result['missing_reactions'] = missing_reactions
            result['hint'] = f'以下 reaction id 不存在已跳过: {", ".join(missing_reactions)}'
        return result


    # 运行FBA
    solution = model.optimize()
    
    if solution.status != 'optimal':
        return {'error': f'FBA failed: {solution.status}'}
    
    # 收集结果
    fluxes = {}
    for r in model.reactions:
        flux = solution.fluxes[r.id]
        if (rxn_filter is not None and r.id in rxn_filter) or (rxn_filter is None and abs(flux) > 1e-10):
            fluxes[r.id] = round(flux, 6)
    
    # 影子价格（代谢物）
    shadow_prices = {}
    for m in model.metabolites:
        price = solution.shadow_prices[m.id]
        if abs(price) > 1e-10:
            shadow_prices[m.id] = round(price, 6)
    
    result = {
        'objective_value': round(solution.objective_value, 6),
        'status': solution.status,
        'fluxes': fluxes,
        'shadow_prices': shadow_prices,
        'model_id': model_id,
        'objective': str(model.objective),
    }
    if missing_reactions:
        result['missing_reactions'] = missing_reactions
        result['hint'] = f'以下 reaction id 不存在已跳过: {", ".join(missing_reactions)}'
    return result


def _load_cobra_model(model_id):
    """加载 COBRA 模型（textbook 内置或 data/models/<id>.xml）。"""
    import cobra
    if model_id in ('textbook', 'e_coli_core', 'ecoli_core_model'):
        return cobra.io.load_model('textbook')
    model_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'models')
    model_path = os.path.join(model_dir, f'{model_id}.xml')
    if not os.path.exists(model_path):
        return None
    return cobra.io.read_sbml_model(model_path)


def op_gene_knockout(args):
    """基因敲除分析：single（默认）/ double（两两组合）/ essentiality（全基因扫描）。"""
    model_id = args.get('model_id', 'ecoli_core_model')
    gene = args.get('gene')
    analysis_type = str(args.get('analysis_type', 'single')).lower()

    model = _load_cobra_model(model_id)
    if model is None:
        return {'error': f'Model not found: {model_id}.xml'}

    wt_growth = float(model.optimize().objective_value or 0)

    if analysis_type == 'essentiality':
        # 全基因 essentiality 扫描：逐个敲除，分类 essential/reduced/non-essential
        results = {'essential': [], 'reduced': [], 'non_essential': []}
        for g in model.genes:
            with model:
                g.knock_out()
                sol = model.optimize()
                growth = float(sol.objective_value) if sol.status == 'optimal' else 0.0
            pct = (growth / wt_growth * 100) if wt_growth > 1e-9 else 0
            if growth < 1e-6:
                results['essential'].append(g.id)
            elif pct < 90:
                results['reduced'].append({'gene': g.id, 'growth_percent': round(pct, 2)})
            else:
                results['non_essential'].append(g.id)
        return {
            'analysis_type': 'essentiality',
            'model_id': model_id,
            'wild_type_growth': round(wt_growth, 6),
            'n_genes': len(model.genes),
            'n_essential': len(results['essential']),
            'n_reduced': len(results['reduced']),
            'essential_genes': results['essential'],
            'reduced_genes': results['reduced'],
        }

    if analysis_type == 'double':
        # 双基因敲除：先单敲取影响最大的 top N，再做两两组合
        top_n = int(args.get('top_n', 10))
        singles = []
        for g in model.genes:
            with model:
                g.knock_out()
                sol = model.optimize()
                growth = float(sol.objective_value) if sol.status == 'optimal' else 0.0
            singles.append((g.id, growth))
        # 按对生长的负面影响排序取 top N（跳过上不明显的必需基因两两组合太多时的爆炸）
        singles.sort(key=lambda x: x[1])
        candidates = [g for g, _ in singles[:top_n]]
        combos = []
        import itertools
        for g1, g2 in itertools.combinations(candidates, 2):
            with model:
                model.genes.get_by_id(g1).knock_out()
                model.genes.get_by_id(g2).knock_out()
                sol = model.optimize()
                growth = float(sol.objective_value) if sol.status == 'optimal' else 0.0
            pct = (growth / wt_growth * 100) if wt_growth > 1e-9 else 0
            combos.append({'pair': [g1, g2], 'growth': round(growth, 6),
                           'growth_percent': round(pct, 2)})
        combos.sort(key=lambda c: c['growth'])
        return {
            'analysis_type': 'double',
            'model_id': model_id,
            'wild_type_growth': round(wt_growth, 6),
            'top_n_candidates': candidates,
            'n_combinations': len(combos),
            'top_combinations': combos[:10],
            'note': '按双敲后生长率升序排列；合成致死组合 growth≈0。',
        }

    if analysis_type not in ('single', 'double', 'essentiality', 'optknock', 'production_envelope'):
        return {'error': f'analysis_type 仅支持 single / double / essentiality / optknock / production_envelope，收到: {analysis_type}'}

    if analysis_type == 'optknock':
        # OptKnock：贪心算法找最大化目标反应分泌的敲除组合（cobra 0.32+ 移除了原生 OptKnock）
        target_reaction = args.get('target_reaction', 'EX_ac_e')
        min_growth = float(args.get('min_growth', 0.1))  # 最小生长率（占 WT 的比例）
        max_knockouts = int(args.get('max_knockouts', 3))
        if target_reaction not in model.reactions:
            return {'error': f'target_reaction 不存在: {target_reaction}（建议用外泌反应如 EX_xx_e）'}
        min_growth_abs = min_growth * wt_growth
        # 单敲除评估
        single_impact = []
        for g in model.genes:
            with model:
                g.knock_out()
                sol = model.optimize()
                if sol.status == 'optimal':
                    growth = float(sol.objective_value)
                    flux = float(sol.fluxes.get(target_reaction, 0))
                    single_impact.append({
                        'gene': g.id,
                        'growth': round(growth, 6),
                        'growth_percent': round(growth / wt_growth * 100, 2) if wt_growth > 1e-9 else 0,
                        'target_flux': round(flux, 6),
                    })
        # 按目标反应分泌量降序（产量从高到低）
        single_impact.sort(key=lambda x: -x['target_flux'])
        # 贪心：依次尝试累加敲除，每次检查最小生长约束
        from itertools import combinations
        best_combo = []
        best_flux = float(model.optimize().fluxes.get(target_reaction, 0))
        # 单敲最优（如果生长允许）
        for s in single_impact[:20]:  # 只看 top 20 影响最大的单敲
            if s['growth'] >= min_growth_abs and s['target_flux'] > best_flux:
                best_combo = [s['gene']]
                best_flux = s['target_flux']
                break
        # 2 敲除组合
        if max_knockouts >= 2 and len(best_combo) > 0:
            top_genes = [s['gene'] for s in single_impact[:10]]
            for g1, g2 in combinations(top_genes, 2):
                with model:
                    model.genes.get_by_id(g1).knock_out()
                    model.genes.get_by_id(g2).knock_out()
                    sol = model.optimize()
                if sol.status == 'optimal' and sol.objective_value >= min_growth_abs:
                    flux = float(sol.fluxes.get(target_reaction, 0))
                    if flux > best_flux:
                        best_combo = [g1, g2]
                        best_flux = flux
        # 3 敲除组合
        if max_knockouts >= 3 and len(best_combo) >= 2:
            top_genes = [s['gene'] for s in single_impact[:8]]
            for combo in combinations(top_genes, 3):
                with model:
                    for g in combo:
                        model.genes.get_by_id(g).knock_out()
                    sol = model.optimize()
                if sol.status == 'optimal' and sol.objective_value >= min_growth_abs:
                    flux = float(sol.fluxes.get(target_reaction, 0))
                    if flux > best_flux:
                        best_combo = list(combo)
                        best_flux = flux
        return {
            'analysis_type': 'optknock',
            'model_id': model_id,
            'target_reaction': target_reaction,
            'min_growth_fraction': min_growth,
            'min_growth_absolute': round(min_growth_abs, 6),
            'max_knockouts_searched': max_knockouts,
            'wild_type_growth': round(wt_growth, 6),
            'wild_type_target_flux': round(float(model.optimize().fluxes.get(target_reaction, 0)), 6),
            'recommended_knockouts': best_combo,
            'target_flux_after_knockout': round(best_flux, 6),
            'flux_improvement': round(best_flux - float(model.optimize().fluxes.get(target_reaction, 0)), 6),
            'top_single_knockouts': single_impact[:5],
            'note': 'OptKnock（贪心版）：在保持最小生长率约束下最大化目标反应分泌/吸收。cobra 0.32+ 移除了原生 OptKnock，本实现采用贪心枚举替代。',
        }

    if analysis_type == 'production_envelope':
        # 生产包络线：扫描目标反应通量 vs 生长率
        # 这里只做基础版，完整版见 op_production_envelope
        return {'error': '请使用 bio_production_envelope 工具做生产包络线分析（支持 vary_range 自定义）'}

    if not gene:
        return {'error': 'Gene ID required'}

    # 检查基因是否存在
    try:
        gene_obj = model.genes.get_by_id(gene)
    except KeyError:
        return {'error': f'Gene not found: {gene}（可用 bio_metabolic_model action=info 查看基因列表）'}

    # 基因敲除
    with model:
        gene_obj.knock_out()
        ko_solution = model.optimize()
        ko_growth = ko_solution.objective_value

    # 计算影响
    growth_change = ko_growth - wt_growth
    growth_percent = (growth_change / wt_growth * 100) if wt_growth > 0 else 0

    # 判断必需性
    is_essential = ko_growth < 1e-6  # 生长率接近0

    return {
        'analysis_type': 'single',
        'gene': gene,
        'gene_name': gene_obj.name,
        'model_id': model_id,
        'wild_type_growth': round(wt_growth, 6),
        'knockout_growth': round(ko_growth, 6),
        'growth_change': round(growth_change, 6),
        'growth_change_percent': round(growth_percent, 2),
        'is_essential': is_essential,
        'essentiality': 'essential' if is_essential else ('reduced' if growth_percent < -10 else 'non-essential'),
    }


def op_production_envelope(args):
    """生产包络线：固定目标反应为优化目标，扫描某反应通量，产出 (vary_flux → target_max) 曲线。

    用途：预测基因改造后产物产量的理论上限（如固定不同生长率看产物得率）。
    """
    model_id = args.get('model_id', 'ecoli_core_model')
    target = args.get('target_reaction')
    vary = args.get('vary_reaction')
    points = int(args.get('points', 20))

    if not target or not vary:
        return {'error': 'target_reaction 与 vary_reaction 均必填（如 target=EX_ac_e, vary=BIOMASS_Ecoli_core_w_GAM）'}

    model = _load_cobra_model(model_id)
    if model is None:
        return {'error': f'Model not found: {model_id}.xml'}
    if target not in model.reactions:
        return {'error': f'target_reaction 不存在: {target}'}
    if vary not in model.reactions:
        return {'error': f'vary_reaction 不存在: {vary}'}

    vary_rxn = model.reactions.get_by_id(vary)
    lo, hi = vary_rxn.bounds
    # 经典生产包络：扫描范围取 lo 到「vary 反应在当前模型下的最优通量」
    # （否则 exchange/biomass 类反应默认上界 1000，大部分扫描点不可行）
    vary_range = args.get('vary_range')
    if vary_range:
        lo, hi = float(vary_range[0]), float(vary_range[1])
    else:
        sol0 = model.optimize()
        opt_flux = float(sol0.fluxes[vary]) if sol0.status == 'optimal' else hi
        hi = max(lo, opt_flux)
    if hi - lo < 1e-9:
        return {'error': f'vary_reaction {vary} 的扫描范围为空（lo={lo}, hi={hi}），可传 vary_range 显式指定'}
    step = (hi - lo) / max(points - 1, 1)

    data = []
    for i in range(points):
        v = lo + i * step
        with model:
            model.reactions.get_by_id(vary).bounds = (v, v)
            model.objective = target
            sol = model.optimize()
            data.append({
                'vary_flux': round(v, 6),
                'target_flux': round(float(sol.objective_value), 6) if sol.status == 'optimal' else None,
                'status': sol.status,
            })

    feasible = [d for d in data if d['target_flux'] is not None]
    peak = max(feasible, key=lambda d: d['target_flux']) if feasible else None
    return {
        'model_id': model_id,
        'target_reaction': target,
        'vary_reaction': vary,
        'points': points,
        'envelope': data,
        'max_target_flux': peak['target_flux'] if peak else None,
        'max_at_vary_flux': peak['vary_flux'] if peak else None,
        'note': 'envelope 为 vary_reaction 固定在各取值时 target_reaction 的最优通量；'
                'max_target_flux 即产物理论上限。',
    }


def op_pathway_search(args):
    """代谢通路搜索：在KEGG数据库中搜索代谢通路。"""
    from kegg_client import search_pathways
    
    target_metabolite = args.get('target_metabolite')
    organism = args.get('organism', 'eco')
    limit = args.get('limit', 10)
    
    if not target_metabolite:
        return {'error': 'Target metabolite required'}
    
    pathways = search_pathways(target_metabolite, organism, limit)
    
    return {
        'target_metabolite': target_metabolite,
        'organism': organism,
        'pathways': pathways,
        'count': len(pathways),
    }


def op_pathway_design(args):
    """代谢通路设计：设计异源代谢通路。"""
    from kegg_client import design_pathway
    
    target_product = args.get('target_product')
    host_organism = args.get('host_organism', 'eco')
    strategy = args.get('strategy', 'shortest')
    
    if not target_product:
        return {'error': 'Target product required'}
    
    result = design_pathway(target_product, host_organism, strategy)
    
    return result


def op_fig_qa(args):
    """绘图环境自检：CJK 字体可用性 + 期刊预设应用测试。

    中文图出方框的根因是默认字体无 CJK 字符表。本 op 在画图前探测：
    cjk_ready=false 时画中文图必然方框——应改用英文标签或提示安装
    Noto Sans CJK。preset_test 验证期刊预设可应用（含中文模式字体配置）。
    """
    import matplotlib
    from figurelib.setup_style import list_cjk_fonts, setup_style

    lang = args.get('lang', 'zh')
    journal = args.get('journal', 'nature')
    cjk = list_cjk_fonts()
    preset_ok = True
    applied = None
    error = None
    try:
        applied = setup_style(journal=journal, lang=lang)
    except Exception as e:
        preset_ok = False
        error = f'{type(e).__name__}: {e}'
    return {
        'matplotlib': matplotlib.__version__,
        'cjk_fonts': cjk,
        'cjk_ready': len(cjk) > 0,
        'preset_test': {
            'journal': journal,
            'lang': lang,
            'ok': preset_ok,
            'applied': _to_jsonable(applied) if applied else None,
            'error': error,
        },
        'hint': ('中文图可正常渲染。' if cjk else
                 '本机未检测到 CJK 字体——中文标签会渲染成方框。改用英文标签，'
                 '或安装 Noto Sans CJK（见 bio-figure skill）。'),
    }


# ---- BLAST / 多序列比对 / 系统发育 ----

# 短核酸查询的 e-value 天然偏高：BLASTN 的 e-value 随查询变短而急剧变大
# （E ∝ m·n·2^-S'，短查询能达到的比对分 S' 低），23nt 查询在 nt 库中的命中
# e-value 常见于 0.1-10 量级——严格 expect 会在服务端把命中全部过滤掉。
# 下方自动参数与 NCBI BLAST 网页版对短查询的调整一致（word_size=7 / expect=1000）。
_SHORT_BLASTN_MAX_LEN = 30
_SHORT_BLASTN_WORD_SIZE = 7
_SHORT_BLASTN_EXPECT = 1000.0
_STRICT_EXPECT_THRESHOLD = 10.0


def _decide_blast_params(sequence, program, user_word_size=None, user_expect=None):
    """纯函数（无网络/无副作用）：决定实际传给 qblast 的参数 + 参数告警。

    规则：program=='blastn' 且 len(sequence) < 30（短核苷酸查询）时——
      - 调用方未显式传 word_size → word_size=7（blastn 默认 11 对 <30nt 查询几乎不出命中）；
      - 调用方未显式传 expect   → expect=1000.0（短查询 e-value 天然 0.1-10 量级）；
      - 调用方显式传了 expect 且 <10 → 保留调用方值，但给出 warnings（该阈值会让命中全灭）。
    其他情况：仅透传调用方显式给出的参数（保持历史行为，不改变既有调用语义）。

    返回 (kwargs, warnings)；kwargs 即待展开进 NCBIWWW.qblast 的参数。
    """
    kwargs = {}
    warnings = []
    is_short_blastn = program == 'blastn' and len(sequence) < _SHORT_BLASTN_MAX_LEN

    if user_word_size is not None:
        kwargs['word_size'] = int(user_word_size)
    elif is_short_blastn:
        kwargs['word_size'] = _SHORT_BLASTN_WORD_SIZE

    if user_expect is not None:
        expect_value = float(user_expect)
        kwargs['expect'] = expect_value
        if is_short_blastn and expect_value < _STRICT_EXPECT_THRESHOLD:
            warnings.append(
                f'短序列（len={len(sequence)}）配合严格 expect={user_expect}：'
                f'短查询的 e-value 通常为 0.1-10 量级，严格阈值会过滤全部命中'
                f'——查短序列同源建议 expect>={_STRICT_EXPECT_THRESHOLD:g} 或不设 expect'
                f'（本次仍按你给的值传参；若 hit_count=0 请调大 expect 后重试）。'
            )
    elif is_short_blastn:
        kwargs['expect'] = _SHORT_BLASTN_EXPECT

    return kwargs, warnings


def _blast_diagnostics(sequence, program, params_used, warnings, hit_count,
                       query_length=None):
    """纯函数（无网络/无副作用）：BLAST 返回体的 diagnostics 段。

    params_used = 实际传给 qblast 的参数回执；hit_count==0 时追加针对性解释——
    短序列场景下「0 命中」多半是 e-value 阈值过严/查询过短，而不是 NCBI 服务故障。
    """
    length = len(sequence) if query_length is None else query_length
    notes = list(warnings)
    expect_used = params_used.get('expect')
    if hit_count == 0:
        if program == 'blastn' and length < _SHORT_BLASTN_MAX_LEN:
            if expect_used is not None and float(expect_used) < _STRICT_EXPECT_THRESHOLD:
                notes.append(
                    f'未命中（hit_count=0）是参数结果而非服务故障：查询仅 {length} nt，'
                    f'实际使用 expect={expect_used} 的严格阈值——短核苷酸查询在 nt 库中的 '
                    f'e-value 通常为 0.1-10 量级，服务端会在 e-value 过滤阶段丢弃全部命中。'
                    f'请调大 expect（建议 >=10，或不传 expect 让工具自动放宽）后重试；'
                    f'更稳的做法是取更长的查询区段（>=30 nt）。'
                )
            else:
                notes.append(
                    f'未命中（hit_count=0）：已对短查询 {length} nt 自动放宽参数'
                    f'（word_size={params_used.get("word_size")}, expect={expect_used}）后仍无命中——'
                    f'通常说明库中确无显著同源序列（短查询本身灵敏度低），'
                    f'或 database/program 选择不当。可改用更长的查询区段，'
                    f'或核对 program/database 是否与序列类型匹配。'
                )
        else:
            notes.append(
                f'未命中（hit_count=0）：当前参数（{params_used}）下没有满足阈值的命中——'
                f'可放宽 expect、更换 database/program，或核对输出格式与库物种范围后重试。'
            )
    return {'query_length': length, 'params_used': dict(params_used), 'notes': notes}


# ── qblast 排队 deadline（2026-09-19 审计修复）──────────────────────────────
# 真实事故（会话 924dd607）：23nt + expect=0.001 的 qblast 在 NCBI 服务端排队
# >600s，被 TS 执行层硬杀（python execution timed out after 600000 ms），agent
# 只拿到裸超时文案、无任何指引。qblast 的排队时长由 NCBI 控制、进程内无法中断
# 其轮询，因此在本层施加**总 deadline** 主动放弃（默认 540s，后于执行层 600s
# 硬杀线留 60s 余量），换取结构化、可行动的返回文案。
_QBLAST_DEADLINE_S = 540


class BlastQueueTimeout(Exception):
    """BLAST 服务端排队超过本地等待上限——主动放弃本次等待。

    **刻意不继承** TimeoutError/OSError：@retry_on_network_error 会重试那两类，
    而排队超时重试只会再排一次队（每次 9 分钟）——正确处置是带指引冒泡给调用方。
    """


def _qblast_with_deadline(program, database, sequence, kwargs, deadline_s=_QBLAST_DEADLINE_S):
    """在 daemon 线程里跑 NCBIWWW.qblast 并施加总 deadline；超时抛 BlastQueueTimeout。"""
    import threading
    from Bio.Blast import NCBIWWW

    deadline_s = max(1.0, float(deadline_s))
    holder: dict = {}

    def _worker():
        try:
            handle = NCBIWWW.qblast(program, database, sequence, **kwargs)
            holder['xml'] = handle.read()
        except BaseException as exc:  # noqa: BLE001 - 原样带回主线程重抛
            holder['error'] = exc

    t = threading.Thread(target=_worker, name='dshbio-qblast', daemon=True)
    t.start()
    t.join(timeout=deadline_s)
    if t.is_alive():
        raise BlastQueueTimeout(
            f'BLAST 服务端排队超过本地等待上限（{int(deadline_s)} 秒），已主动放弃本次等待。'
            f'qblast 排队时长由 NCBI 控制（1-10 分钟属常态，繁忙时更长）——'
            f'建议稍后重试，或缩小 hitlist_size / 换更长的查询区段 / 改用 Entrez 下载候选做本地比对。'
        )
    if 'error' in holder:
        raise holder['error']
    return holder['xml']


@retry_on_network_error(max_retries=2, delay=5)
def op_blast_search(args):
    """远程 BLAST 搜索：NCBIWWW.qblast + NCBIXML 解析。

    返回每个命中的 accession/描述/e-value/score/一致性/比对坐标。
    另附 diagnostics（实际参数回执 + 0 命中解释）：短核酸查询的 e-value 天然在
    0.1-10 量级，严格 expect 会让服务端过滤掉全部命中——0 命中不等于服务故障。
    qblast 在 NCBI 服务端排队执行，通常耗时 1-10 分钟，属正常现象。
    """
    import io
    from Bio.Blast import NCBIWWW, NCBIXML

    sequence = args['sequence'].strip()
    program = args.get('program', 'blastn')  # blastn / blastp / blastx
    database = args.get('database') or ('nt' if program in ('blastn', 'blastx') else 'nr')
    hitlist_size = int(args.get('hitlist_size', 10))

    # 「参数决策」抽成纯函数：可离线单测（scripts/test-blast-params.py），不依赖真实网络。
    blast_kwargs, warnings = _decide_blast_params(
        sequence, program,
        user_word_size=args.get('word_size'),
        user_expect=args.get('expect'),  # e-value 阈值，可选
    )
    kwargs = {'hitlist_size': hitlist_size, **blast_kwargs}

    try:
        xml = _qblast_with_deadline(program, database, sequence, kwargs,
                                    deadline_s=float(args.get('queue_deadline_s') or _QBLAST_DEADLINE_S))
    except BlastQueueTimeout:
        # 排队超时：不参与网络重试（见类文档），直接带指引冒泡给调用方
        raise
    except (ConnectionError, TimeoutError, OSError) as e:
        # 走到这里说明 @retry_on_network_error 的重试已耗尽（装饰器会重试本函数，
        # 最终抛出上一次的异常）。把原始网络异常换成带回退指引的文案——main() 以
        # ok:false + error 返回给 agent，避免 agent 把「NCBI 不可达/被限流」误判成
        # 插件故障而反复无效重试。
        raise ConnectionError(
            'NCBI BLAST 服务可能暂时不可达或被限流——可稍后重试，'
            '或改用 Entrez 直接下载序列做本地比对。'
            f'（原始错误: {type(e).__name__}: {e}）'
        ) from e

    if isinstance(xml, bytes):
        xml = xml.decode('utf-8', errors='replace')
    record = NCBIXML.read(io.StringIO(xml))

    hits = []
    for aln in record.alignments[:hitlist_size]:
        if not aln.hsps:
            continue
        hsp = aln.hsps[0]  # 每条命中取最优 HSP
        aln_len = max(hsp.align_length, 1)
        hits.append({
            'accession': aln.accession,
            'title': aln.title,
            'subject_length': aln.length,
            'evalue': hsp.expect,
            'score': hsp.score,
            'identity_pct': round(100.0 * hsp.identities / aln_len, 2),
            'align_length': hsp.align_length,
            'query_start': hsp.query_start,
            'query_end': hsp.query_end,
            'subject_start': hsp.sbjct_start,
            'subject_end': hsp.sbjct_end,
        })
    return {
        'program': program,
        'database': database,
        'query_length': record.query_length,
        'hit_count': len(record.alignments),
        'hits': hits,
        # 参数告警（短序列 + 严格 expect 等）与逐条诊断：0 命中时 notes 含针对性解释
        'warnings': warnings,
        'diagnostics': _blast_diagnostics(
            sequence, program, kwargs, warnings,
            hit_count=len(record.alignments), query_length=record.query_length,
        ),
    }


def _find_binary(candidates):
    """在 PATH 中按候选名查找可执行文件，返回首个命中的路径或 None。"""
    import shutil
    for name in candidates:
        path = shutil.which(name)
        if path:
            return path
    return None


def _consensus_and_stats(aln):
    """对 MultipleSeqAlignment 计算多数共识序列与保守性统计。"""
    from collections import Counter
    n = len(aln)
    length = aln.get_alignment_length()
    consensus = []
    fully_conserved = 0
    sim_sum = 0.0
    for i in range(length):
        counts = Counter(str(rec.seq[i]).upper() for rec in aln)
        top, cnt = counts.most_common(1)[0]
        consensus.append(top if cnt * 2 >= n else 'N')
        sim_sum += cnt / n
        if cnt == n:
            fully_conserved += 1
    return {
        'consensus': ''.join(consensus),
        'alignment_length': length,
        'sequence_count': n,
        'fully_conserved_columns': fully_conserved,
        'mean_column_identity': round(sim_sum / length, 4) if length else 0.0,
    }


def op_msa(args):
    """多序列比对：调用本机 clustalw/clustalw2 或 muscle 二进制。

    输入：FASTA 字符串（sequences）或 FASTA 文件路径（file_path）。
    二进制缺失时返回 status=program_missing + 安装提示，不抛异常——
    让 Agent 可以提示用户安装或改走 bio_python 兜底。
    """
    import subprocess
    import tempfile
    from Bio import AlignIO

    program = args.get('program', 'clustalw').lower()
    if program not in ('clustalw', 'muscle'):
        raise ValueError(f"program 仅支持 clustalw / muscle，收到: {program}")

    if program == 'clustalw':
        binary = _find_binary(['clustalw2', 'clustalw'])
    else:
        binary = _find_binary(['muscle'])
    if not binary:
        return {
            'status': 'program_missing',
            'program': program,
            'hint': (f'本机 PATH 中未找到 {program} 可执行文件。请安装 '
                     f'{"ClustalW2（http://www.clustal.org/clustal2/）" if program == "clustalw" else "MUSCLE v5（https://drive5.com/muscle/）"}'
                     f' 并加入 PATH；或改用 bio_python 写代码做渐进式比对。'),
        }

    sequences = args.get('sequences')
    file_path = args.get('file_path')
    if not sequences and not file_path:
        raise ValueError('sequences（FASTA 字符串）与 file_path 至少提供一个')

    with tempfile.TemporaryDirectory(prefix='bio_msa_') as tmp:
        in_path = os.path.join(tmp, 'input.fasta')
        if sequences:
            with open(in_path, 'w', encoding='utf-8') as fh:
                fh.write(sequences if sequences.endswith('\n') else sequences + '\n')
        else:
            import shutil
            shutil.copyfile(file_path, in_path)

        if program == 'clustalw':
            out_path = os.path.join(tmp, 'output.aln')
            cmd = [binary, f'-INFILE={in_path}', f'-OUTFILE={out_path}', '-QUIET']
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if proc.returncode != 0:
                raise RuntimeError(f'clustalw 运行失败: {proc.stderr or proc.stdout}'[:500])
            out_fmt = 'clustal'
        else:
            out_path = os.path.join(tmp, 'output.fasta')
            out_fmt = 'fasta'
            # muscle v5: -align/-output；v3: -in/-out。先试 v5 语法，失败回退。
            proc = subprocess.run([binary, '-align', in_path, '-output', out_path],
                                  capture_output=True, text=True, timeout=600)
            if proc.returncode != 0:
                proc = subprocess.run([binary, '-in', in_path, '-out', out_path],
                                      capture_output=True, text=True, timeout=600)
                if proc.returncode != 0:
                    raise RuntimeError(f'muscle 运行失败: {proc.stderr or proc.stdout}'[:500])

        aln = AlignIO.read(out_path, out_fmt)

    stats = _consensus_and_stats(aln)
    # Clustal 文本输出便于人读；FASTA 便于对接 bio_phylo_build。
    import io
    clustal_buf = io.StringIO()
    fasta_buf = io.StringIO()
    AlignIO.write(aln, clustal_buf, 'clustal')
    AlignIO.write(aln, fasta_buf, 'fasta')
    return {
        'status': 'ok',
        'program': program,
        'binary': binary,
        **stats,
        'alignment_clustal': clustal_buf.getvalue(),
        'alignment_fasta': fasta_buf.getvalue(),
        'sequence_ids': [rec.id for rec in aln],
    }


def op_phylo_build(args):
    """系统发育树构建：多序列比对 → 距离矩阵 → NJ/UPGMA 树（Newick）。

    输入可对接 op_msa 的 alignment_fasta 输出（alignment 参数传 FASTA 字符串），
    或传 alignment_file 路径。返回 Newick 字符串、叶节点数、总枝长；
    提供 out_file 时同时写盘。
    """
    import io
    from Bio import AlignIO, Phylo
    from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor

    method = args.get('method', 'nj').lower()
    if method not in ('nj', 'upgma'):
        raise ValueError(f"method 仅支持 nj / upgma，收到: {method}")
    fmt = args.get('format', 'fasta')  # fasta / clustal / phylip ...

    aln_text = args.get('alignment')
    aln_file = args.get('alignment_file')
    if aln_file:
        aln = AlignIO.read(aln_file, fmt)
    elif aln_text:
        aln = AlignIO.read(io.StringIO(aln_text), fmt)
    else:
        raise ValueError('alignment（FASTA/Clustal 字符串）与 alignment_file 至少提供一个')

    if len(aln) < 3:
        raise ValueError(f'建树至少需要 3 条序列，当前比对只有 {len(aln)} 条')

    calculator = DistanceCalculator('identity')
    dm = calculator.get_distance(aln)
    constructor = DistanceTreeConstructor()
    tree = constructor.nj(dm) if method == 'nj' else constructor.upgma(dm)

    buf = io.StringIO()
    Phylo.write(tree, buf, 'newick')
    newick = buf.getvalue().strip()

    out_file = args.get('out_file')
    if out_file:
        Phylo.write(tree, out_file, 'newick')

    terminals = tree.get_terminals()
    total_length = sum(c.branch_length or 0.0 for c in tree.find_clades())
    return {
        'method': method,
        'leaf_count': len(terminals),
        'leaf_names': [t.name for t in terminals],
        'total_branch_length': round(total_length, 6),
        'newick': newick,
        'out_file': out_file or None,
    }


# ---- op 注册表 ----
OPS = {
    'seq_analyze': op_seq_analyze,
    'seq_translate': op_seq_translate,
    'seq_gc_skew': op_seq_gc_skew,
    'seq_find_orf': op_seq_find_orf,
    'seq_restriction': op_seq_restriction,
    'seq_io_read': op_seq_io_read,
    'seq_io_write': op_seq_io_write,
    'seq_kmer': op_seq_kmer,
    'entrez_search': op_entrez_search,
    'entrez_fetch': op_entrez_fetch,
    'enrichr': op_enrichr,
    'pubmed_search': op_pubmed_search,
    'pubmed_abstract': op_pubmed_abstract,
    'ref_genome': op_ref_genome,
    'fig_profile': op_fig_profile,
    'fig_export': op_fig_export,
    'fig_qa': op_fig_qa,
    'fig_lint': op_fig_lint,
    'env_status': op_env_status,
    'metabolic_model': op_metabolic_model,
    'fba': op_fba,
    'gene_knockout': op_gene_knockout,
    'pathway_search': op_pathway_search,
    'pathway_design': op_pathway_design,
    'ml_pipeline': op_ml_pipeline,
    'ml_reduce': op_ml_reduce,
    'ml_feature': op_ml_feature,
    'ml_cluster': op_ml_cluster,
    'stats_test': op_stats_test,
    'primer_design': op_primer_design,
    'seq_optimize': op_seq_optimize,
    'assembly_design': op_assembly_design,
    'plasmid_map': op_plasmid_map,
    # 合成生物学 Phase 1（v0.6.16 起 primer3/dnachisel/dna-features-viewer 均为
    # 第二层按需自动安装，注册见 src/extra-deps.js EXTRA_DEPS）
    'primer3_design': op_primer3_design,
    'dna_optimize': op_dna_optimize,
    'clone_simulate': op_clone_simulate,

    'deseq2': op_deseq2_python,
    'gsea': op_gsea_python,
    'blast_search': op_blast_search,
    'msa': op_msa,
    'phylo_build': op_phylo_build,
    # Phase 2：代谢工程深化 + SBOL 标准化
    'production_envelope': op_production_envelope,
    'sbol_write': op_sbol_write,
    'sbol_read': op_sbol_read,
    # Phase 3：基因回路建模
    'circuit_compile': op_circuit_compile,
    'circuit_simulate': op_circuit_simulate,
    # CRISPR 工具链（2026-08-25 新增）
    'crispr_guide': op_crispr_guide,
    'crispr_verify': op_crispr_verify,
    # DNA 合成约束检查（2026-08-25 新增）
    'dna_syncheck': op_dna_syncheck,
    # 湿实验方案设计（2026-08-25 新增）
    'wetlab_design': op_wetlab_design,
    # 质粒库检索（2026-09-16 新增，Addgene 公开目录页）
    'plasmid_search': op_plasmid_search,
    'plasmid_info': op_plasmid_info,
    # 能力补缺（2026-09-16 新增，对标生信 MCP 工具集的缺口）
    'seq_introns': op_seq_introns,
    'seq_dotplot': op_seq_dotplot,
    'uniprot': op_uniprot,
    'phylo_compare': op_phylo_compare,
    'rna_fold': op_rna_fold,
    'sc_qc': op_sc_qc,
}


class SafeEncoder(json.JSONEncoder):
    """自动处理 numpy/pandas 类型的 JSON 编码器，防止序列化崩溃。"""
    def default(self, obj):
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def _sanitize_json(v):
    """递归规范化输出值，保证通过 dsh 的 lossless JSON 校验：
    - NaN/Infinity → None（非法 JSON 字面量，dsh Number.isFinite 校验拒绝）
    - -0.0 → 0.0（dsh walkJsonValue 显式拒绝 Object.is(v, -0) 的负零）
      （2026-08-25 实测：optknock 贪心枚举不可生长基因时 growth=-0.0 → 工具报
       'value is not lossless JSON'，agent 被迫自愈改用 bio_python。）
    """
    import math
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        if v == 0.0:
            return 0.0
        return v
    if isinstance(v, dict):
        return {k: _sanitize_json(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_sanitize_json(x) for x in v]
    return v


def main():
    try:
        # binary 读取 + 容错解码：任何输入字节都不会崩溃（与 bridge.py 一致）
        raw = sys.stdin.buffer.read().decode('utf-8', errors='replace')
        if not raw.strip():
            print(json.dumps({'ok': False, 'error': 'empty request'}))
            return
        req = json.loads(raw)
        op = req.get('op')
        args = req.get('args', {})
        if op not in OPS:
            print(json.dumps({'ok': False, 'error': f'unknown op: {op}'}))
            return
        result = OPS[op](args)
        result = _sanitize_json(result)
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False, cls=SafeEncoder))
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
