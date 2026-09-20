---
name: bio-proto-coords
domain: genome-analysis
inputs: [基因组区间/变异坐标描述]
outputs: [坐标转换/一致性检查结果]
requires_network: false
language: python
---

# 基因组坐标系统协议

**适用场景**：坐标跨格式/工具/组装版本转换、变异表示一致性检查、BED/GFF/VCF 之间的区间换算、"off-by-one" 排查。吸收自 K-Dense `genomic-coordinates` skill（知识层，脚本零第三方依赖）。

## 核心规则：两种坐标系

| 坐标系 | 定义 | 谁在用 |
|---|---|---|
| **0-based 半开区间** [start, end) | start 含、end 不含；区间长度 = end − start | BED、SAM/BAM、PSL、VCF 的 POS（1-based 单点）、Python 切片、UCSC |
| **1-based 闭区间** [start, end] | 两端都含；区间长度 = end − start + 1 | GFF/GTF、GFF3、Ensembl、GenBank、HGVS、大多数生物学家直觉 |

**换算公式**（同一区间两种表示）：
- `0-based half-open [a, b)` ↔ `1-based inclusive [a+1, b]`
- 例：`chr1:100-200`（1-based 闭） = BED `chr1 99 200`（0-based 半开）

**Off-by-one 是坐标类 bug 的头号来源**——不同格式之间搬运坐标必须先确认坐标系，绝不直接拼接。

## 常见格式坐标约定

| 格式 | 坐标 | 备注 |
|---|---|---|
| BED | 0-based 半开 | 起始含，终止不含 |
| GFF/GTF | 1-based 闭 | 两端含 |
| VCF POS | 1-based 单点 | REF 第一个碱基的位置 |
| SAM/BAM POS | 1-based 单点（比对起点） | CIGAR 操作相对 |
| PSL | 0-based 半开（qStart/qEnd） | 与 BED 相同 |
| WIG/bigWig | 1-based（variableStep）或 BED 式（bedGraph 0-based 半开） | 两种子格式不同，小心 |
| HGVS | 1-based（c./g.） | 内含 intron 偏移（c. 编码区坐标） |

## 组装版本与参考基因组

- GRCh37/hg19、GRCh38/hg38、T2T-CHM13 是不同组装——**坐标混用必然出错**。检查方式：
  - 染色体命名差异：GRCh38 无 chr 前缀可用（`chr1` vs `1`），GRCh37 通常带 `chr`。
  - GRCh38 补齐了 alternate loci/centromere，部分区间跨版本移位。
- 换版本需要 **liftover**（UCSC liftOver + chain 文件，外部工具）——插件不内置，遇到需求如实说明，可用 `bio_python` 提示用户提供 chain 或改用 API。
- Ensembl `bio_ref_genome` 返回的染色体长度是 GRCh38 参考——做区间合法性检查时用它比对。

## 变异归一化（左对齐）

同一个 indel 在参考序列上有多种等价表示，比较/去重前必须**左对齐归一化**：

```python
def left_align(ref: str, pos: int, alt: str) -> tuple[int, str, str]:
    """VCF 风格左对齐：pos 为 1-based。重复序列区 indels 的规范化表示。"""
    # 1. 去掉 REF/ALT 共同的右端后缀
    while len(ref) > 1 and len(alt) > 1 and ref[-1] == alt[-1]:
        ref, alt = ref[:-1], alt[:-1]
    # 2. 若 REF 首碱基与 ALT 首碱基相同，右移一个重复单元（滑到最左）
    while len(ref) > 1 and len(alt) > 1 and ref[0] == alt[0]:
        ref, alt = ref[1:], alt[1:]
        pos += 1
    return pos, ref, alt

# 例：ref 序列 "CACA" 中删除一个 CA：
#   表示 A: 1-based pos=1, ref='CA',  alt='C'
#   表示 B: 1-based pos=3, ref='CA',  alt='C'
# left_align('CA', 3, 'C') → (1, 'CA', 'C')  ← 两表示归一后一致
```

## 区间关系运算（纯 Python，0-based 半开）

```python
def overlap(a: tuple[int, int], b: tuple[int, int]) -> int:
    """两个 0-based 半开区间 [s,e) 的重叠长度；无重叠返回 0。"""
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))

def merge(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """合并重叠/相邻的 0-based 半开区间（按 start 排序）。"""
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out

def complement(ivs: list[tuple[int, int]], total_len: int) -> list[tuple[int, int]]:
    """给定区间列表在 [0, total_len) 上的补集（找无覆盖区域）。"""
    cur, comp = 0, []
    for s, e in merge(ivs):
        if s > cur:
            comp.append((cur, s))
        cur = max(cur, e)
    if cur < total_len:
        comp.append((cur, total_len))
    return comp
```

大规模区间运算（成百上千区间）建议用 `bio_python` 里 pandas 的 `pd.IntervalIndex` 或提示使用 bedtools/polars-bio（外部/重依赖，插件不内置）。

## 转录本/CDS/蛋白坐标映射

- 基因组坐标 → 转录本坐标：减转录起始（注意链方向——负链要反向）。
- 转录本坐标 → CDS：减 5'UTR 长度（c.1 = CDS 第一个碱基；上游为 c.-1 等）。
- CDS 坐标 → 蛋白：`(c.pos − 1) // 3 + 1` 取整——插入/缺失含相位（frame）概念。
- 交叉格式核对时优先用 HGVS（1-based、含链信息）作为权威表示。

## 审计清单（搬坐标前过一遍）

1. 源和目标的坐标系各是什么？（0-based 半开 vs 1-based 闭 vs 1-based 单点）
2. 染色体命名一致吗？（chr 前缀、M vs MT、染色体顺序）
3. 组装版本一致吗？（GRCh37 vs GRCh38 vs T2T）
4. indel 是否左对齐归一化了？
5. 区间两端是否在参考序列长度内？（用 `bio_ref_genome` 的染色体长度核对）
6. 负链基因的坐标方向是否正确？（BED 总是按参考正链写，基因在负链时区间端点仍按参考坐标升序）

## 常见坑

- BED 的 end 是**不含**的：区间长度 = end − start；GFF 的 end 是**含**的：长度 = end − start + 1。
- VCF 的 END INFO（1-based 闭）与 BED 直接互换是错的（差 1）。
- 比对回贴后同一区域在不同工具间差 1bp，先查坐标系再怀疑算法。
- GRCh38 染色体名无 chr 前缀的工具（如部分 Ensembl 输出）与有前缀工具混用会静默失败（全部区间找不到）。
