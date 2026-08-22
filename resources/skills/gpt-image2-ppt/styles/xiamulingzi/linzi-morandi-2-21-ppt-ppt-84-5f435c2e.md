# 84 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-84-5f435c2e

## 风格ID
linzi-morandi-2-21-ppt-ppt-84-5f435c2e

## 风格名称
84 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-84-5f435c2e

## 风格描述
An elegant, soft-toned presentation template featuring a 'Morandi' color palette, layered paper depth effects, and minimalist geometric content structures.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Soft off-white background with accents of muted coral, taupe, olive, and mocha. High reliance on color-coding for sequential items.
- fonts: Primary display font is an elegant, thin serif. Subtitles and body copy utilize clean sans-serifs or lighter serifs with generous tracking.
- spacing: Ample whitespace, particularly in central text compositions. Elements are generously spaced to maintain an airy feel.
- shape_language: A mix of sharp diagonal background layers and contained content shapes (circles, hexagons, bordered rectangles with solid tabs).
- texture: Clean vector flats combined with subtle drop shadows on macro background elements to simulate stacked paper.
- grid: Primarily center-aligned or symmetrically balanced grids (e.g., 2x2, horizontal sequence, triangular).
- motion_or_depth: Depth is strictly established through drop shadows on overlapping background panels; content elements remain mostly flat.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「84 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-84-5f435c2e」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, soft-toned presentation template featuring a 'Morandi' color palette, layered paper depth effects, and minimalist geometric content structures.
- 推荐配色：#FDF6F5、#DE8A84、#A78A72、#9F946A、#785F4D

【不可丢失的风格锚点】
- Muted, earthy pastel color scheme
- Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides
- Elegant, high-contrast serif typography for large headings
- Solid geometric shapes (hexagons, circles) used uniformly as icon containers
- Thin, organic connecting lines in process diagrams

【字体】
- Use oversized, elegant serifs for primary slide titles, often styled with separating slashes or wide letter spacing.
- Keep body copy small and understated to emphasize structural shapes and whitespace.
- Center-align text within symmetrical layouts; left-align when placed adjacent to a bounding node or image.

【封面页构图】
- Diagonal overlapping layers on top-right and bottom-left, framing a central text cluster with a pill-shaped button below.

【内容页构图】
- Triangular layout of three circular nodes with internal icons, accompanied by adjacent text blocks, converging around a central axis.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Diagonal overlapping layers on top-right and bottom-left, framing a central text cluster with a pill-shaped button below.","zones":["Diagonal overlapping layers on top-right and bottom-left, framing a central text cluster with a pill-shaped button below."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["layered-corners","centered-hero","minimal"],"avoid":["Data heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Diagonal overlapping layers framing a central title block with a rectangular text backdrop and decorative slashes.","zones":["Diagonal overlapping layers framing a central title block with a rectangular text backdrop and decorative slashes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["layered-corners","centered-title","text-backdrop"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Triangular layout of three circular nodes with internal icons, accompanied by adjacent text blocks, converging around a central axis.","zones":["Triangular layout of three circular nodes with internal icons, accompanied by adjacent text blocks, converging around a central axis."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["triangular-layout","radial-nodes","icon-circles"],"avoid":["Sequential processes","Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Core pillars","Three-part concepts"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Four side-by-side rectangular cards with thin borders and overlapping solid-color rectangular tabs at the top center of each card.","zones":["Four side-by-side rectangular cards with thin borders and overlapping solid-color rectangular tabs at the top center of each card."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["four-columns","bordered-cards","overlapping-tabs"],"avoid":["Single narrative flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature comparisons","Parallel lists"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Diagonal overlapping layers framing a central title block with a rectangular text backdrop and decorative slashes.","zones":["Diagonal overlapping layers framing a central title block with a rectangular text backdrop and decorative slashes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["layered-corners","centered-title","text-backdrop"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Triangular layout of three circular nodes with internal icons, accompanied by adjacent text blocks, converging around a central axis.","zones":["Triangular layout of three circular nodes with internal icons, accompanied by adjacent text blocks, converging around a central axis."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["triangular-layout","radial-nodes","icon-circles"],"avoid":["Sequential processes","Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Core pillars","Three-part concepts"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Diagonal overlapping layers on top-right and bottom-left framing a central typographic cluster, identical to the cover structure.","zones":["Diagonal overlapping layers on top-right and bottom-left framing a central typographic cluster, identical to the cover structure."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy pastel color scheme","Layered paper aesthetic with diagonal cuts and subtle drop shadows on cover/section slides","Elegant, high-contrast serif typography for large headings"],"optional_variants":["layered-corners","centered-hero","bookend"],"avoid":["Detail delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used sparingly, primarily as large rectangular blocks that anchor one side of a split layout.
- Avoid applying heavy borders or effects to photography; let the image sit cleanly within the grid.

【图标与装饰】
- Use thin, minimalist white line icons.
- Always house icons within solid-colored geometric containers (circles, hexagons) drawn from the primary palette.

【数据页构图】
- Diagonal overlapping layers framing a central title block with a rectangular text backdrop and decorative slashes.

【图表风格】
- Use connecting lines (both straight and gently curving) to link geometric nodes in process or cycle diagrams.
- Maintain equal spacing and consistent container sizes for all data/list nodes.

【章节页构图】
- Diagonal overlapping layers framing a central title block with a rectangular text backdrop and decorative slashes.

【收尾页构图】
- Diagonal overlapping layers on top-right and bottom-left framing a central typographic cluster, identical to the cover structure.

【禁止】
- Avoid bright, saturated, or neon colors that break the muted pastel theme.
- Do not use heavy, blocky sans-serif fonts for main titles.
- Avoid cluttered layouts; do not fill negative space unnecessarily.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Feminine brand pitches、Lifestyle, wellness, or fashion presentations、Soft-skills training modules、Design or craft portfolio overviews。
