"""dsh-bio-genie — 能力补缺模块（2026-09-16）

补齐与其他生信工具集对标时发现的 5 类缺口。**全部走真实库/真实算法**——
对标对象 `bach-biotools-server` 在这些位置返回的是 Math.random() 伪造数据
或 mock 占位（详见 dsh-bio-genie-doc/生信MCP生态调研与能力缺口-2026-09-16.md），
本模块的实现路线与之无关，一律基于 Biopython / UniProt REST / ViennaRNA。

包含：
  - op_seq_introns    内含子-外显子结构 + 剪接位点（Biopython 解析 GenBank feature）
  - op_seq_dotplot    序列点阵图（滑窗一致性矩阵 → 出版级 PNG）
  - op_uniprot        UniProt 蛋白条目（功能/PTM/交叉引用/通路/序列，多 mode）
  - op_phylo_compare  系统发育树比较（Robinson-Foulds 距离，手写可验证实现）
  - op_rna_fold       RNA 二级结构（ViennaRNA 热力学最小自由能 + 碱基对列表）
"""

import io
import json
import os
import re
import urllib.parse
import urllib.request

# ---------------------------------------------------------------- 公共

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36 '
      '(+dsh-bio-genie; contact: dsh-bio-genie@users.noreply.github.com)')


def _read_text_arg(value, what):
    """参数既可以是内容本身，也可以是文件路径。"""
    if not value:
        raise ValueError(f'{what} 不能为空')
    if isinstance(value, str) and len(value) < 512 and '\n' not in value and os.path.exists(value):
        with open(value, encoding='utf-8', errors='replace') as fh:
            return fh.read()
    return value


def _http_json(url, timeout=40):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f'HTTP {resp.status}: {url}')
        return json.loads(resp.read().decode('utf-8'))


# ================================================================ G1 内含子/外显子

_SPLICE_CANONICAL = ('GT', 'AG')
_SPLICE_MINOR = {('GC', 'AG'), ('AT', 'AC')}


_COMP = str.maketrans('ACGTNacgtnRYKMSWBDHVrykmswbdhv',
                      'TGCANtgcanYRMKSWVHDByrmkswvhdb')


def _gene_qualifiers(feat):
    """只取 gene / locus_tag 两个 qualifier 作为基因标识。

    ⚠️ 绝不能把全部 qualifier 值拼起来做匹配：NBR1 的 product 字面写着
    "next to BRCA1 gene 1 protein"（实测 NG_005905），宽松匹配会让用户查 BRCA1
    却拿到 NBR1 的转录本。只认真正的基因标识字段。
    """
    out = []
    for key in ('gene', 'locus_tag'):
        v = feat.qualifiers.get(key)
        if not v:
            continue
        out.extend(v if isinstance(v, list) else [v])
    return [str(x).strip() for x in out if str(x).strip()]


def _primary_name(feat):
    """feature 的展示名：优先 gene/locus_tag，其次 product/standard_name。"""
    for key in ('gene', 'locus_tag', 'product', 'standard_name'):
        v = feat.qualifiers.get(key)
        if v:
            return str(v[0] if isinstance(v, list) else v).strip()
    return ''


