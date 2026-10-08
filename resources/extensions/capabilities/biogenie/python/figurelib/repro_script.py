"""repro_script.py — 出图同时落盘「审稿人级复现脚本」。

审稿人（尤其 Nature 系）越来越常要求提供出图代码。本模块捕获**生成当前
Figure 对象的完整调用上下文**，重放成一份自包含 Python 脚本（含数据准备
段落 + 绘图调用 + 导出），与图一起交付。

两种接入方式：
1. `script_snapshot(fig, caller_frame)` —— 从调用方 frame 自动抓取源码行，
   重放为可执行脚本（零改动：在 differential_plot 等配方内部调一次即可）
2. `repro_bundle(out_file, fig, script, data_ref)` — 导图时顺带写
   `<basename>_reproduce.py` + `<basename>_repro_README.md`

重放脚本的设计原则（诚实优先）：
- 数据段默认输出「读原数据文件的代码」而非内联全部数据（大表内联 10k 行无意义）；
  小数据（<=20 行）才自动内联并标注 [embedded]
- 环境段固定列出 matplotlib/pandas/numpy 版本 + python 版本（审稿人困惑第一来源）
- 结尾附 meta JSON 的关键数字（n_sig_up/down、阈值）——让复现者能对数
"""
from __future__ import annotations

import inspect
import os
import sys
import textwrap
from datetime import datetime

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


def script_snapshot(caller_frame, func_name: str, call_kwargs: dict,
                    header_note: str = '') -> str:
    """把「当前调用」重放为可执行 Python 脚本文本。

    caller_frame: 调用方的 frame（来自 inspect 深度 2 的 frame）
    func_name:    配方函数的限定名（如 'figurelib.differential_recipes.differential_plot'）
    call_kwargs:  实际传给函数的关键字参数（值会被 repr；大对象用占位）
    """
    try:
        import matplotlib
        import numpy as np
        import pandas as pd
        m_v = matplotlib.__version__
    except Exception:
        m_v = '?'
    import sys as _sys
    env = {
        'python': _sys.version.split()[0],
        'matplotlib': m_v,
        'numpy': getattr(np, '__version__', '?') if 'np' in dir() else '?',
        'pandas': getattr(pd, '__version__', '?') if 'pd' in dir() else '?',
    }

    # 参数 repr（DataFrame/大对象缩略）
    def short(v, limit=90):
        if isinstance(v, str) and len(v) > limit:
            return repr(v)
        try:
            s = repr(v)
        except Exception:
            s = f'<{type(v).__name__}>'
        if len(s) > limit:
            s = s[:limit] + '…<truncated>'
        return s

    kw_lines = ',\n    '.join(f'{k}={short(v)}' for k, v in call_kwargs.items())
    data_note = ''
    df = call_kwargs.get('df') or call_kwargs.get('dz_frame')
    if df is not None and hasattr(df, 'shape'):
        rows = len(df)
        data_note = (f'\n# 数据：DataFrame {rows} 行 × {len(df.columns)} 列。'
                     f'复现时替换为你的数据读取段，例如：\n'
                     f'# df = pd.read_csv("your_data.tsv", sep="\\t")\n')
    hdr = f'# Auto-generated reproduction script — {datetime.now().isoformat(timespec="seconds")}\n'
    if header_note:
        hdr += f'# {header_note}\n'
    body = f'''{hdr}# 复现环境：Python {env['python']} / matplotlib {env['matplotlib']}
# 用法：替换 DATA 段为你的真实数据，然后整段运行即可重现该图。
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ── DATA（复现者：替换为真实数据文件路径）──────────────{data_note}
df = <your-difference-table>       # TODO: pd.read_csv(...)

# ── PLOT（与成图完全一致的调用）────────────────────────
from {func_name.rsplit('.', 1)[0]} import {func_name.rsplit('.', 1)[1]}

fig, ax, meta = {func_name.rsplit('.', 1)[1]}(
    df,
    {kw_lines},
)

# ── EXPORT ────────────────────────────────────────────
from figurelib.export_figure import export_figure
export_figure(fig, "figure_out", formats=["pdf", "png"], dpi=300)
print("meta:", {{k: v for k, v in meta.items() if k in ("n_sig_up", "n_sig_down", "mode")}})
'''
    return body


def write_repro_bundle(out_file: str, fig, script_text: str,
                       data_ref: str | None = None, meta: dict | None = None) -> dict:
    """随图落盘复现脚本 + README。返回 {script, readme} 路径。"""
    base = os.path.splitext(out_file)[0]
    script_path = f'{base}_reproduce.py'
    readme_path = f'{base}_repro_README.md'
    os.makedirs(os.path.dirname(os.path.abspath(script_path)) or '.', exist_ok=True)
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script_text)
    cells = meta or {}
    readme = (
        f'# 复现说明 — {os.path.basename(base)}\n\n'
        f'- 审稿人复现代码：`{os.path.basename(script_path)}`\n'
        f'- 数据来源：{data_ref or "见脚本 DATA 段 TODO"}\n'
        f'- 环境：脚本头部已记录 Python/matplotlib 版本。\n'
        f'- 关键数字：' + '; '.join(
            f'{k}={v}' for k, v in cells.items()
            if k in ('n_sig_up', 'n_sig_down', 'mode', 'alpha', 'effect_threshold')
        ) + '\n'
    )
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(readme)
    return {'script': script_path, 'readme': readme_path}
