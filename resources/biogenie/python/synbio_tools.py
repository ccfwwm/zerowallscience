"""合成生物学 Phase 1 工具 — primer3 引物设计 / DNA Chisel 多约束优化 / pydna 克隆模拟

所有第三方依赖均为**函数体内懒加载**：模块导入失败时返回带安装提示的
error 字典，不影响 bio_ops.py 其余 op 的加载。

- primer3-py / dnachisel：第二层按需依赖（v0.6.16 起，src/extra-deps.js
  EXTRA_DEPS 注册），TS 侧会在调用 primer3_design/dna_optimize 前自动
  uv pip install（dna-features-viewer 同理挂 plasmid_map）；此处仍兜底返回友好错误。
- pydna：第二层按需依赖（src/extra-deps.js EXTRA_DEPS），TS 侧会在调用
  clone_simulate 前自动 uv pip install；此处仍兜底返回友好错误。
- sbol3 / tyto：同为第二层（2026-08-26 下沉，挂 sbol_write/sbol_read）；
  tyto 的 pyparsing(<3) 约束是移出第一层的直接原因（避免钉死全局 pyparsing 2.x，
  与 clone_simulate 护栏 pyparsing>=3.1 冲突）。
"""
import os
import sys
from seq_util import clean_seq

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))




# Primer3 explain 短语 → 中文可操作建议。
# n=0 时只回传英文统计（如 "considered 548, overlap target 548, ok 0"）时，
# agent 只能靠猜测逐个放宽参数试错（v0.6.26 E2E：连续 3 次无效调用后才放弃）。
_PRIMER3_EXPLAIN_HINTS = (
    ('overlap target',
     '候选引物与 SEQUENCE_TARGET 重叠被排除——该参数（本工具的 must_include）要求引物落在'
     '目标区之外，目标区覆盖到序列端点时必然无解；要扩增某区间请用 target_region，'
     '要扩增全长请省略 must_include'),
    ('no target', '没有候选引物能覆盖要求的 must_include 区域'),
    ('gc content failed', 'GC% 落在 gc_range 之外（高 GC / 低 GC 模板常见）→ 放宽 gc_range'),
    ('gc clamp', "3' 端 GC 钳不足 → 放宽 gc_range 或加长引物"),
    ('tm too high', 'Tm 高于 tm_range 上限 → 抬高 tm_range 上限'),
    ('tm too low', 'Tm 低于 tm_range 下限 → 压低 tm_range 下限'),
    ('hairpin', '发夹结构 Tm 超限 → 提高 max_hairpin_tm'),
    ('self any', '自互补 Tm 超限 → 提高 max_self_any_tm'),
    ('self end', "3' 端自互补超限 → 提高 max_self_any_tm"),
    ('poly x', '出现长同聚碱基串 → 放宽 primer_size'),
    ('primer size', '引物长度落在 primer_size 之外 → 放宽 primer_size'),
    ('too many ns', '候选区含过多 N 碱基'),
)


def _primer3_explain_hint(explain):
    """把 Primer3 的英文 explain 统计翻成可操作建议（命中原因去重后串联）。"""
    low = (explain or '').lower()
    hits = []
    for key, hint in _PRIMER3_EXPLAIN_HINTS:
        if key in low and hint not in hits:
            hits.append(hint)
    if not hits:
        return ('未能从 explain 定位单一原因；可先放宽 tm_range / gc_range / primer_size，'
                '或省略 target_region 只按产物长度约束设计。')
    return '；'.join(hits)


