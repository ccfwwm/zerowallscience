"""dsh-bio-genie — 序列文本规范化与参数输入解析（跨模块共享）。

- `clean_seq`：去空白 + 转大写（历史 API，保持）。
- `read_text_input`：文本参数 = 内容本身 或 文件路径（读取文件原文）。
- `read_seq_input`：序列参数 = 内容本身 或 文件路径（FASTA / GenBank / 纯文本 → 去空白序列）。

背景（2026-10-04 实测）：agent 自然地把「FASTA 文件路径」传给
bio_seq_analyze / bio_primer3_design 等工具的 sequence 参数，此前被当作字面序列
解析（报 `Codon 'LAC' is invalid`、`模板太短（21 bp）` 等底层怪错误）；且旧
analysis_ext._read_text_arg 读 FASTA 时会把 header 里恰好是 a/c/g/t 的字母混入序列。
本模块统一处理，规则：
  ① 输入命中「存在的文件路径」→ 读文件并解析（FASTA 单记录 / GenBank 单记录 / 纯文本）；
  ② 「像路径但不存在」→ 明确报错（绝不退化成把路径当序列的底层错误）；
  ③ 多记录文件 → fail-closed 报错（防静默分析错对象）。

命名：`clean_seq` / `read_text_input` / `read_seq_input` 为跨模块公开 API，无下划线前缀。
"""

import os

_SEQ_FILE_EXTS = ('.fasta', '.fa', '.fna', '.fas', '.ffn', '.faa', '.frn',
                  '.seq', '.txt')
_GB_FILE_EXTS = ('.gb', '.gbk', '.genbank', '.gbff')


def clean_seq(seq):
    """规范化序列文本：去空白 + 转大写。非字符串输入先 str() 化。"""
    return ''.join(str(seq).upper().split())


def _looks_like_path(v):
    """保守判定字符串是否「像文件路径」。序列字符集（IUPAC 字母/连接符）不含
    `/` `\\` 与点号扩展名模式，故路径判定对合法序列近乎零误伤。"""
    if len(v) >= 512 or '\n' in v or '\r' in v:
        return False
    if os.path.exists(v):
        return True
    if '/' in v or '\\' in v:
        return True
    low = v.lower()
    return low.endswith(_SEQ_FILE_EXTS + _GB_FILE_EXTS)


def _read_file_text(path, what):
    if os.path.isdir(path):
        raise ValueError(f'{what} 指向的是目录而不是文件：{path}')
    try:
        with open(path, encoding='utf-8', errors='replace') as fh:
            return fh.read()
    except OSError as exc:
        raise ValueError(f'{what} 文件读取失败：{path}（{exc}）') from exc


def read_text_input(value, what='input'):
    """文本参数解析：内容本身 或 文件路径。返回文本（文件读全文；内容原样）。"""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{what} 不能为空')
    v = value.strip()
    if not _looks_like_path(v):
        return value
    if not os.path.exists(v):
        raise ValueError(
            f'{what} 看起来是文件路径但文件不存在：{v}'
            f'（相对路径基于当前工作目录；或直接传入内容）')
    return _read_file_text(v, what)


def read_seq_input(value, what='sequence'):
    """序列参数解析：内容本身 或 文件路径（FASTA/GenBank/纯文本）。返回去空白序列。"""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{what} 不能为空')
    v = value.strip()
    if not _looks_like_path(v):
        return ''.join(v.split())

    if not os.path.exists(v):
        raise ValueError(
            f'{what} 看起来是文件路径但文件不存在：{v}'
            f'（相对路径基于当前工作目录；或直接传入序列内容）')
    text = _read_file_text(v, what)
    stripped = text.lstrip('\ufeff \t\r\n')

    if stripped.startswith('>'):
        records = _parse_fasta(text)
        if not records:
            raise ValueError(f'{what}：文件 {v} 中没有解析到 FASTA 序列内容')
        if len(records) > 1:
            labels = '、'.join((h[:24] or '(无标题)') for h, _ in records[:3])
            extra = '…' if len(records) > 3 else ''
            raise ValueError(
                f'{what}：文件 {v} 含 {len(records)} 条 FASTA 记录'
                f'（{labels}{extra}），单序列分析需要恰好 1 条——'
                f'请拆分文件，或先用 bio_seq_io_read 读取后传入目标序列')
        header, seq = records[0]
        seq = ''.join(seq.split())
        if not seq:
            raise ValueError(f'{what}：文件 {v} 的记录「{header[:40]}」不含序列内容')
        return seq

    if stripped[:5].upper() == 'LOCUS':
        from io import StringIO
        from Bio import SeqIO
        try:
            records = list(SeqIO.parse(StringIO(text), 'genbank'))
        except Exception as exc:
            raise ValueError(
                f'{what}：文件 {v} 不是有效的 GenBank 格式（{exc}）') from exc
        if len(records) > 1:
            raise ValueError(
                f'{what}：文件 {v} 含 {len(records)} 条 GenBank 记录，'
                f'单序列分析需要恰好 1 条——请拆分文件或先用 bio_seq_io_read 读取')
        if not records:
            raise ValueError(f'{what}：文件 {v} 中没有解析到 GenBank 记录')
        return str(records[0].seq)

    seq = ''.join(text.split())
    if not seq:
        raise ValueError(f'{what}：文件 {v} 为空')
    return seq


def _parse_fasta(text):
    """极简 FASTA 解析：返回 [(header, seq), ...]（保留原始大小写，去行内空白）。"""
    records = []
    header = None
    chunks = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('>'):
            if header is not None or chunks:
                records.append((header or '', ''.join(chunks)))
            header = line[1:].strip()
            chunks = []
        else:
            chunks.append(line)
    if header is not None or chunks:
        records.append((header or '', ''.join(chunks)))
    return records