def op_seq_introns(args):
    """从 GenBank 注释提取基因的内含子/外显子结构与剪接位点。

    args:
      accession (str): NCBI 登录号（如 NG_005905、NC_000017.11）
      genbank_file (str): 或本地 GenBank 文件路径（与 accession 二选一）
      gene (str): 可选，按 gene/locus_tag **精确**匹配（不做子串匹配）
      max_features (int): 最多返回多少个转录本，默认 10
    """
    accession = (args.get('accession') or '').strip()
    gb_file = (args.get('genbank_file') or '').strip()
    if not accession and not gb_file:
        raise ValueError('需要 accession 或 genbank_file 之一')

    from Bio import SeqIO
    if gb_file:
        path = gb_file
        if not os.path.exists(path):
            raise FileNotFoundError(f'GenBank 文件不存在: {path}')
        record = SeqIO.read(path, 'genbank')
        source = os.path.basename(path)
    else:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from bio_ops import _entrez
        Entrez = _entrez()
        handle = Entrez.efetch(db='nuccore', id=accession, rettype='gbwithparts', retmode='text')
        try:
            record = SeqIO.read(io.StringIO(handle.read()), 'genbank')
        finally:
            handle.close()
        source = accession

    gene_filter = (args.get('gene') or '').strip().lower()
    max_features = int(args.get('max_features', 10))
    seq = str(record.seq)

    # 先登记「有 CDS 的基因」，避免同一基因的 mRNA feature 造成重复条目
    cds_genes = set()
    for feat in record.features:
        if feat.type == 'CDS':
            for g in _gene_qualifiers(feat):
                cds_genes.add(g.lower())

    available_genes = sorted({g for feat in record.features
                              for g in _gene_qualifiers(feat)})

    transcripts = []
    for feat in record.features:
        if feat.type not in ('CDS', 'mRNA', 'tRNA', 'rRNA', 'ncRNA'):
            continue
        qual = feat.qualifiers
        name = _primary_name(feat)
        gq = _gene_qualifiers(feat)
        if gene_filter and not any(g.lower() == gene_filter for g in gq):
            continue  # 精确匹配基因标识（大小写不敏感）；无标识的 feature 不参与匹配
        # 同基因已有 CDS 时跳过 mRNA：两者描述同一套外显子，返回两份是重复噪声。
        # 该去重必须**无条件**生效（曾因写成 elif 而在带 gene 过滤时失效，实测返回 2 份）。
        if feat.type != 'CDS' and gq and gq[0].lower() in cds_genes:
            continue

        parts = list(feat.location.parts)
        if len(parts) < 2:
            continue  # 无内含子（单段）

        strand = feat.location.strand or 0

        # 基因组坐标升序的外显子（1-based 闭区间）
        genomic_exons = sorted({(int(p.start) + 1, int(p.end)) for p in parts})
        # 基因组坐标升序的内含子（相邻外显子之间的间隙）
        genomic_introns = []
        for (s1, e1), (s2, e2) in zip(genomic_exons, genomic_exons[1:]):
            istart, iend = e1 + 1, s2 - 1
            if iend >= istart:
                genomic_introns.append((istart, iend))

        # 负链基因的转录方向是基因组坐标递减 → 按转录顺序输出
        minus = strand < 0
        exons_tx = list(reversed(genomic_exons)) if minus else genomic_exons
        introns_genomic = list(reversed(genomic_introns)) if minus else genomic_introns

        exons = [{'start': s, 'end': e, 'length': e - s + 1} for s, e in exons_tx]

        introns = []
        for istart, iend in introns_genomic:
            frag = seq[istart - 1:iend].upper()
            if minus:
                # 转录方向的 5' 端在基因组右端 → 反向互补后再判 GT-AG
                donor = frag[-2:].translate(_COMP)[::-1]
                acceptor = frag[:2].translate(_COMP)[::-1]
            else:
                donor, acceptor = frag[:2], frag[-2:]
            if (donor, acceptor) == _SPLICE_CANONICAL:
                cls = 'canonical_GT_AG'
            elif (donor, acceptor) in _SPLICE_MINOR:
                cls = 'minor'
            else:
                cls = 'non_canonical'
            introns.append({
                'start': istart, 'end': iend, 'length': iend - istart + 1,
                'donor_dinucleotide': donor, 'acceptor_dinucleotide': acceptor,
                'splice_class': cls,
            })

        cds_qual = qual.get('translation')
        protein_len = len(cds_qual[0]) if cds_qual else None
        transcripts.append({
            'feature_type': feat.type,
            'name': name,
            'gene': gq[0] if gq else '',
            'strand': '+' if not minus else '-',
            'location': str(feat.location),
            'exon_count': len(exons),
            'intron_count': len(introns),
            'exons': exons,
            'introns': introns,
            'protein_length_aa': protein_len,
            'coding_length_bp': sum(e['length'] for e in exons),
        })
        if len(transcripts) >= max_features:
            break

    if not transcripts:
        hints = []
        if gene_filter:
            hints.append(f'gene={gene_filter!r} 未精确匹配到任何基因标识（gene/locus_tag）')
            near = [g for g in available_genes if gene_filter in g.lower()]
            if near:
                hints.append(f'该记录中标识含此串的基因有: {near}（注意：本工具只做精确匹配，'
                             f'因为 product 描述里可能提到别的基因名）')
            hints.append(f'记录内全部基因标识: {available_genes[:40]}')
        hints.append('另注意：成熟 mRNA 记录与原核记录本就没有内含子——需用基因组类登录号（NG_/NC_）。')
        return {
            'source': source, 'record_id': record.id, 'record_length': len(record.seq),
            'organism': record.annotations.get('organism', ''),
            'available_genes': available_genes,
            'transcripts': [], 'count': 0, 'note': ' '.join(hints),
        }

    canonical = sum(1 for t in transcripts for i in t['introns']
                    if i['splice_class'] == 'canonical_GT_AG')
    total_introns = sum(t['intron_count'] for t in transcripts)
    return {
        'source': source,
        'record_id': record.id,
        'record_length': len(record.seq),
        'organism': record.annotations.get('organism', ''),
        'gene_filter': gene_filter or None,
        'count': len(transcripts),
        'transcripts': transcripts,
        'splice_summary': {
            'total_introns': total_introns,
            'canonical_GT_AG': canonical,
            'canonical_fraction': round(canonical / total_introns, 4) if total_introns else None,
        },
        'note': ('外显子/内含子均为基因组坐标的 1-based 闭区间，按**转录方向**（5′→3′）排序；'
                 '负链基因的外显子坐标因此递减，其 donor/acceptor 已反向互补到转录方向后再判定 GT-AG。'
                 'gene 过滤为精确匹配（不区分大小写），因为 product 描述常提及邻近基因名。'
                 '同一基因同时有 CDS 与 mRNA 注释时只返回 CDS（外显子集合相同，且 CDS 不含 UTR）。'),
    }


