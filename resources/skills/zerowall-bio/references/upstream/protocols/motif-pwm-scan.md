---
name: bio-proto-motif-pwm-scan
domain: motif
inputs: [目标序列 + motif/PWM（或 motif 比对）]
outputs: [扫描命中的位置与打分]
requires_network: false
language: python
---

# Motif / PWM 扫描协议

**适用场景**：转录因子结合位点扫描、蛋白质 motif 搜索、MEME/JASPAR 输出解析后在目标序列上定位。

## 步骤

1. 从 motif 序列集合构建 PWM（`Bio.motifs`）
2. 加伪计数归一化成 PSSM
3. 在目标序列上滑动扫描，按阈值收集命中

## 可执行模板（bio_python）

```python
from Bio import motifs
from Bio.Seq import Seq

instances = [Seq("TATAA"), Seq("TATTA"), Seq("TAAAA"), Seq("TATAT")]
m = motifs.create(instances)
pwm = m.counts.normalize(pseudocounts=0.5)     # 加伪计数防零概率
pssm = pwm.log_odds()

target = Seq("CGTATAACGTTATATGC")               # 换成实际序列
threshold = 4.0                                 # 按需调整
hits = []
for pos, score in pssm.search(target, threshold=threshold):
    hits.append({"pos": pos, "score": round(score, 2),
                 "seq": str(target[pos:pos + pwm.length])})
print(json.dumps({"pwm_consensus": m.consensus, "hits": hits}, ensure_ascii=False, indent=2))
```

## 解析 MEME 输出变体

```python
with open("meme.xml") as f:
    record = motifs.parse(f, "meme")
for m in record[:2]:
    print("motif:", m.consensus)
    for pos, score in m.pssm.search(target, threshold=4.0):
        print("  hit at", pos, score)
```

## 常见坑

- 未加 pseudocounts 时零频列会导致对数概率 -∞，扫描全灭
- `pssm.search` 返回生成器，直接迭代即可
- JASPAR 格式用 `motifs.parse(f, "jaspar")`；扫描前先 `len(motif)` 检查长度
- 阈值高低决定假阳性率：默认先看 score 分布再定阈值

## 解读要点

- 命中的生物学意义要结合 motif 来源（TF 家族数据库）
- 启动子区扫描建议同时看正负链（`pssm.search` 只扫给定链，负链扫 `reverse_complement`）
