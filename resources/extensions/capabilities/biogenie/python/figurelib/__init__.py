"""dsh-bio-genie 出版级绘图库（figurelib）。

本目录吸收自两个 MIT 许可的开源项目（出处与版权声明见
dsh-bio-genie 仓库根目录 THIRD_PARTY_NOTICES.md）：

  - scripts 6 件（setup_style / profile_data / export_figure /
    check_figure / layout_tools / visual_qa）来自
    Haojae/scipilot-figure-skill（MIT, Copyright (c) 2026 Haojae），
    基线 commit 43098ddb9e6a6d142218540c114f9ed38922fc42。
  - assets 5 件（nature/publication/presentation.mplstyle、
    publisher_profiles.json、color_palettes.py）来自
    K-Dense-AI/scientific-agent-skills 的 scientific-visualization
    skill（MIT, Copyright (c) 2025 K-Dense Inc.），
    基线 commit 991bd993aca4e90891d1f9908ba82ef45d77b6f0。

用法（bio_python 代码内直接 import；语义化工具 bio_fig_profile /
bio_fig_export / bio_fig_qa 已包装高频入口）：

    from figurelib.setup_style import setup_style
    from figurelib.export_figure import export_figure
    from figurelib.visual_qa import audit_layout, render_preview
    from figurelib.layout_tools import finalize_figure, add_panel_labels
    from figurelib.check_figure import check_figure
    from figurelib.profile_data import profile_data
    from figurelib.fig_lint import full_lint          # FIG 级语义 lint（自研）

依赖：matplotlib / pandas / numpy / scipy / Pillow（已在
python/requirements.txt 核心依赖中）；seaborn 为绘图配方常用。
"""