def op_primer3_design(args):
    """工业级 PCR 引物设计（primer3-py）：模板 → 候选引物对（Tm/GC/二级结构评分）。

    与 op_primer_design（dna_design.py，Biopython 简单版）区分：本 op 走
    Primer3 热力学评分（发夹/自互补/二聚体 Tm + penalty 排序），适合
    需要可投稿级引物质量的场景。
    """
    try:
        import primer3
    except ImportError:
        return {'error': 'primer3-py 未安装，请运行 bio_env reinstall=true 或 uv pip install primer3-py'}

    sequence = clean_seq(args.get('sequence', ''))
    if not sequence:
        raise ValueError('sequence 必填（模板 DNA 序列）')
    if len(sequence) < 40:
        raise ValueError(f'模板太短（{len(sequence)} bp），Primer3 至少需要 ~40 bp')

    primer_size = args.get('primer_size') or [18, 25]
    tm_range = args.get('tm_range') or [58, 65]
    gc_range = args.get('gc_range') or [40, 60]
    num_return = int(args.get('num_return', 5))

    seq_args = {
        'SEQUENCE_ID': str(args.get('name', 'target')),
        'SEQUENCE_TEMPLATE': sequence,
    }
    # target_region 语义 = 「要扩增的区间」（引物落在区间内）→ 映射到 Primer3 的
    # SEQUENCE_INCLUDED_REGION。绝不能映射到 SEQUENCE_TARGET：后者要求引物位于
    # 目标区之外，扩增全长（如 [0, 720]）时引物无处可放 → 恒返回 ok 0，且与
    # 放宽 tm/gc/二级结构约束完全无关（v0.6.26 E2E 实测：eGFP 720bp 全长扩增
    # 连续 3 次失败，agent 无法靠调参自救）。
    target_region = args.get('target_region')
    if target_region:
        start, length = int(target_region[0]), int(target_region[1])
        if not (0 <= start < len(sequence)) or length <= 0 or start + length > len(sequence):
            raise ValueError(f'target_region [{start}, {length}] 超出模板范围（{len(sequence)} bp）')
        seq_args['SEQUENCE_INCLUDED_REGION'] = [start, length]

    # must_include = 产物必须包含、且引物不得进入的内部区域（Primer3 SEQUENCE_TARGET）。
    # 触及序列端点时无解（引物须在其之外），故前置拒绝并引导到 target_region。
    must_include = args.get('must_include')
    if must_include:
        mstart, mlen = int(must_include[0]), int(must_include[1])
        if not (0 <= mstart < len(sequence)) or mlen <= 0 or mstart + mlen > len(sequence):
            raise ValueError(f'must_include [{mstart}, {mlen}] 超出模板范围（{len(sequence)} bp）')
        if mstart == 0 or mstart + mlen == len(sequence):
            raise ValueError(
                'must_include 触及序列端点 → Primer3 SEQUENCE_TARGET 要求引物位于该区域之外，'
                '端点处无引物可放，恒无解。要扩增某个区间请用 target_region；'
                '要扩增全长请省略 must_include，直接靠 PRIMER_PRODUCT_SIZE_RANGE 限定产物长度。')
        seq_args['SEQUENCE_TARGET'] = [mstart, mlen]

    # 产物长度约束：给了 target_region 就必须让产物真正覆盖该区间，否则 Primer3
    # 会在区间内部挑最短产物（实测 target_region=[0,720] 全长扩增返回 315bp 短产物）。
    max_primer = int(primer_size[1])
    if target_region:
        tlen = int(target_region[1])
        product_range = [[max(60, tlen), min(len(sequence) + 2 * max_primer, tlen + 2 * max_primer)]]
    else:
        product_range = [[max(60, len(sequence) // 4), len(sequence)]]
    if must_include:
        product_range[0][0] = max(product_range[0][0], int(must_include[1]))

    global_args = {
        'PRIMER_NUM_RETURN': num_return,
        'PRIMER_MIN_SIZE': int(primer_size[0]),
        'PRIMER_OPT_SIZE': int(sum(primer_size) / 2),
        'PRIMER_MAX_SIZE': int(primer_size[1]),
        'PRIMER_MIN_TM': float(tm_range[0]),
        'PRIMER_OPT_TM': round(sum(tm_range) / 2, 1),
        'PRIMER_MAX_TM': float(tm_range[1]),
        'PRIMER_MIN_GC': float(gc_range[0]),
        'PRIMER_MAX_GC': float(gc_range[1]),
        'PRIMER_MAX_HAIRPIN_TH': float(args.get('max_hairpin_tm', 47.0)),
        'PRIMER_MAX_SELF_ANY_TH': float(args.get('max_self_any_tm', 47.0)),
        'PRIMER_PRODUCT_SIZE_RANGE': product_range,
    }

    res = primer3.bindings.design_primers(seq_args, global_args)
    n = int(res.get('PRIMER_PAIR_NUM_RETURNED', 0))
    if n == 0:
        explain = (res.get('PRIMER_LEFT_EXPLAIN', '') + ' | '
                   + res.get('PRIMER_RIGHT_EXPLAIN', '')).strip()
        return {'pairs': [], 'n_returned': 0,
                'position_base': '0-based (Primer3 约定, [start, length])',
                'note': f'Primer3 未找到满足约束的引物对。诊断：{_primer3_explain_hint(explain)}',
                'explain_raw': explain,
                'applied_included_region': seq_args.get('SEQUENCE_INCLUDED_REGION'),
                'applied_must_include': seq_args.get('SEQUENCE_TARGET'),
                'effective_constraints': {
                    'primer_size': [int(primer_size[0]), int(primer_size[1])],
                    'tm_range': [float(tm_range[0]), float(tm_range[1])],
                    'gc_range': [float(gc_range[0]), float(gc_range[1])],
                    'max_hairpin_tm': float(args.get('max_hairpin_tm', 47.0)),
                    'max_self_any_tm': float(args.get('max_self_any_tm', 47.0)),
                    'product_size_range': global_args['PRIMER_PRODUCT_SIZE_RANGE'][0],
                }}

    pairs = []
    for i in range(n):
        def g(key, idx=i):
            return res.get(f'PRIMER_LEFT_{idx}_{key}') if key else None
        left = res.get(f'PRIMER_LEFT_{i}_SEQUENCE', '')
        right = res.get(f'PRIMER_RIGHT_{i}_SEQUENCE', '')
        pairs.append({
            'rank': i + 1,
            'penalty': round(float(res.get(f'PRIMER_PAIR_{i}_PENALTY', 0)), 4),
            'product_size': int(res.get(f'PRIMER_PAIR_{i}_PRODUCT_SIZE', 0)),
            'left': {
                'sequence': left,
                'tm': round(float(res.get(f'PRIMER_LEFT_{i}_TM', 0)), 2),
                'gc_percent': round(float(res.get(f'PRIMER_LEFT_{i}_GC_PERCENT', 0)), 1),
                'hairpin_tm': round(float(res.get(f'PRIMER_LEFT_{i}_HAIRPIN_TH', 0)), 2),
                'self_any_tm': round(float(res.get(f'PRIMER_LEFT_{i}_SELF_ANY_TH', 0)), 2),
                'position': list(res.get(f'PRIMER_LEFT_{i}', [None, None])),
            },
            'right': {
                'sequence': right,
                'tm': round(float(res.get(f'PRIMER_RIGHT_{i}_TM', 0)), 2),
                'gc_percent': round(float(res.get(f'PRIMER_RIGHT_{i}_GC_PERCENT', 0)), 1),
                'hairpin_tm': round(float(res.get(f'PRIMER_RIGHT_{i}_HAIRPIN_TH', 0)), 2),
                'self_any_tm': round(float(res.get(f'PRIMER_RIGHT_{i}_SELF_ANY_TH', 0)), 2),
                'position': list(res.get(f'PRIMER_RIGHT_{i}', [None, None])),
            },
            'compl_any_tm': round(float(res.get(f'PRIMER_PAIR_{i}_COMPL_ANY_TH', 0)), 2),
            'compl_end_tm': round(float(res.get(f'PRIMER_PAIR_{i}_COMPL_END_TH', 0)), 2),
        })

    return {
        'pairs': pairs,
        'n_returned': n,
        'recommended': pairs[0] if pairs else None,
        'position_base': '0-based (Primer3 约定, [start, length])',
        'note': '按 Primer3 penalty 升序排列，rank 1 为推荐引物对；'
                'hairpin/self_any/compl Tm 越低越好（阈值见传入参数）。',
    }


def op_dna_optimize(args):
    """多约束 DNA 序列优化（DNA Chisel）：EnforceTranslation + CodonOptimize + 约束集。

    与 op_seq_optimize（dna_design.py，简单密码子替换）区分：本 op 是
    约束求解架构——同时满足去限制性位点/GC 窗口/禁用 motif 等多约束后再做
    密码子优化，并返回逐位点修改报告。
    """
    try:
        from dnachisel import (
            DnaOptimizationProblem, CodonOptimize, EnforceTranslation,
            EnforceGCContent, AvoidPattern,
        )
    except ImportError:
        return {'error': 'dnachisel 未安装，请运行 bio_env reinstall=true 或 uv pip install dnachisel'}

    dna = args.get('dna_sequence')
    protein = args.get('protein_sequence')
    host = str(args.get('host_organism', 'e_coli'))
    constraints = args.get('constraints') or {}
    if not isinstance(constraints, dict):
        raise ValueError(
            'constraints 须为对象 {"remove_restriction_sites": [...], "gc_range": [min,max], "avoid_motifs": [...]}，'
            f'收到: {type(constraints).__name__}——如需约束请传 {{"gc_range": [40, 60]}} 形式')
    do_codon_opt = bool(args.get('codon_optimize', True))

    if dna:
        dna = clean_seq(dna)
    elif protein:
        # 反向翻译起点：先用最优密码子铺一条初始序列，再交给约束求解
        from dnachisel.biotools import reverse_translate
        dna = reverse_translate(clean_seq(protein))
    else:
        raise ValueError('dna_sequence 与 protein_sequence 至少提供一个')

    cons = [EnforceTranslation()]  # 保持氨基酸序列不变
    gc_range = constraints.get('gc_range')
    if gc_range:
        cons.append(EnforceGCContent(mini=float(gc_range[0]) / 100,
                                     maxi=float(gc_range[1]) / 100,
                                     window=80))
    for enz in constraints.get('remove_restriction_sites') or []:
        try:
            from Bio.Restriction import RestrictionBatch
            batch = RestrictionBatch([enz])
            if len(batch) == 1:
                site = str(list(batch)[0].site)
                cons.append(AvoidPattern(site))
        except Exception:
            pass  # 未知酶名跳过，不阻塞优化
    for motif in constraints.get('avoid_motifs') or []:
        cons.append(AvoidPattern(clean_seq(motif)))

    objectives = [CodonOptimize(species=host)] if do_codon_opt else []
    problem = DnaOptimizationProblem(sequence=dna, constraints=cons, objectives=objectives)
    problem.resolve_constraints()
    problem.optimize()

    optimized = str(problem.sequence)
    changes = sum(1 for a, b in zip(dna, optimized) if a != b) + abs(len(dna) - len(optimized))
    gc_new = sum(1 for c in optimized if c in 'GC') / len(optimized) * 100 if optimized else 0

    return {
        'optimized_sequence': optimized,
        'length': len(optimized),
        'gc_percent': round(gc_new, 2),
        'n_changes': changes,
        'change_rate': round(changes / len(dna) * 100, 2) if dna else 0,
        'constraints_satisfied': bool(problem.all_constraints_pass()),
        'host_organism': host,
        'note': 'EnforceTranslation 保证氨基酸序列不变；n_changes 为相对输入 DNA 的碱基修改数。',
    }


def op_clone_simulate(args):
    """克隆模拟（pydna）：gibson / golden_gate / restriction 三种方法的组装模拟。

    pydna 是第二层依赖——TS 侧 ensureExtraDeps 会在调用前自动安装；
    此处 import 失败时返回 needs_install 提示兜底。
    """
    try:
        from pydna.dseqrecord import Dseqrecord
        from pydna.assembly import Assembly
    except ImportError:
        return {'error': 'pydna 未安装，正在自动安装…（若仍未就绪请运行 uv pip install pydna）',
                'needs_install': True}

    backbone = clean_seq(args.get('backbone', ''))
    inserts = args.get('inserts') or []
    method = str(args.get('method', 'gibson')).lower()
    if not backbone:
        raise ValueError('backbone（载体序列）必填')
    if not inserts:
        raise ValueError('inserts（插入片段列表 [{name, sequence}]）必填')
    if method not in ('gibson', 'golden_gate', 'restriction', 'ligation'):
        raise ValueError(f'method 仅支持 gibson/golden_gate/restriction/ligation，收到: {method}')

    fragments = [Dseqrecord(backbone, name='backbone', circular=True)]
    for i, ins in enumerate(inserts):
        seq = clean_seq(ins.get('sequence', '') if isinstance(ins, dict) else ins)
        if not seq:
            raise ValueError(f'inserts[{i}] 缺 sequence')
        fragments.append(Dseqrecord(seq, name=(ins.get('name') if isinstance(ins, dict) else None)
                                    or f'insert_{i + 1}'))

    if method == 'gibson':
        # 需要片段间同源臂重叠；默认按 20bp 上限检测
        limit = int(args.get('overlap', 20))
        asm = Assembly(fragments, limit=limit)
        products = asm.assemble_circular()
        if not products:
            # 无重叠时给出设计建议而非裸失败
            return {
                'method': 'gibson',
                'feasible': False,
                'n_products': 0,
                'note': f'片段间未检测到 ≥{limit}bp 同源臂，无法直接组装。'
                        '请为每个片段设计重叠接头（可用 bio_assembly_design 生成 overlap 方案），'
                        '把接头序列并入片段 5\'/3\' 端后重试。',
            }
        product = products[0]
        return {
            'method': 'gibson',
            'feasible': True,
            'n_products': len(products),
            'product_length': len(product),
            'product_sequence': str(product.seq),
            'circular': True,
            'note': 'Gibson 环化组装成功；product_sequence 为预期产物（载体+全部插入片段）。',
        }

    # golden_gate / restriction / ligation：以可行性检查 + 方案输出为主
    enzymes = args.get('restriction_enzymes') or (['BsaI'] if method == 'golden_gate' else [])
    from Bio.Restriction import RestrictionBatch
    report = {'method': method, 'enzymes': enzymes, 'fragments': []}
    feasible = True
    for frag in fragments:
        entry = {'name': frag.name, 'length': len(frag)}
        if enzymes:
            try:
                batch = RestrictionBatch(enzymes)
                analysis = batch.search(frag.seq, linear=not frag.circular)
                entry['cut_sites'] = {str(e): sites for e, sites in analysis.items() if sites}
            except Exception as e:
                entry['cut_sites_error'] = str(e)
                feasible = False
        report['fragments'].append(entry)
    if method == 'golden_gate':
        # Golden Gate 要求插入片段内部无 Type IIS 位点
        for entry in report['fragments'][1:]:
            if entry.get('cut_sites'):
                entry['warning'] = '插入片段内部含 Type IIS 位点，需先做同义突变消除'
                feasible = False
        report['note'] = ('Golden Gate 需要各片段两端带 BsaI 位点 + 唯一 4bp overhang；'
                          '组装产物序列模拟建议走 gibson 路径或 bio_python 自定义 pydna 脚本。')
    else:
        report['note'] = ('限制酶克隆：确认各片段末端可被所选酶切割、内部无位点；'
                          '电泳模拟/产物序列可结合 bio_seq_restriction 与 bio_python 完成。')
    report['feasible'] = feasible
    return report


# ---- Phase 2：SBOL 3 标准化读写 ----

def _role_uri(role):
    """角色名/term → 本体 URI（tyto 解析，失败原样返回）。"""
    try:
        import tyto
        uri = tyto.SO.get_uri_by_term(str(role))
        if uri:
            return uri
    except Exception:
        pass
    return str(role)


def op_sbol_write(args):
    """SBOL 3 写出：组件列表（name/type/sequence/role）→ SBOL 3 XML 文件。

    每个组件生成 Component（SBO 类型 + SO role）+ 关联 Sequence（IUPAC DNA），
    本体 URI 经 tyto 解析（如 promoter → SO:0000167）。
    """
    try:
        import sbol3
    except ImportError:
        return {'error': 'sbol3 未安装，请运行 bio_env reinstall=true 或 uv pip install sbol3 tyto'}

    components = args.get('components') or []
    output_file = args.get('output_file')
    if not components:
        raise ValueError('components 必填（[{name, type, sequence, role}]）')
    if not output_file:
        raise ValueError('output_file 必填（SBOL 3 XML 输出路径）')

    namespace = str(args.get('namespace', 'https://dsh-bio-genie.local/design'))
    sbol3.set_namespace(namespace)

    type_map = {
        'dna': sbol3.SBO_DNA, 'rna': sbol3.SBO_RNA,
        'protein': sbol3.SBO_PROTEIN, 'complex': sbol3.SBO_NON_COVALENT_COMPLEX,
    }

    doc = sbol3.Document()
    written = []
    for i, comp in enumerate(components):
        cname = str(comp.get('name') or f'component_{i + 1}')
        ctype = type_map.get(str(comp.get('type', 'dna')).lower(), sbol3.SBO_DNA)
        roles = [_role_uri(comp['role'])] if comp.get('role') else []
        c = sbol3.Component(cname, ctype, name=cname, roles=roles)
        doc.add(c)
        seq_text = clean_seq(comp.get('sequence', '') or '')
        if seq_text:
            s = sbol3.Sequence(f'{cname}_seq', elements=seq_text.lower() if False else seq_text,
                               encoding=sbol3.IUPAC_DNA_ENCODING,
                               namespace=namespace)
            doc.add(s)
            c.sequences.append(s.identity)
        written.append({'name': cname, 'type': comp.get('type', 'dna'),
                        'role': comp.get('role'), 'has_sequence': bool(seq_text)})

    doc.write(output_file)
    return {
        'output_file': os.path.abspath(output_file),
        'n_components': len(written),
        'components': written,
        'namespace': namespace,
        'format': 'SBOL 3 (RDF/XML)',
    }


def op_sbol_read(args):
    """SBOL 3 读取：SBOL 3 XML → 组件列表（name/type/role/sequence）。

    include_sequences=true 时返回各组件关联的序列（可直接导出 FASTA 用）。
    """
    try:
        import sbol3
    except ImportError:
        return {'error': 'sbol3 未安装，请运行 bio_env reinstall=true 或 uv pip install sbol3 tyto'}

    sbol_file = args.get('sbol_file')
    if not sbol_file:
        raise ValueError('sbol_file 必填（SBOL 3 XML 文件路径）')
    if not os.path.exists(sbol_file):
        return {'error': f'文件不存在: {sbol_file}'}

    include_sequences = bool(args.get('include_sequences', True))

    doc = sbol3.Document()
    doc.read(sbol_file)

    components = []
    for obj in doc.objects:
        if not isinstance(obj, sbol3.Component):
            continue
        entry = {
            'name': obj.display_id,
            'types': [str(t) for t in obj.types],
            'roles': [str(r) for r in obj.roles],
        }
        if include_sequences:
            seqs = []
            for seq_uri in obj.sequences:
                seq_obj = doc.find(str(seq_uri))
                if seq_obj is not None and getattr(seq_obj, 'elements', None):
                    seqs.append(seq_obj.elements)
            if seqs:
                entry['sequences'] = seqs
                entry['sequence_lengths'] = [len(s) for s in seqs]
        components.append(entry)

    return {
        'sbol_file': os.path.abspath(sbol_file),
        'n_components': len(components),
        'components': components,
        'note': 'roles/types 为本体 URI（SO/SBO）；用 tyto.SO.get_term_by_uri 可反查术语名。',
    }