# ================================================================ G2 点阵图

def op_seq_dotplot(args):
    """序列点阵图（dotplot）：滑窗一致性矩阵 + 出版级 PNG。

    args:
      seq1 / seq2 (str): 两条序列（内容或文件路径）
      window (int): 滑窗大小，默认 15
      threshold (float): 窗口一致性阈值 0-1，默认 0.7
      output_file (str): 输出 PNG 路径（默认工作区 dotplot.png）
    """
    import numpy as np

    s1 = re.sub(r'\s+', '', _read_text_arg(args.get('seq1'), 'seq1')).upper()
    s2 = re.sub(r'\s+', '', _read_text_arg(args.get('seq2'), 'seq2')).upper()
    if len(s1) < 10 or len(s2) < 10:
        raise ValueError('两条序列都至少需要 10 bp/aa')
    window = int(args.get('window', 15))
    if window < 3:
        raise ValueError('window 至少 3')
    threshold = float(args.get('threshold', 0.7))
    if not 0 < threshold <= 1:
        raise ValueError('threshold 需在 (0, 1] 区间')

    a1 = np.frombuffer(s1.encode(), dtype=np.uint8)
    a2 = np.frombuffer(s2.encode(), dtype=np.uint8)
    n1, n2 = len(a1), len(a2)
    if window > min(n1, n2):
        raise ValueError(f'window({window}) 不能大于较短序列长度({min(n1, n2)})')

    # 仅对滑窗可覆盖的锚点计算；用步长 1 的矩阵运算（窗口化重排）
    # 为控制内存，逐行计算：对 s1 每个锚点 i，比较其窗口与 s2 所有锚点窗口
    rows = n1 - window + 1
    cols = n2 - window + 1
    # 上限保护：超大序列降采样，避免 O(n*m*window) 爆内存
    MAX_ANCHORS = 3000
    step1 = max(1, rows // MAX_ANCHORS)
    step2 = max(1, cols // MAX_ANCHORS)
    idx1 = np.arange(0, rows, step1)
    idx2 = np.arange(0, cols, step2)

    # 展开窗口矩阵：windows1[k] = s1[k:k+window]
    w1 = np.lib.stride_tricks.sliding_window_view(a1, window)[idx1]      # (R, W)
    w2 = np.lib.stride_tricks.sliding_window_view(a2, window)[idx2]      # (C, W)
    # 一致性 = 逐位相等比例；分块计算防内存峰值
    dots_i, dots_j, sims = [], [], []
    BLOCK = 400
    for b0 in range(0, len(idx1), BLOCK):
        chunk = w1[b0:b0 + BLOCK]                                        # (b, W)
        eq = (chunk[:, None, :] == w2[None, :, :]).mean(axis=2)          # (b, C)
        mask = eq >= threshold
        if mask.any():
            ii, jj = np.nonzero(mask)
            dots_i.extend((idx1[b0 + ii] + 1).tolist())
            dots_j.extend((idx2[jj] + 1).tolist())
            sims.extend(eq[ii, jj].tolist())

    n_dots = len(dots_i)
    # 识别主对角（同一序列自身比对时的自比对信号）
    diag_hits = sum(1 for i, j in zip(dots_i, dots_j) if abs(i - j) <= 2)

    # ---- 绘图 ----
    out_file = args.get('output_file') or 'dotplot.png'
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(7, 7))
    if n_dots:
        ax.scatter(dots_j, dots_i, s=1.2, c=sims, cmap='viridis',
                   vmin=threshold, vmax=1.0, linewidths=0)
    ax.set_xlabel(f'seq2 (length {n2})')
    ax.set_ylabel(f'seq1 (length {n1})')
    ax.set_title(f'Dotplot  window={window}  threshold={threshold}')
    ax.set_xlim(0, n2 + 1)
    ax.set_ylim(0, n1 + 1)
    ax.set_aspect('equal', adjustable='box')
    fig.tight_layout()
    fig.savefig(out_file, dpi=300)
    plt.close(fig)

    return {
        'seq1_length': n1, 'seq2_length': n2,
        'window': window, 'threshold': threshold,
        'anchor_step': {'seq1': step1, 'seq2': step2},
        'dots': n_dots,
        'dot_density': round(n_dots / (len(idx1) * len(idx2)), 6) if len(idx1) and len(idx2) else 0,
        'main_diagonal_hits': diag_hits,
        'self_comparison': s1 == s2,
        'output_file': os.path.abspath(out_file),
        'note': ('点为满足窗口一致性阈值的锚点对。同序列自比对应出现主对角；'
                 '反向互补/重复区会表现为副对角或方块。'
                 '锚点超过 3000 时自动步进降采样（anchor_step 给出步长）。'),
    }


# ================================================================ UniProt

_UNIPROT_BASE = 'https://rest.uniprot.org/uniprotkb'


def op_uniprot(args):
    """UniProt 蛋白知识库查询（真实 REST API）。

    mode:
      entry   —— 单条完整条目（默认）：功能、基因、序列、按类型归并的 feature
      ptm     —— 只看翻译后修饰相关 feature（Modified residue / Cross-link /
                 Glycosylation / Lipidation / Disulfide bond）
      xref    —— 交叉引用按数据库归并（PDB/InterPro/Pfam/GO/KEGG/Reactome…）
      pathway —— 通路信息（从交叉引用中提取 KEGG/Reactome/UniPathway）
      sequence—— 仅取 FASTA 序列
      search  —— 关键词检索（args.query），返回匹配条目摘要列表

    args:
      accession (str): UniProt 登录号（如 P38398），entry/ptm/xref/pathway/sequence 模式必填
      query (str): search 模式的检索式（如 "BRCA1 human"、"kinase AND organism_id:9606"）
      limit (int): search 模式返回条数，默认 10
    """
    mode = (args.get('mode') or 'entry').strip().lower()
    if mode not in ('entry', 'ptm', 'xref', 'pathway', 'sequence', 'search'):
        raise ValueError(f'mode 必须是 entry/ptm/xref/pathway/sequence/search，收到 {mode!r}')

    if mode == 'search':
        query = (args.get('query') or '').strip()
        if not query:
            raise ValueError('search 模式需要 query')
        limit = max(1, min(int(args.get('limit', 10)), 50))
        url = (f'{_UNIPROT_BASE}/search?query={urllib.parse.quote(query)}'
               f'&format=json&size={limit}&fields=accession,id,protein_name,gene_names,'
               f'organism_name,length,reviewed')
        data = _http_json(url)
        results = []
        for r in data.get('results', []):
            pd = r.get('proteinDescription', {})
            name = ''
            for key in ('recommendedName', 'submissionNames'):
                if pd.get(key):
                    v = pd[key]
                    if isinstance(v, list):
                        v = v[0]
                    nm = v.get('fullName', {}) if isinstance(v, dict) else {}
                    name = nm.get('value', '') if isinstance(nm, dict) else ''
                    if name:
                        break
            results.append({
                'accession': r.get('primaryAccession'),
                'entry_name': r.get('uniProtkbId'),
                'protein_name': name,
                'gene': (r.get('genes') or [{}])[0].get('geneName', {}).get('value', ''),
                'organism': r.get('organism', {}).get('scientificName', ''),
                'length': r.get('sequence', {}).get('length'),
                'reviewed': r.get('entryType', '').startswith('UniProtKB reviewed'),
            })
        return {'mode': 'search', 'query': query, 'count': len(results), 'results': results,
                'source': 'UniProt REST (rest.uniprot.org)'}

    acc = (args.get('accession') or '').strip()
    if not acc:
        raise ValueError(f'{mode} 模式需要 accession（UniProt 登录号，如 P38398）')

    if mode == 'sequence':
        req = urllib.request.Request(f'{_UNIPROT_BASE}/{acc}.fasta',
                                     headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=40) as resp:
            fasta = resp.read().decode('utf-8')
        seq = ''.join(l.strip() for l in fasta.splitlines() if not l.startswith('>'))
        return {'mode': 'sequence', 'accession': acc, 'length': len(seq),
                'sequence': seq, 'fasta': fasta.strip(),
                'source': 'UniProt REST'}

    data = _http_json(f'{_UNIPROT_BASE}/{acc}.json')
    pd = data.get('proteinDescription', {})
    name = ''
    for key in ('recommendedName', 'submissionNames'):
        if pd.get(key):
            v = pd[key]
            if isinstance(v, list):
                v = v[0]
            nm = v.get('fullName', {}) if isinstance(v, dict) else {}
            name = nm.get('value', '') if isinstance(nm, dict) else ''
            if name:
                break

    features = data.get('features', [])
    basic = {
        'accession': data.get('primaryAccession'),
        'entry_name': data.get('uniProtkbId'),
        'protein_name': name,
        'genes': [g.get('geneName', {}).get('value') for g in data.get('genes', [])
                  if g.get('geneName')],
        'organism': data.get('organism', {}).get('scientificName'),
        'taxon_id': data.get('organism', {}).get('taxonId'),
        'length': data.get('sequence', {}).get('length'),
        'mass_da': data.get('sequence', {}).get('molWeight'),
        'reviewed': data.get('entryType', ''),
        'function': [c.get('texts', [{}])[0].get('value', '')
                     for c in data.get('comments', []) if c.get('commentType') == 'FUNCTION'
                     and c.get('texts')][:3],
    }

    def _feat(x):
        loc = x.get('location', {})
        return {
            'type': x.get('type'),
            'start': (loc.get('start') or {}).get('value'),
            'end': (loc.get('end') or {}).get('value'),
            'description': x.get('description', ''),
            'evidence': [e.get('evidenceCode') for e in (x.get('evidences') or [])],
        }

    if mode == 'ptm':
        PTM_TYPES = {'Modified residue', 'Cross-link', 'Glycosylation',
                     'Lipidation', 'Disulfide bond'}
        sel = [_feat(f) for f in features if f.get('type') in PTM_TYPES]
        by_type = {}
        for f in sel:
            by_type.setdefault(f['type'], []).append(f)
        return {
            'mode': 'ptm', 'protein': basic,
            'ptm_counts': {k: len(v) for k, v in sorted(by_type.items())},
            'total_sites': len(sel),
            'sites_by_type': by_type,
            'note': ('位点为序列坐标（1-based）。「Modified residue」为已注释的翻译后修饰残基，'
                     'evidence 字段给出证据码（ECO 编号）。'),
            'source': 'UniProt REST',
        }

    xrefs = data.get('uniProtKBCrossReferences', [])
    if mode in ('xref', 'pathway'):
        by_db = {}
        for x in xrefs:
            by_db.setdefault(x.get('database', ''), []).append({
                'id': x.get('id'),
                'properties': {p.get('key'): p.get('value') for p in (x.get('properties') or [])},
            })
        if mode == 'pathway':
            want = ('KEGG', 'Reactome', 'UniPathway', 'PathwayCommons')
            pw = {k: v for k, v in by_db.items() if k in want}
            return {'mode': 'pathway', 'protein': basic, 'pathway_databases': list(pw),
                    'pathways': pw,
                    'note': '通路条目取自 UniProt 交叉引用（id + name 属性）。',
                    'source': 'UniProt REST'}
        summary = {k: len(v) for k, v in sorted(by_db.items(), key=lambda kv: -len(kv[1]))}
        return {'mode': 'xref', 'protein': basic, 'database_counts': summary,
                'database_total': len(by_db), 'xref_total': len(xrefs),
                'xrefs': {k: v[:50] for k, v in by_db.items()},
                'note': '每个数据库最多返回 50 条明细；database_counts 为完整计数。',
                'source': 'UniProt REST'}

    # ---- entry（默认）----
    type_counts = {}
    for f in features:
        type_counts[f.get('type')] = type_counts.get(f.get('type'), 0) + 1
    key_feats = [_feat(f) for f in features
                 if f.get('type') in ('Domain', 'Region', 'Active site', 'Binding site',
                                      'Motif', 'Transmembrane', 'Signal peptide',
                                      'Modified residue', 'Disulfide bond')]
    return {
        'mode': 'entry', 'protein': basic,
        'feature_counts': dict(sorted(type_counts.items(), key=lambda kv: -kv[1])),
        'feature_total': len(features),
        'key_features': key_feats[:120],
        'xref_database_count': len({x.get('database') for x in xrefs}),
        'sequence_header': data.get('sequence', {}).get('molWeight'),
        'note': ('feature_counts 为全量计数（可能上百条，如 Natural variant）；'
                 'key_features 只返回功能相关类型且上限 120 条。'
                 'PTM 明细请用 mode=ptm，交叉引用用 mode=xref，通路用 mode=pathway。'),
        'source': 'UniProt REST (rest.uniprot.org)',
    }


# ================================================================ G3 树比较

def _parse_newick(text):
    from Bio import Phylo
    return Phylo.read(io.StringIO(text), 'newick')


def _bipartitions(tree):
    """无根树的双分区集合（bipartition），用于 Robinson-Foulds 距离。

    以叶子名集合表示每条内部边对应的分裂（clade），去掉平凡分裂
    （单叶子 / 全部叶子的补集）。

    ⚠️ 规范化必须按「词典序取小」而不是「取较短边」：一条内部边天然产生两个
    互补的 clade（如 {A,B} 与 {C,D}），长度相同时"取短"会把同一个分裂记两次，
    使 4 叶树拓扑翻转的 RF 从 2 变成 4（实测踩过）。词典序规范形保证互补两侧
    映射到同一个键。
    """
    all_set = frozenset(t.name for t in tree.get_terminals())
    splits = set()

    def canon(s):
        comp = all_set - s
        a = tuple(sorted(s))
        b = tuple(sorted(comp))
        return frozenset(a if a <= b else b)

    def walk(clade):
        if not clade.clades:
            return frozenset([clade.name])
        s = frozenset()
        for c in clade.clades:
            s = s | walk(c)
        if s and s != all_set and len(s) > 1 and len(all_set - s) > 1:
            splits.add(canon(s))
        return s

    walk(tree.root)
    return splits, all_set


def op_phylo_compare(args):
    """比较两棵系统发育树：Robinson-Foulds 距离 + 拓扑差异明细。

    args:
      tree1 / tree2 (str): Newick 字符串（或文件路径）
      detail (bool): 是否返回差异分裂的具体组成，默认 True
    """
    from Bio import Phylo

    t1_raw = _read_text_arg(args.get('tree1'), 'tree1')
    t2_raw = _read_text_arg(args.get('tree2'), 'tree2')
    if not t1_raw.strip().startswith('(') and not t1_raw.strip().endswith(';'):
        raise ValueError('tree1 看起来不是 Newick 字符串（应以 "(" 开头）')
    t1 = _parse_newick(t1_raw)
    t2 = _parse_newick(t2_raw)

    l1 = {t.name for t in t1.get_terminals()}
    l2 = {t.name for t in t2.get_terminals()}
    shared = l1 & l2
    if len(shared) < 4:
        raise ValueError(
            f'两棵树共有叶节点只有 {len(shared)} 个（需 ≥4 才能做 RF 比较）；'
            f'tree1={len(l1)} 个叶，tree2={len(l2)} 个，共有={sorted(shared)}。'
            '请确认两棵树使用同一套叶名。')

    # 只保留共有叶，保证比较在相同 taxa 集上进行
    t1c = t1
    t2c = t2
    for t in (t1c, t2c):
        for leaf in list(t.get_terminals()):
            if leaf.name not in shared:
                t.prune(leaf)

    s1, allset = _bipartitions(t1c)
    s2, _ = _bipartitions(t2c)
    common = s1 & s2
    only1 = s1 - s2
    only2 = s2 - s1
    rf = len(only1) + len(only2)
    max_rf = len(s1) + len(s2)
    n_internal = max(1, 2 * len(shared) - 3)  # 无根二叉树的内部边数上界

    out = {
        'tree1_leaves': len(l1), 'tree2_leaves': len(l2),
        'shared_leaves': len(shared),
        'dropped_from_tree1': sorted(l1 - shared),
        'dropped_from_tree2': sorted(l2 - shared),
        'tree1_splits': len(s1), 'tree2_splits': len(s2),
        'shared_splits': len(common),
        'robinson_foulds_distance': rf,
        'max_possible_rf': max_rf,
        'normalized_rf': round(rf / max_rf, 6) if max_rf else 0.0,
        'trees_identical_topology': rf == 0,
        'internal_edges_expected': n_internal,
        'note': ('RF 距离为无根树的对称差分裂计数（0 = 拓扑完全一致）。'
                 'normalized_rf = RF / 两棵树分裂数之和，取值 0-1。'
                 '仅比较共有叶节点；缺失叶已从两棵树中剪除并在 dropped_* 列出。'),
    }
    if args.get('detail', True):
        out['splits_only_in_tree1'] = [sorted(x) for x in sorted(only1, key=len)][:60]
        out['splits_only_in_tree2'] = [sorted(x) for x in sorted(only2, key=len)][:60]
    return out


# ================================================================ G5 RNA 二级结构

def op_rna_fold(args):
    """RNA 二级结构预测（ViennaRNA 热力学模型）。

    args:
      sequence (str): RNA 序列（或 DNA，自动 T→U）；也可传文件路径
      output_file (str): 可选，输出结构示意图 PNG
      also_ensemble (bool): 是否附加配分函数/集合多样性，默认 True
    """
    seq = re.sub(r'[^ACGTUacgtu]', '', _read_text_arg(args.get('sequence'), 'sequence')).upper()
    seq = seq.replace('T', 'U')
    if len(seq) < 10:
        raise ValueError('RNA 序列至少 10 nt')
    if len(seq) > 20000:
        raise ValueError('序列过长（>20000 nt），ViennaRNA 在此规模不可行')

    import RNA  # ViennaRNA —— 第二层按需依赖（EXTRA_DEPS.rna_fold）

    structure, mfe = RNA.fold(seq)
    # 解析 dot-bracket 得碱基对（比 ptable 更直观可控）
    stack, pairs = [], []
    for idx, ch in enumerate(structure, start=1):
        if ch == '(':
            stack.append(idx)
        elif ch == ')':
            if not stack:
                raise RuntimeError(f'ViennaRNA 返回的二级结构括号不匹配: {structure[:60]}')
            pairs.append((stack.pop(), idx))
    if stack:
        raise RuntimeError('ViennaRNA 返回的二级结构存在未闭合括号')

    result = {
        'sequence_length': len(seq),
        'sequence': seq,
        'structure_dot_bracket': structure,
        'mfe_kcal_per_mol': round(float(mfe), 3),
        'base_pairs': len(pairs),
        'pair_list': [{'i': i, 'j': j, 'pair': f'{seq[i - 1]}-{seq[j - 1]}'} for i, j in pairs],
        'gc_fraction': round((seq.count('G') + seq.count('C')) / len(seq), 4),
        'note': ('二级结构为热力学最小自由能（MFE）预测，非实验结构；'
                 'mfe_kcal_per_mol 越负越稳定。配对索引为 1-based。'),
        'source': 'ViennaRNA (RNA.fold)',
    }

    if args.get('also_ensemble', True):
        try:
            fc = RNA.fold_compound(seq)
            mfe_struct, mfe_e = fc.mfe()          # ViennaRNA 返回 (structure, energy)
            pf_struct, pf_e = fc.pf()             # 同上
            mm = fc.mean_bp_distance() if hasattr(fc, 'mean_bp_distance') else None
            result['ensemble'] = {
                'free_energy_ensemble_kcal_per_mol': round(float(pf_e), 3) if pf_e is not None else None,
                'mfe_kcal_per_mol_check': round(float(mfe_e), 3) if mfe_e is not None else None,
                'mfe_structure_agrees': mfe_struct == structure,
                'mean_base_pair_distance': round(float(mm), 4) if mm is not None else None,
            }
        except Exception as e:
            result['ensemble'] = {'error': f'{type(e).__name__}: {e}'}

    out_file = args.get('output_file')
    if out_file:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(12, 2.6))
        ax.text(0.5, 0.72, seq, fontsize=6, family='monospace', ha='center', va='center',
                transform=ax.transAxes)
        ax.text(0.5, 0.40, structure, fontsize=6, family='monospace', ha='center', va='center',
                transform=ax.transAxes)
        # 弧线表示配对
        n = len(seq)
        for i, j in pairs:
            x1, x2 = 0.02 + 0.96 * (i - 1) / max(1, n - 1), 0.02 + 0.96 * (j - 1) / max(1, n - 1)
            ax.annotate('', xy=(x2, 0.30), xytext=(x1, 0.30),
                        arrowprops=dict(arrowstyle='-', color='#2b6cb0', lw=0.5),
                        xycoords='axes fraction', textcoords='axes fraction')
        ax.set_title(f'RNA MFE structure  ΔG={mfe:.2f} kcal/mol  ({len(pairs)} bp, n={n})',
                     fontsize=9)
        ax.axis('off')
        fig.tight_layout()
        fig.savefig(out_file, dpi=300)
        plt.close(fig)
        result['output_file'] = os.path.abspath(out_file)

    return result
