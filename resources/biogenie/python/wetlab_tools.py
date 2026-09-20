"""湿实验方案设计工具
把干实验结论转化为可执行的湿实验方案。
输入：其他 bio_* 工具的输出（引物/sgRNA/质粒/敲除预测等）
输出：分步湿实验方案（试剂/条件/预期结果/注意事项）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def op_wetlab_design(args):
    """湿实验方案设计。
    args:
      protocol_type: 方案类型（必填）
        - pcr_amplification: PCR 扩增方案
        - gibson_assembly: Gibson 组装方案
        - golden_gate: Golden Gate 组装方案
        - restriction_cloning: 限制酶克隆方案
        - crispr_editing: CRISPR 编辑方案
        - strain_construction: 菌株构建方案
        - transformation: 转化方案
      input_data: 上游工具输出（必填，dict）
      host_organism: 宿主生物（默认 e_coli）
      scale: 实验规模（small/medium/large，默认 small）
    """
    protocol_type = args.get('protocol_type', '')
    input_data = args.get('input_data', {})
    host = args.get('host_organism', 'e_coli')
    scale = args.get('scale', 'small')

    if not protocol_type:
        raise ValueError('protocol_type 必填')
    if not input_data:
        raise ValueError('input_data 必填（上游工具输出）')

    dispatch = {
        'pcr_amplification': _design_pcr,
        'gibson_assembly': _design_gibson,
        'golden_gate': _design_golden_gate,
        'restriction_cloning': _design_restriction_cloning,
        'crispr_editing': _design_crispr_editing,
        'strain_construction': _design_strain_construction,
        'transformation': _design_transformation,
    }
    if protocol_type not in dispatch:
        return {'error': f'未知 protocol_type: {protocol_type}，支持: {list(dispatch.keys())}'}
    result = dispatch[protocol_type](input_data, host, scale)
    if isinstance(result, dict) and 'error' not in result:
        # 两层生成契约：Layer 1 代码事实锚点（本返回值）+ Layer 2 agent 适应性发挥。
        # assumptions 列出本模板隐含的前提，agent 必须逐条对照用户现实核验；
        # adapt_points 是鼓励 agent 结合场景具体化的位置；hard_constraints 任何层不可动。
        result['generation_contract'] = {
            'layer1_facts': '本返回值中的数值为代码计算/领域常数查表结果（事实锚点），引用时标注来源',
            'layer2_agent': '结合用户实际场景（试剂库存、设备型号、片段实测浓度、样本特性）具体化方案；改动处标注 [推断] 并说明理由',
            'assumptions': [
                '试剂为常规在保库存（酶活性正常，未反复冻融）',
                'DNA 片段浓度可用 Nanodrop/Qubit 实测（未提供时按典型浓度估算）',
                '常规热循环仪/金属浴（无特殊设备要求）',
                '标准实验室菌株与培养基体系',
            ],
            'adapt_points': [
                '试剂体积按实测浓度换算（等摩尔比的质量比需片段长度）',
                '转化方式（化学 vs 电转）按实验室既有条件选择',
                'QC 克隆数按连接效率预期调整',
                '抗性标记/培养条件按载体实际标记确认',
            ],
            'hard_constraints': HARD_CONSTRAINTS.get(protocol_type, []),
        }
    return result


# 各 protocol 的硬约束（任何层不可突破的领域常数/上游推导值）
HARD_CONSTRAINTS = {
    'pcr_amplification': [
        '退火温度必须来自 primer3 实算 Tm（min(左Tm,右Tm)−3°C），禁止手估',
        '延伸温度恒定 72°C（高保真聚合酶）',
    ],
    'gibson_assembly': [
        '组装反应温度恒定 50°C',
        '同源臂长度必须在 15-40bp 区间',
        '线性化载体末端不得有 3\' 突出',
    ],
    'golden_gate': [
        '反应温度循 BsaI/BsmBI 标准循环（37°C/16°C 循环）',
        '同义突出端不得互相兼容（防自连）',
    ],
    'restriction_cloning': [
        '连接比例（载体:插入 摩尔比 1:3~1:10）按片段大小换算质量',
        '酶切位点不得存在于插入序列内部（上游 bio_seq_restriction 已验证）',
    ],
    'crispr_editing': [
        'sgRNA 序列必须来自 CRISPR 设计工具输出（graft_design/graft_base_edit 优先；'
        '无 graft_* 时用 bio_crispr_guide），不可手改',
        'PAM（NGG）紧邻靶序列，编辑窗口位置不可移',
    ],
    'strain_construction': [
        '敲除基因清单必须来自 bio_gene_knockout optknock 输出',
        '必需基因（essentiality=essential）不可作为敲除靶点',
    ],
    'transformation': [],
}


def _design_pcr(data, host, scale):
    """PCR 扩增方案：从引物设计结果生成完整 PCR protocol。"""
    primers = data.get('primers', data.get('pairs', []))
    template = data.get('template_sequence', data.get('sequence', ''))
    product_size = data.get('product_size', 0)

    if not primers:
        return {'error': '需要 primers 或 pairs 参数（来自 bio_primer3_design 输出）'}

    # 取最佳引物对
    best = primers[0] if isinstance(primers, list) else primers
    left = best.get('left', best.get('forward', {}))
    right = best.get('right', best.get('reverse', {}))

    left_seq = left.get('sequence', '')
    right_seq = right.get('sequence', '')
    left_tm = left.get('tm', 60)
    right_tm = right.get('tm', 60)
    avg_tm = (left_tm + right_tm) / 2

    # 退火温度：取较低 Tm - 3°C（经验公式）
    anneal_temp = round(min(left_tm, right_tm) - 3, 1)
    # 延伸时间：按 1kb/min 估算（高保真酶）
    ext_time = max(30, round(product_size / 1000 * 60)) if product_size else 60

    # 反应体系
    volumes = {
        'small': {'total': 25, 'template': 1, 'primer_each': 1, 'polymerase': 0.5, 'dNTP': 0.5, 'buffer': 2.5},
        'medium': {'total': 50, 'template': 2, 'primer_each': 2, 'polymerase': 1, 'dNTP': 1, 'buffer': 5},
        'large': {'total': 100, 'template': 4, 'primer_each': 4, 'polymerase': 2, 'dNTP': 2, 'buffer': 10},
    }
    v = volumes.get(scale, volumes['small'])

    return {
        'protocol_type': 'pcr_amplification',
        'reagents': {
            'template_DNA': f'{v["template"]} μL（~50-100 ng）',
            'forward_primer': f'{v["primer_each"]} μL（10 μM）',
            'reverse_primer': f'{v["primer_each"]} μL（10 μM）',
            'DNA_polymerase': f'{v["polymerase"]} μL（高保真酶，如 Phusion/Q5）',
            'dNTP_mix': f'{v["dNTP"]} μL（10 mM each）',
            'buffer': f'{v["buffer"]} μL（含 Mg²⁺）',
            'water': f'补至 {v["total"]} μL',
        },
        'pcr_program': {
            'initial_denaturation': '98°C, 30s',
            'cycles': [
                {'step': '变性', 'temp': '98°C', 'time': '10s'},
                {'step': '退火', 'temp': f'{anneal_temp}°C', 'time': '30s'},
                {'step': '延伸', 'temp': '72°C', 'time': f'{ext_time}s'},
            ],
            'n_cycles': 30,
            'final_extension': '72°C, 5min',
            'hold': '4°C, ∞',
        },
        'expected_product': {
            'size_bp': product_size,
            'left_primer': left_seq,
            'right_primer': right_seq,
            'left_tm': left_tm,
            'right_tm': right_tm,
            'anneal_temp': anneal_temp,
        },
        'quality_control': [
            '跑 1% 琼脂糖凝胶电泳验证产物大小',
            '切胶回收目标条带',
            '测序验证（Sanger）',
        ],
        'notes': [
            '退火温度 = min(Tm) - 3°C，若非特异性条带多可提高 2-3°C',
            '高保真酶（Phusion/Q5）保真度 >100× Taq，适合克隆',
            '若产物 >3kb，延伸时间按 1kb/min 递增',
        ],
    }


def _design_gibson(data, host, scale):
    """Gibson 组装方案。"""
    backbone = data.get('backbone', {})
    inserts = data.get('inserts', data.get('fragments', []))
    overlap = data.get('overlap', 20)

    if not inserts:
        return {'error': '需要 inserts 参数（来自 bio_clone_simulate 输出）'}

    # 等摩尔比的质量比换算（Layer 1 事实计算）：质量比 = 长度比。
    # backbone/inserts 可传 str（序列）或 dict({sequence})，取不到序列时长度记 None。
    def _seq_len(frag):
        if isinstance(frag, str):
            return len(frag.replace(' ', '').strip())
        if isinstance(frag, dict):
            s = frag.get('sequence') or ''
            return len(s) if s else frag.get('length')
        return None

    bb_len = _seq_len(backbone) if backbone else None
    ins_lens = [_seq_len(f) for f in inserts]
    known = [L for L in ([bb_len] + ins_lens) if isinstance(L, int) and L > 0]
    molar_mix = None
    if len(known) == 1 + len(ins_lens) and all(isinstance(L, int) for L in [bb_len] + ins_lens):
        base = bb_len
        ratios = [round(L / base, 2) for L in ins_lens]
        molar_mix = {
            'basis': '等摩尔比 → 质量比 = 片段长度比（以载体为 1）',
            'backbone_ratio': 1.0,
            'insert_mass_ratios': ratios,
            'note': f'载体 {base}bp 时，各插入片段按质量的 {ratios} 倍加入（相对载体量）',
        }

    n_fragments = len(inserts) + 1  # backbone + inserts
    # Gibson 反应体系
    volumes = {
        'small': {'total': 10, 'backbone': 1, 'insert_each': 1, 'master_mix': 5},
        'medium': {'total': 20, 'backbone': 2, 'insert_each': 2, 'master_mix': 10},
    }
    v = volumes.get(scale, volumes['small'])

    result = {
        'protocol_type': 'gibson_assembly',
        'reagents': {
            'backbone': f'{v["backbone"]} μL（~50 ng）',
            'inserts': [f'Insert {i+1}: {v["insert_each"]} μL（等摩尔比）' for i in range(len(inserts))],
            'gibson_master_mix': f'{v["master_mix"]} μL（NEB E2611 或自制）',
            'water': f'补至 {v["total"]} μL',
        },
        'reaction_conditions': {
            'temperature': '50°C',
            'time': '15-60 min（片段数 ≤3 用 15min，>3 用 60min）',
            'hold': '4°C 或 -20°C',
        },
        'overlap_design': {
            'overlap_length': f'{overlap} bp',
            'in_range': 15 <= int(overlap or 0) <= 40,
            'note': '每个片段两端需有 15-40bp 同源臂（与相邻片段重叠）',
        },
        'transformation': {
            'method': '化学转化或电转化',
            'competent_cells': 'DH5α 或 NEB Stable',
            'selection': '根据载体抗性标记选择（如 AmpR/KanR）',
            'plating': '涂板，37°C 过夜培养',
        },
        'quality_control': [
            '挑 3-5 个克隆做菌落 PCR 验证',
            '阳性克隆提质粒，Sanger 测序验证连接位点',
            '测序引物设计在连接位点两侧各 100bp',
        ],
        'notes': [
            '片段等摩尔比混合（质量比 = 片段大小比）',
            'Gibson 组装效率随片段数增加而下降，>5 片段建议分步组装',
            "线性化载体末端避免有 3' 突出（外切酶活性会降解）",
        ],
    }
    if molar_mix:
        result['molar_to_mass'] = molar_mix
    else:
        result['notes'].append('未提供全部片段长度——等摩尔比的质量换算需各片段 bp 数（agent 可向上游 bio_clone_simulate 输出回查）')
    return result


def _design_golden_gate(data, host, scale):
    """Golden Gate 组装方案。"""
    inserts = data.get('inserts', data.get('fragments', []))
    enzyme = data.get('enzyme', 'BsaI')
    overhangs = data.get('overhangs', [])

    if not inserts:
        return {'error': '需要 inserts 参数'}

    return {
        'protocol_type': 'golden_gate',
        'reagents': {
            'backbone': '50 ng（已线性化，含 BsaI 位点）',
            'inserts': [f'Insert {i+1}: 等摩尔比' for i in range(len(inserts))],
            'restriction_enzyme': f'{enzyme}（10-20 U）',
            'ligase': 'T4 DNA Ligase（400 U）',
            'buffer': '10× T4 Ligase Buffer（含 ATP）',
            'water': '补至 20 μL',
        },
        'reaction_conditions': {
            'cycles': [
                {'step': '酶切', 'temp': '37°C', 'time': '5 min'},
                {'step': '连接', 'temp': '16°C', 'time': '5 min'},
            ],
            'n_cycles': 25,
            'final_digest': '50°C, 10 min（彻底切掉残留环状载体）',
            'hold': '80°C, 20 min（热失活）',
        },
        'overhang_design': {
            'enzyme': enzyme,
            'overhang_length': '4 bp',
            'note': '每个片段两端需有 BsaI 识别位点（GGTCTC）+ 4bp 粘性末端',
        },
        'quality_control': [
            '转化后挑克隆做菌落 PCR',
            '阳性克隆测序验证',
        ],
        'notes': [
            'Golden Gate 效率极高（>95% 正确克隆），适合多片段组装',
            '片段内部不能有 BsaI 位点（需同义突变消除）',
            '4bp 粘性末端需唯一，避免片段错误连接',
        ],
    }


def _design_restriction_cloning(data, host, scale):
    """限制酶克隆方案。"""
    backbone = data.get('backbone', {})
    insert = data.get('insert', {})
    enzymes = data.get('enzymes', data.get('restriction_enzymes', []))

    if not enzymes:
        return {'error': '需要 enzymes 参数（限制酶名称）'}

    return {
        'protocol_type': 'restriction_cloning',
        'reagents': {
            'backbone': '1-2 μg',
            'insert': '等摩尔比（质量比 = 插入片段大小/载体大小）',
            'restriction_enzymes': [f'{e}: 10-20 U' for e in enzymes],
            'buffer': '对应酶的推荐 buffer（双酶切用兼容 buffer）',
            'BSA': '1 μL（100×，若酶需要）',
            'water': '补至 50 μL',
        },
        'reaction_conditions': {
            'digestion': '37°C, 1-4 h（或 37°C 过夜）',
            'heat_inactivation': '65-80°C, 20 min（查酶的热失活温度）',
        },
        'workflow': [
            '1. 双酶切载体和插入片段',
            '2. 跑胶回收线性化载体和插入片段',
            '3. T4 DNA Ligase 连接（16°C 过夜或室温 2h）',
            '4. 转化感受态细胞',
            '5. 涂板筛选',
        ],
        'quality_control': [
            '菌落 PCR 验证',
            '提质粒 + 双酶切验证',
            'Sanger 测序',
        ],
        'notes': [
            '双酶切需选兼容 buffer（查 NEB Double Digest Finder）',
            '若两酶切位点间距 <6bp，先切后回收再切第二个',
            'CIP/SAP 处理线性化载体防自连',
        ],
    }


def _design_crispr_editing(data, host, scale):
    """CRISPR 编辑方案：从 sgRNA 设计结果生成完整实验方案。"""
    guides = data.get('guides', data.get('recommendations', []))
    cas = data.get('cas', 'SpCas9')
    target_gene = data.get('target_gene', '目标基因')

    if not guides:
        return {'error': '需要 guides 参数（来自 bio_crispr_guide 输出）'}

    best = guides[0] if isinstance(guides, list) else guides
    guide_seq = best.get('guide_sequence', '')
    pam = best.get('pam', 'NGG')
    eff_score = best.get('efficiency_score', 0)

    return {
        'protocol_type': 'crispr_editing',
        'target': {
            'gene': target_gene,
            'guide_sequence': guide_seq,
            'pam': pam,
            'efficiency_score': eff_score,
        },
        'oligo_design': {
            'forward_oligo': f'5\'-CACC{guide_seq}-3\'',
            'reverse_oligo': f'5\'-AAAC{guide_seq[::-1].translate(str.maketrans("ACGT", "TGCA"))}-3\'',
            'note': '退火后克隆到 pX459（BbsI 位点）',
        },
        'cloning_protocol': [
            '1. 退火：正反 oligo 各 100 μM，95°C 5min → 慢冷至室温',
            '2. 连接：退火产物 1 μL + pX459 线性化载体 50 ng + T4 Ligase',
            '3. 转化 DH5α，Amp 筛选',
            '4. 测序验证插入',
        ],
        'transfection': {
            'cell_line': 'HEK293T 或目标细胞系',
            'method': '脂质体转染（Lipofectamine 3000）或电穿孔',
            'plasmid_amount': '1-2 μg',
            'selection': 'Puromycin（2 μg/mL, 48h 后开始）',
        },
        'verification': [
            '1. 提基因组 DNA',
            '2. 设计目标位点两侧引物（产物 300-800bp）',
            '3. PCR 扩增目标区域',
            '4. Sanger 测序 → 用 bio_crispr_verify 分析 indel',
            '5. T7E1 酶切验证（可选，检测异源双链）',
        ],
        'notes': [
            f'guide 效率分 {eff_score}（0-100），>60 通常有效',
            '建议同时设计 2-3 条 guide，选效率最高的',
            '脱靶验证：用 Cas-OFFinder 检查全基因组脱靶位点',
            '若做敲入（HDR），需共转 donor 模板 + Cas9 RNP',
        ],
    }


def _design_strain_construction(data, host, scale):
    """菌株构建方案：从代谢工程预测结果生成菌株改造方案。"""
    knockouts = data.get('knockouts', data.get('recommended_knockouts', []))
    target_reaction = data.get('target_reaction', '')
    host_organism = data.get('host_organism', host)

    if not knockouts:
        # 不硬报错：明确引导 agent 该 protocol_type 的预期搭配，并建议更合适的类型
        return {
            'protocol_type': 'strain_construction',
            'status': 'guidance',
            'guidance': (
                'strain_construction 预期搭配基因敲除方案使用：input_data 应包含 knockouts / '
                'recommended_knockouts（来自 bio_gene_knockout analysis_type=optknock 的输出）。'
                '当前 input_data 未提供敲除清单。'
            ),
            'how_to_fix': [
                '若目标是代谢工程敲除增产：先用 bio_gene_knockout analysis_type=optknock '
                '（target_reaction 指定产物外泌反应）得到 recommended_knockouts，再回本工具。',
                '若场景是非敲除（过表达/异源表达/质粒导入）：请改用更合适的 protocol_type——'
                'transformation（质粒转化宿主）、crispr_editing（CRISPR 敲入/定点编辑）、'
                'gibson_assembly / golden_gate / restriction_cloning（先构建表达载体再 transformation）。',
            ],
            'recommended_protocol_types': {
                '过表达/异源表达（质粒导入）': 'transformation',
                'CRISPR 敲入/定点编辑': 'crispr_editing',
                '敲除增产（先跑 optknock）': 'strain_construction（带 knockouts 重试）',
            },
        }

    return {
        'protocol_type': 'strain_construction',
        'design': {
            'host': host_organism,
            'target_reaction': target_reaction,
            'knockout_genes': knockouts,
            'n_knockouts': len(knockouts),
        },
        'strategy': 'CRISPR-Cas9 多基因连续敲除' if len(knockouts) > 1 else 'CRISPR-Cas9 单基因敲除',
        'workflow': [
            f'1. 设计靶向 {", ".join(knockouts)} 的 sgRNA（用 bio_crispr_guide）',
            '2. 构建 pX459-sgRNA 质粒',
            '3. 转化宿主菌，Puromycin 筛选',
            '4. 提基因组 DNA，PCR + 测序验证敲除',
            '5. 若多基因敲除：在已验证的敲除株上重复步骤 1-4',
        ],
        'verification': [
            '每个敲除位点：PCR 扩增 + Sanger 测序',
            '生长曲线测定（验证生长率是否符合预测）',
            f'目标产物（{target_reaction}）定量检测（HPLC/GC-MS）',
        ],
        'notes': [
            '连续敲除比同时敲除更稳定',
            '每步敲除后做生长曲线，确认生长率符合预测',
            '最终菌株做发酵验证（摇瓶 → 生物反应器）',
        ],
    }


def _design_transformation(data, host, scale):
    """转化方案。"""
    method = data.get('method', 'chemical')  # chemical / electroporation
    plasmid = data.get('plasmid', {})
    selection = data.get('selection', 'AmpR')

    return {
        'protocol_type': 'transformation',
        'method': method,
        'competent_cells': 'DH5α（克隆）或 BL21（表达）' if method == 'chemical' else '电转化感受态',
        'protocol': {
            'chemical': [
                '1. 取 50 μL 感受态细胞，冰上解冻',
                '2. 加 1-5 μL 质粒 DNA（1-100 ng），轻弹混匀',
                '3. 冰上 30 min',
                '4. 42°C 热激 45-90s',
                '5. 立即冰上 2 min',
                '6. 加 950 μL SOC 培养基，37°C 摇菌 1h',
                '7. 涂板（含对应抗生素），37°C 过夜',
            ],
            'electroporation': [
                '1. 取 50 μL 电转化感受态细胞，冰上解冻',
                '2. 加 1-2 μL 质粒 DNA（10-100 ng）',
                '3. 转入预冷电击杯',
                '4. 电穿孔（1.8 kV, 25 μF, 200 Ω）',
                '5. 立即加 950 μL SOC，37°C 摇菌 1h',
                '6. 涂板筛选',
            ],
        },
        'selection': f'抗生素筛选：{selection}',
        'notes': [
            '化学转化效率 10⁶-10⁸ CFU/μg，电转化 10⁹-10¹⁰ CFU/μg',
            '大质粒（>10kb）用电转化效率更高',
            '连接产物直接转化时，先用乙醇沉淀浓缩',
        ],
    }
