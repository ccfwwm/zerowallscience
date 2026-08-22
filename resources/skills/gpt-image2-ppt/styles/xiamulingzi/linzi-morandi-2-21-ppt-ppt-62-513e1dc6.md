# 62 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-62-513e1dc6

## 风格ID
linzi-morandi-2-21-ppt-ppt-62-513e1dc6

## 风格名称
62 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-62-513e1dc6

## 风格描述
An elegant, editorial-style presentation utilizing a muted Morandi palette, asymmetric splits, and striking vertical typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White canvas dominates, framed by muted sage green; subtle beige/peach accents provide depth; dark charcoal for text contrast.
- fonts: Elegant serif for large headings (vertical and horizontal); clean, airy sans-serif or highly legible serif for small body copy.
- spacing: Extremely generous margins inside the frame; strict vertical and horizontal alignment grids with breathable tracking.
- shape_language: Predominantly sharp rectangles; occasional use of crisp geometric hexagons and circles for icons or numbering.
- texture: Flat matte backgrounds paired with editorial photography to provide organic texture.
- grid: Asymmetric splits (1:2 or 1:1) within a constrained bounding box, occasionally intentionally breaking the frame.
- motion_or_depth: Strictly flat, 2D editorial composition with overlapping minimal color blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「62 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-62-513e1dc6」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style presentation utilizing a muted Morandi palette, asymmetric splits, and striking vertical typography.
- 推荐配色：#D3D1C2、#F2E7D7、#FFFFFF、#1C1C1C、#8B897D

【不可丢失的风格锚点】
- Signature sage-green framing border
- Vertical editorial typography blocks
- Muted beige and peach accent bars
- Asymmetric golden-ratio content splits

【字体】
- Use large, tracked-out serif fonts for primary display titles.
- Implement vertical text orientation for cover and closing slides to create editorial impact.
- Keep body text very small, low-weight, and highly breathable with generous line height.

【封面页构图】
- Framed layout with vertical title typography on the left and a dominant rectangular image on the right.

【内容页构图】
- Framed asymmetric split with a left-edge image slice and centered multi-column text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Framed layout with vertical title typography on the left and a dominant rectangular image on the right.","zones":["Framed layout with vertical title typography on the left and a dominant rectangular image on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["vertical-text","editorial-cover","framed-image"],"avoid":["Data-heavy content","Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Chapter intros"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"replaceable real image","bbox":[0.32,0.15,0.58,0.7],"priority":1}]}
- section: {"id":"section-primary","composition":"Minimalist centered layout with a dominant numeral separated from text by tricolor dash lines.","zones":["Minimalist centered layout with a dominant numeral separated from text by tricolor dash lines."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["centered-text","number-divider","minimalist"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Quote slides"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Framed asymmetric split with a left-edge image slice and centered multi-column text blocks.","zones":["Framed asymmetric split with a left-edge image slice and centered multi-column text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["split-layout","text-columns","edge-image"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"side_img","purpose":"replaceable real image","bbox":[0.0,0.27,0.38,0.46],"priority":1}]},{"id":"content-comparison","composition":"Half-bleed image breaking the left frame paired with two icon-driven columns on the right.","zones":["Half-bleed image breaking the left frame paired with two icon-driven columns on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["half-bleed","icon-columns","hexagon-accents"],"avoid":["Timeline narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Services overview"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"half_img","purpose":"replaceable real image","bbox":[0.0,0.0,0.42,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Framed asymmetric split with a left-edge image slice and centered multi-column text blocks.","zones":["Framed asymmetric split with a left-edge image slice and centered multi-column text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["split-layout","text-columns","edge-image"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"side_img","purpose":"replaceable real image","bbox":[0.0,0.27,0.38,0.46],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Half-bleed image breaking the left frame paired with two icon-driven columns on the right.","zones":["Half-bleed image breaking the left frame paired with two icon-driven columns on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["half-bleed","icon-columns","hexagon-accents"],"avoid":["Timeline narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Services overview"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"half_img","purpose":"replaceable real image","bbox":[0.0,0.0,0.42,1.0],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Framed layout with vertical closing typography on the left and a dominant rectangular image on the right.","zones":["Framed layout with vertical closing typography on the left and a dominant rectangular image on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Signature sage-green framing border","Vertical editorial typography blocks","Muted beige and peach accent bars"],"optional_variants":["vertical-text","editorial-closing","framed-image"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero","purpose":"replaceable real image","bbox":[0.32,0.15,0.58,0.7],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use full-height bleeds or large rectangular crops.
- Frame images either strictly within the slide border, or intentionally bleed them off completely on one edge.
- Wrap specific inset images in thick beige 'polaroid' style borders when stacked.

【图标与装饰】
- Minimalist white line-art icons housed within solid, muted geometric shapes (e.g., hexagons).

【数据页构图】
- Framed asymmetric split with a left-edge image slice and centered multi-column text blocks.

【图表风格】
- Rely on flat, muted Morandi colors with minimal axis lines and serif labels (implied by overall aesthetic).

【章节页构图】
- Minimalist centered layout with a dominant numeral separated from text by tricolor dash lines.

【收尾页构图】
- Framed layout with vertical closing typography on the left and a dominant rectangular image on the right.

【禁止】
- No rounded image corners.
- No drop shadows or 3D effects.
- No brightly saturated colors or neon accents.
- Avoid centering large blocks of text; favor left-alignment or structural grids.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks、Fashion pitches、Art portfolios、Minimalist agency credentials、Editorial brand guidelines。
