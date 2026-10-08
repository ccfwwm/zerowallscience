"""fig_lint.py — Figure Linter（发表语义静态检查，FIG 级规则）。

与 check_figure.py 的分工：
- check_figure  : 文件级（落盘后的输出物：DPI/格式/字体嵌入/尺寸）——投稿前审计
- fig_lint      : 图形级（仍持有 Figure 对象/色板信息时）：配色语义、排印层级、
                  红绿对、rainbow、色相数、灰度可辨、CVD 退化——出图时审计

规则编号沿用 FIG0xx 约定（与 check_figure 的输出融合后统一编号）：
- FIG001 任意文本 < 5 pt（Nature 最低可读字号）
- FIG003 categorical 序列含 红绿对（red-green pair）作为唯一直接区分
- FIG004 使用了 rainbow/jet 类 colormap
- FIG005 >8 个 categorical hue（禁止纯色相编码身份）
- FIG006 缺 panel letter（多面板时）
- FIG007 轴标签无单位（变量带单位却只写了变量名）
- FIG008 误差棒无语义定义（存疑，需要 app 显式提供 err_semantics）
- FIG011 文本被栅格化（rasterized=True 的 Text 对象）
- FIG015 灰度模拟下关键类别坍缩（luminance 差 < 8/255）
"""

from __future__ import annotations

from typing import Any

# Okabe-Ito 8 色的 RGB（Okabe-Ito 是 CVD-safe 基准色板）
_OKABE_ITO_RGB = [
    (230, 159, 0),    # orange
    (86, 180, 233),   # sky blue
    (0, 158, 115),    # bluish green
    (240, 228, 66),   # yellow
    (0, 114, 178),    # blue
    (213, 94, 0),     # vermillion
    (204, 121, 167),  # reddish purple
    (0, 0, 0),        # black
]

# 常见 rainbow/jet 家族（rainbow scale 是 Nature 明令禁止的）
_RAINBOW_CMAPS = {
    'jet', 'rainbow', 'hsv', 'nipy_spectral', 'gist_ncar', 'brg',
    'turbo', 'gist_rainbow', 'spectral', 'prism', 'flag',
}

# 用于检测红/绿对的色相区间（HSL hue 度数）
_RED_HUES = (345, 360) + (0, 15)      # 经典红 HSL
_GREEN_HUES = (90, 150)              # 经典绿 HSL


def _hex_to_rgb(hexcolor: str) -> tuple[float, float, float] | None:
    """'#RRGGBB' → (r,g,b) ∈ [0,1]。解析失败返回 None。"""
    h = hexcolor.strip()
    if not h.startswith('#') or len(h) != 7:
        return None
    try:
        return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    except ValueError:
        return None


def _rgb_to_hue(r: float, g: float, b: float) -> tuple[float, float, float, float]:
    """RGB → (H_deg, S, L)。H∈[0,360)。"""
    import colorsys
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s, l


def _relative_luminance(rgb: tuple[float, float, float]) -> float:
    """WCAG 2.x 相对亮度。"""
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _grayscale_luminances(colors: list[str]) -> list[float]:
    """每个颜色的灰度亮度，用于灰度可辨性检查。"""
    out = []
    for c in colors:
        rgb = _hex_to_rgb(c)
        if rgb is None:
            continue
        out.append(_relative_luminance(rgb))
    return out


def _min_luminance_diff(lums: list[float]) -> float:
    """两两最小亮度差（灰度可辨性代理量）。"""
    lums = sorted(set(lums))
    if len(lums) < 2:
        return 1.0
    return min(lums[i + 1] - lums[i] for i in range(len(lums) - 1))


def _has_red_green_pair(colors: list[str]) -> tuple[bool, str, str]:
    """categorical palette 里是否含有「红 vs 绿」的强对比对（例试图当双类区分）。"""
    red = None
    green = None
    for c in colors:
        rgb = _hex_to_rgb(c)
        if rgb is None:
            continue
        h, s, l = _rgb_to_hue(*rgb)
        if s > 0.3 and l > 0.1:  # 有饱和度才算「色相」
            if (_RED_HUES[0] <= h <= _RED_HUES[1]) or (_RED_HUES[2] <= h <= _RED_HUES[3]):
                if red is None:
                    red = c
            elif _GREEN_HUES[0] <= h <= _GREEN_HUES[1]:
                if green is None:
                    green = c
    if red and green:
        return True, red, green
    return False, '', ''


