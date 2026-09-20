"""dsh-bio-genie — 序列文本规范化（跨模块共享）。

提取原因（2026-09-11 打磨）：`_clean_seq` 此前在 crispr_tools.py / synbio_tools.py /
syncheck_tools.py 各有一份**逐字相同**的实现（`''.join(str(seq).upper().split())`）。
三份重复意味着语义一旦调整（例如支持保留内部空白、或报警非法字符）就得改三处、
且极易漏改。现集中到本模块。

命名：本模块的 `clean_seq` 是跨模块公开 API，故不带下划线前缀。
"""


def clean_seq(seq):
    """规范化序列文本：去空白 + 转大写。非字符串输入先 str() 化。"""
    return ''.join(str(seq).upper().split())
