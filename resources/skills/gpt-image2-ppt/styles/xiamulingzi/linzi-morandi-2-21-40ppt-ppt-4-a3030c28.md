# 莫兰迪风尚 (4) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-4-a3030c28

## 风格ID
linzi-morandi-2-21-40ppt-ppt-4-a3030c28

## 风格名称
莫兰迪风尚 (4) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-4-a3030c28

## 风格描述
An editorial-style presentation utilizing a muted Morandi mauve palette, flat overlapping white geometric structural blocks, and elegant typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Mauve background serves as the primary canvas; white is used for structural overlap and high contrast; dark charcoal used for text on light blocks.
- fonts: Elegant serif (e.g., Playfair Display) for prominent titles; clean sans-serif for secondary caps, subtitles, and body copy.
- spacing: Generous margins, off-center alignments, and intentional overlapping to create spatial rhythm.
- shape_language: Strictly orthogonal; sharp-edged rectangles and squares, with occasional horizontal/vertical thin line accents.
- texture: Flat, matte color fields contrasting against rich, warm-filtered photographic textures.
- grid: Modular and asymmetrical; frequent use of 50/50 or 40/60 vertical splits and floating central anchor points.
- motion_or_depth: Depth is created entirely through z-index flat overlapping (e.g., a white block over an image over a mauve background) rather than drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (4) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-4-a3030c28」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial-style presentation utilizing a muted Morandi mauve palette, flat overlapping white geometric structural blocks, and elegant typography.
- 推荐配色：#927A86、#FFFFFF、#2D2D2D、#D9D9D9

【不可丢失的风格锚点】
- Muted, low-saturation background fields
- Flat, overlapping stark white rectangles acting as content frames or title cards
- Asymmetrical image placements that break the grid
- Mix of classic serif display fonts with minimalist sans-serif body copy

【字体】
- Titles placed inside white overlapping blocks should use dark, elegant serif fonts.
- Subtitle and meta text should utilize tracked-out, all-caps sans-serif.
- Body paragraphs should be compact, left-aligned sans-serif, using low contrast (white/light gray on mauve, or dark gray on white).
- Use vertical thin lines alongside text blocks as subtle structural anchors.

【封面页构图】
- Asymmetric layout with a dominant image anchored bottom-left, overlapping white rectangles in opposing corners, and right-aligned title text.

【内容页构图】
- Vertical split layout with full-height image on the left (interrupted by a white edge margin) and a structured text column with vertical line accents on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetric layout with a dominant image anchored bottom-left, overlapping white rectangles in opposing corners, and right-aligned title text.","zones":["Asymmetric layout with a dominant image anchored bottom-left, overlapping white rectangles in opposing corners, and right-aligned title text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["asymmetrical","hero-image","overlapping-shapes"],"avoid":["Data heavy content","Complex bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Section cover","Hero introduction"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bottom-left","purpose":"Main cover visual","bbox":[0.06,0.3,0.52,0.7],"priority":1}]}
- section: {"id":"section-primary","composition":"Centered wide letterbox image with a floating, stark white rectangular title card perfectly centered horizontally and vertically.","zones":["Centered wide letterbox image with a floating, stark white rectangular title card perfectly centered horizontally and vertically."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["centered","letterbox-image","floating-title"],"avoid":["Detailed explanations","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Welcome slide","Transition or chapter break","Key quote"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"wide-center","purpose":"Atmospheric background","bbox":[0.13,0.23,0.74,0.54],"priority":1}]}
- content: [{"id":"content-content","composition":"Vertical split layout with full-height image on the left (interrupted by a white edge margin) and a structured text column with vertical line accents on the right.","zones":["Vertical split layout with full-height image on the left (interrupted by a white edge margin) and a structured text column with vertical line accents on the right."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["split-layout","vertical-rhythm","list-view"],"avoid":["Large data tables","Full width diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Agenda lists","Detailed content alongside visuals"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"tall-left","purpose":"Supporting side image","bbox":[0.17,0.0,0.33,1.0],"priority":1}]},{"id":"content-comparison","composition":"Two-column layout featuring a square image on the left and a framed title box with trailing text/list on the right.","zones":["Two-column layout featuring a square image on the left and a framed title box with trailing text/list on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["framed-title","square-image","balanced"],"avoid":["Large quotes","Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Feature lists","Summary points"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"square-mid-left","purpose":"Contextual visual","bbox":[0.13,0.23,0.34,0.54],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Complex split matrix: Left column contains titles and rounded horizontal list units; right column features top-half image overlay and bottom-half distinct white text cards.","zones":["Complex split matrix: Left column contains titles and rounded horizontal list units; right column features top-half image overlay and bottom-half distinct white text cards."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["modular-cards","pill-shapes","split-matrix"],"avoid":["Simple overarching messages","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature comparisons","Dashboard-style summaries","Multi-point data without charts"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"top-right-quadrant","purpose":"Contextual header image","bbox":[0.42,0.0,0.58,0.5],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered wide letterbox image with a floating, stark white rectangular title card perfectly centered horizontally and vertically.","zones":["Centered wide letterbox image with a floating, stark white rectangular title card perfectly centered horizontally and vertically."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["centered","letterbox-image","floating-title"],"avoid":["Detailed explanations","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Welcome slide","Transition or chapter break","Key quote"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"wide-center","purpose":"Atmospheric background","bbox":[0.13,0.23,0.74,0.54],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Framed full-screen image with an overlapping central white text block and opposing white corner accent blocks.","zones":["Framed full-screen image with an overlapping central white text block and opposing white corner accent blocks."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation background fields","Flat, overlapping stark white rectangles acting as content frames or title cards","Asymmetrical image placements that break the grid"],"optional_variants":["framed","centered-message","corner-accents"],"avoid":["Heavy text","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Q&A introduction","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"framed-background","purpose":"Atmospheric closing visual","bbox":[0.06,0.08,0.88,0.84],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Unbordered, sharp rectangular crops.
- Images should frequently overlap solid background shapes or be partially covered by floating text boxes.
- Color grading should lean towards desaturated, warm, or matte finishes to match the Morandi theme.

【图标与装饰】
- Minimal use; when present, use simple, white outline icons housed in opaque or semi-transparent circular backgrounds.

【数据页构图】
- Complex split matrix: Left column contains titles and rounded horizontal list units; right column features top-half image overlay and bottom-half distinct white text cards.

【图表风格】
- Rely on structured text layouts, pill-shaped list items, or modular white cards rather than traditional axis-based charts.

【章节页构图】
- Centered wide letterbox image with a floating, stark white rectangular title card perfectly centered horizontally and vertically.

【收尾页构图】
- Framed full-screen image with an overlapping central white text block and opposing white corner accent blocks.

【禁止】
- Avoid bright, highly saturated primary or neon colors.
- Do not use drop shadows, bevels, or 3D effects on shapes.
- Avoid dense, edge-to-edge text walls.
- Do not center-align body text; keep paragraphs flush left.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Editorial style business profiles、Interior design proposals、High-end lifestyle branding pitches。
