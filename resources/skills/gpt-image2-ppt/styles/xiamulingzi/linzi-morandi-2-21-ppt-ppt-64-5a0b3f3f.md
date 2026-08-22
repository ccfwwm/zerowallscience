# 64 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-64-5a0b3f3f

## 风格ID
linzi-morandi-2-21-ppt-ppt-64-5a0b3f3f

## 风格名称
64 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-64-5a0b3f3f

## 风格描述
A minimalist, modular presentation template featuring sharp geometry, generous whitespace, and striking coral/teal accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light gray background canvas with stark teal and coral used for high-impact focal points; dark gray for legible body copy.
- fonts: Clean, modern sans-serif; headings utilize uppercase styling for structural weight.
- spacing: Generous margins and active whitespace that separates distinct content zones without visible borders.
- shape_language: Strictly orthogonal; sharp rectangles and straight lines.
- texture: Completely flat vector styling; devoid of gradients, drop shadows, or 3D effects.
- grid: Modular grid heavily relying on 1/2 and 1/3 horizontal splits.
- motion_or_depth: Strictly flat 2D layout prioritizing planar composition.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「64 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-64-5a0b3f3f」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, modular presentation template featuring sharp geometry, generous whitespace, and striking coral/teal accents.
- 推荐配色：#F4F5F6、#0C7C84、#FA5C65、#333333、#FFFFFF

【不可丢失的风格锚点】
- Left-edge vertical split-color accent bar
- Partial text highlights using solid accent color blocks behind words
- Strict rectangular image crops with no border radius
- Asymmetrical two-column and three-column balance

【字体】
- Primary headings are uppercase, bold, sans-serif, often combining dual colors or background highlight boxes.
- Body text is low-contrast (gray on light gray/white) with high line-height for airiness.
- Header/footer tracking elements are right-aligned and consistently placed.

【封面页构图】
- Left-aligned dual-color title floating in whitespace, paired with a right-aligned large image bleed.

【内容页构图】
- Left column for highlighted title and body text, right column for a square/portrait image.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned dual-color title floating in whitespace, paired with a right-aligned large image bleed.","zones":["Left-aligned dual-color title floating in whitespace, paired with a right-aligned large image bleed."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["minimal-cover","image-right"],"avoid":["Heavy data","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-image","purpose":"Replaceable hero imagery","bbox":[0.4,0.2,0.5,0.6],"priority":1}]}
- section: {"id":"section-primary","composition":"Tall left-edge image bleed, right side split horizontally with title in white space above a solid color block containing icon-led features.","zones":["Tall left-edge image bleed, right side split horizontally with title in white space above a solid color block containing icon-led features."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["split-layout","icon-grid"],"avoid":["Long-form text","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Service overviews","Key benefits"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"sidebar-image","purpose":"Thematic visual anchor","bbox":[0.05,0.1,0.25,0.8],"priority":1}]}
- content: [{"id":"content-content","composition":"Left column for highlighted title and body text, right column for a square/portrait image.","zones":["Left column for highlighted title and body text, right column for a square/portrait image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["text-left","image-right"],"avoid":["Full-screen imagery","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction","Core concepts","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-image","purpose":"Supporting visual","bbox":[0.5,0.25,0.4,0.6],"priority":1}]},{"id":"content-comparison","composition":"Top half solid color block for title, bottom half split into three columns for icon-led text, with the center column inverted/highlighted.","zones":["Top half solid color block for title, bottom half split into three columns for icon-led text, with the center column inverted/highlighted."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["three-columns","top-heavy"],"avoid":["Photography showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Pricing tiers","Three-step processes","Core services"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Large flat column chart occupying the left two-thirds; right one-third contains a title, text, and an icon-led callout.","zones":["Large flat column chart occupying the left two-thirds; right one-third contains a title, text, and an icon-led callout."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["chart-left","data-visualization"],"avoid":["Qualitative explanations without numbers","copying source assets, source text, or an exact source arrangement"],"best_for":["Financial results","Survey data","Growth metrics"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left column for highlighted title and body text, right column for a square/portrait image.","zones":["Left column for highlighted title and body text, right column for a square/portrait image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["text-left","image-right"],"avoid":["Full-screen imagery","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction","Core concepts","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-image","purpose":"Supporting visual","bbox":[0.5,0.25,0.4,0.6],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Left-aligned 'THANKS' title with short body text, paired with a right-aligned square image.","zones":["Left-aligned 'THANKS' title with short body text, paired with a right-aligned square image."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Left-edge vertical split-color accent bar","Partial text highlights using solid accent color blocks behind words","Strict rectangular image crops with no border radius"],"optional_variants":["minimal-closing","image-right"],"avoid":["New content introduction","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Contact information","Final remarks"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-image","purpose":"Final thematic visual","bbox":[0.5,0.2,0.4,0.6],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into strict rectangles or squares.
- Often edge-to-edge within their designated grid columns.
- No borders, shadows, or rounded corners.

【图标与装饰】
- Thin-line, minimalist vector icons.
- Uniformly sized and typically centered above supporting text blocks.

【数据页构图】
- Large flat column chart occupying the left two-thirds; right one-third contains a title, text, and an icon-led callout.

【图表风格】
- Flat, 2D column charts matching the theme's core palette (teal, coral, dark gray).
- Minimal axes lines and no 3D effects or complex data markers.

【章节页构图】
- Tall left-edge image bleed, right side split horizontally with title in white space above a solid color block containing icon-led features.

【收尾页构图】
- Left-aligned 'THANKS' title with short body text, paired with a right-aligned square image.

【禁止】
- Do not use drop shadows or gradients.
- Avoid rounded corners on images or shapes.
- Do not center-align body text; adhere to the grid.
- Avoid cluttering the generous whitespace.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Modern corporate overviews、Minimalist product lookbooks、Design-focused pitch decks。