def lint_figure_colors(colors_used: list[str], n_categorical: int | None = None,
                       cmap_used: str | None = None) -> list[tuple[str, str]]:
    """color_lint：给定图里实际用到的颜色列表，出版语义审计。

    colors_used: 图里所有 categorical 颜色（hex/'r'/'g' 等别名也已归一过）
    n_categorical: 类别数（若 caller 知道）
    cmap_used: 连续 cmap 名（如有）
    """
    issues: list[tuple[str, str]] = []

    # FIG003: 红/绿对比
    rg, red_c, green_c = _has_red_green_pair(colors_used)
    if rg:
        issues.append((
            "WARN",  # 有 marker/linestyle 等冗余时不强制 FAIL
            f"FIG003 categorical 中含红/绿对 ({red_c} vs {green_c})——Nature 明令: "
            "颜色不能是唯一直接区分（red-green contrast 禁示）。"
            "补 marker/linestyle/filled-open 等冗余编码，或改用 Okabe-Ito blue/orange。"
        ))

    # FIG005: 色相数上限
    n_hues = len(set(colors_used))
    if n_categorical is not None and n_categorical > 8:
        issues.append((
            "FAIL",
            f"FIG005 {n_categorical} 个类别远超 8 — 禁止以 hue 作为主要身份编码。"
            "改用 facet/direct label/shape/line style/ordered luminance/hierarchical grouping。"
        ))
    elif n_hues > 8:
        issues.append((
            "WARN",
            f"FIG005 用了 {n_hues} 个色相 (>8) — 灰度打印和 CVD 不可辨。增强 marker/linestyle 冗余编码。"
        ))

    # FIG004: rainbow
    if cmap_used and cmap_used.lower() in _RAINBOW_CMAPS:
        issues.append((
            "FAIL",
            f"FIG004 用了 rainbow 家族 colormap: {cmap_used} — 这是 Nature 明令禁止。"
            "改用 viridis/cividis/magma/inferno（perceptually uniform）或 batlow。"
        ))

    # FIG015: 灰度坍缩
    lums = _grayscale_luminances(colors_used)
    if len(set(lums)) >= 2:
        min_diff = _min_luminance_diff(lums)
        if min_diff < 0.05:
            issues.append((
                "WARN",
                f"FIG015 灰度模拟下某些类别亮度坍缩 (Δ{min_diff:.3f} < 0.05) — "
                "黑白打印不可辨。加 marker/line-style/filled-open 冗余编码。"
            ))
    return issues


def lint_typography(fig, min_pt: float = 5.0) -> list[tuple[str, str]]:
    """FIG001: 图里所有 Text 对象的字号不得 < 5pt（Nature 可读性底线）。"""
    from matplotlib.text import Text
    issues = []
    seen = set()
    for ax in fig.get_axes():
        texts = [ax.title, ax.xaxis.label, ax.yaxis.label]
        texts += ax.get_xticklabels() + ax.get_yticklabels()
        texts += ax.texts
        leg = ax.get_legend()
        if leg:
            texts += list(leg.get_texts())
        for t in texts:
            try:
                size = float(t.get_fontsize())
            except Exception:
                continue
            if size < min_pt:
                key = (id(t), size)
                if key in seen:
                    continue
                seen.add(key)
                s = str(t.get_text())[:24]
                issues.append((
                    "WARN",
                    f"FIG001 文本字号 {size:.1f}pt < {min_pt}pt ({s!r}) — "
                    "打印后可能不可读。typography 层级表中正文最小 5pt。"
                ))
    return issues


def lint_cmap_policy(cmap) -> list[tuple[str, str]]:
    """FIG004 的对象版：直接收 matplotlib cmap 或其名字。"""
    name = getattr(cmap, 'name', None) or (cmap if isinstance(cmap, str) else None)
    if name and name.lower() in _RAINBOW_CMAPS:
        return [("FAIL", f"FIG004 colormap {name} 属 rainbow 家族（禁用）")]
    return []


def lint_statistics_metadata(has_stat_metadata: bool, n_available: bool,
                             err_semantics: str | None = None) -> list[tuple[str, str]]:
    """FIG008/010: 统计元数据是否齐（这些在 fig 对象上看不见，需调用方显式声明）。"""
    issues = []
    if not err_semantics:
        issues.append(("WARN",
                       "FIG008 误差棒语义未声明（mean±SEM / SD / 95% CI）——"
                       "必须进图注，否则读者无法解读误差棒。"))
    if not has_stat_metadata:
        issues.append(("WARN",
                       "FIG009/图上的 p-value/star 未携带统计检验元数据（检验名/n/校正方法）"
                       "——应通过 caption 或用 bio_stats 工具真正计算后再标注。"))
    if not n_available:
        issues.append(("INFO",
                       "FIG010 精确 n 未声明。Nature 要求 exact n 与 replicate 类型。"))
    return issues


def full_lint(fig=None, colors_used=None, n_categorical=None, cmap_used=None,
              err_semantics=None, has_stat_metadata=None, n_available=None,
              min_pt: float = 5.0) -> dict:
    """一键 lint：fig 对象级别 + 调用方自报的元数据。返回 {issues, verdict}。"""
    issues: list[tuple[str, str]] = []
    if fig is not None:
        issues.extend(lint_typography(fig, min_pt=min_pt))
    if colors_used:
        issues.extend(lint_figure_colors(colors_used, n_categorical=n_categorical,
                                         cmap_used=cmap_used))
    elif cmap_used:
        issues.extend(lint_cmap_policy(cmap_used))
    meta_issues = lint_statistics_metadata(
        has_stat_metadata=has_stat_metadata if has_stat_metadata is not None else True,
        n_available=n_available if n_available is not None else True,
        err_semantics=err_semantics,
    )
    issues.extend(meta_issues)

    sev_order = {'INFO': 0, 'WARN': 1, 'FAIL': 2}
    verdict = ('PASS' if not issues else
               {0: 'PASS', 1: 'WARN', 2: 'FAIL'}[max(sev_order[s] for s, _ in issues)])
    return {'issues': [{'severity': s, 'message': m} for s, m in issues], 'verdict': verdict}
