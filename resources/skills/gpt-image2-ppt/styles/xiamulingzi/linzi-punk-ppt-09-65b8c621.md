# 个性朋克（09）---木七设计 · ppt模板 / linzi-punk-ppt-09-65b8c621

## 风格ID
linzi-punk-ppt-09-65b8c621

## 风格名称
个性朋克（09）---木七设计 · ppt模板 / linzi-punk-ppt-09-65b8c621

## 风格描述
An edgy, brutalist presentation design system featuring dark mode aesthetics, oversized overlapping typography, and striking asymmetrical image placements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background is near-black (#121212) with stark white (#FFFFFF) for primary text. A muted lavender (#8B89C9) is used for large numeric accents and sidebar details.
- fonts: Primary headers use a heavyweight, geometric sans-serif. Accents use a casual brush script. Body copy uses a clean, highly legible grotesque sans-serif.
- spacing: Dense and overlapping. Elements intentionally break traditional grid margins, creating a layered, collage-like rhythm.
- shape_language: Strictly orthogonal. Sharp rectangles and squares for image containers, contrasting with the fluid organic forms of the textures inside them.
- texture: Relies heavily on inserting hyper-vibrant, iridescent, or metallic textures into geometric clipping masks to contrast with stark photography.
- grid: Deconstructed modular grid. Heavy use of asymmetry, marginalia tracking, and off-center focal points.
- motion_or_depth: Depth is achieved purely through static layering—placing massive typography over or under floating geometric image blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「个性朋克（09）---木七设计 · ppt模板 / linzi-punk-ppt-09-65b8c621」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An edgy, brutalist presentation design system featuring dark mode aesthetics, oversized overlapping typography, and striking asymmetrical image placements.
- 推荐配色：#121212、#FFFFFF、#8B89C9、#333333

【不可丢失的风格锚点】
- Left-edge persistent vertical sidebar with accent script typography.
- Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.
- Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images.
- High-contrast integration of vivid textures against monochrome or dark backgrounds.

【字体】
- Headers are oversized, often capitalized, and deliberately broken across lines to form graphic shapes.
- Small utility text (like '01/20') is used as marginalia to create an editorial, magazine-like feel.
- Script typography is used sparingly as a textural accent, never for core readable content.

【封面页构图】
- Wide panoramic image slot at the top, anchored by massive overlapping typography underneath and a compact 3-column text grid.

【内容页构图】
- Dominant left-aligned portrait image overlapping with text, balanced by a right-aligned vertical column of smaller image/text rows.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Wide panoramic image slot at the top, anchored by massive overlapping typography underneath and a compact 3-column text grid.","zones":["Wide panoramic image slot at the top, anchored by massive overlapping typography underneath and a compact 3-column text grid."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["hero-top","massive-title","brutalist"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breakers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-texture","purpose":"Vibrant abstract texture or hero image","bbox":[0.19,0.11,0.68,0.38],"priority":1}]}
- section: {"id":"section-primary","composition":"Central vertical bleeding image overlaid with a large title, flanked by smaller, staggered textural squares.","zones":["Central vertical bleeding image overlaid with a large title, flanked by smaller, staggered textural squares."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["central-split","layered-text","collage"],"avoid":["Bullet lists","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter introductions","Thematic statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-vertical","purpose":"Main photographic subject","bbox":[0.35,0.0,0.3,1.0],"priority":1},{"id":"accent-texture-1","purpose":"Secondary textural accent","bbox":[0.19,0.11,0.23,0.29],"priority":2},{"id":"accent-texture-2","purpose":"Secondary textural accent","bbox":[0.8,0.34,0.07,0.55],"priority":3}]}
- content: [{"id":"content-content","composition":"Dominant left-aligned portrait image overlapping with text, balanced by a right-aligned vertical column of smaller image/text rows.","zones":["Dominant left-aligned portrait image overlapping with text, balanced by a right-aligned vertical column of smaller image/text rows."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["asymmetric-gallery","sidebar-list"],"avoid":["Single powerful quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product feature galleries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-left","purpose":"Primary visual anchor","bbox":[0.19,0.11,0.3,0.67],"priority":1},{"id":"thumbnail-top","purpose":"Supporting portrait or detail","bbox":[0.57,0.0,0.15,0.25],"priority":2},{"id":"thumbnail-mid","purpose":"Supporting portrait or detail","bbox":[0.57,0.32,0.15,0.38],"priority":3},{"id":"thumbnail-bot","purpose":"Supporting portrait or detail","bbox":[0.57,0.78,0.15,0.22],"priority":4}]},{"id":"content-comparison","composition":"Layered composition with a massive background texture, a floating central image, and oversized cropped numerals on the right.","zones":["Layered composition with a massive background texture, a floating central image, and oversized cropped numerals on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["layered-containers","giant-number"],"avoid":["Dense paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics","Process steps (highlighting one step)"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"background-texture","purpose":"Vibrant framing layer","bbox":[0.27,0.0,0.45,0.78],"priority":2},{"id":"foreground-image","purpose":"Primary subject","bbox":[0.11,0.11,0.46,0.38],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four distinct vertical image pillars, varying in height, each containing a large percentage and label.","zones":["Four distinct vertical image pillars, varying in height, each containing a large percentage and label."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["visual-columns","data-pillars"],"avoid":["Complex tables","Line graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Highlighting 3-4 key metrics","Visual statistics"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"pillar-1","purpose":"Data backdrop","bbox":[0.11,0.11,0.15,0.67],"priority":1},{"id":"pillar-2","purpose":"Data backdrop","bbox":[0.32,0.0,0.15,0.5],"priority":2},{"id":"pillar-3","purpose":"Data backdrop","bbox":[0.54,0.11,0.15,0.67],"priority":3},{"id":"pillar-4","purpose":"Data backdrop","bbox":[0.76,0.0,0.15,0.5],"priority":4}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central vertical bleeding image overlaid with a large title, flanked by smaller, staggered textural squares.","zones":["Central vertical bleeding image overlaid with a large title, flanked by smaller, staggered textural squares."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["central-split","layered-text","collage"],"avoid":["Bullet lists","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter introductions","Thematic statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-vertical","purpose":"Main photographic subject","bbox":[0.35,0.0,0.3,1.0],"priority":1},{"id":"accent-texture-1","purpose":"Secondary textural accent","bbox":[0.19,0.11,0.23,0.29],"priority":2},{"id":"accent-texture-2","purpose":"Secondary textural accent","bbox":[0.8,0.34,0.07,0.55],"priority":3}]}]
- closing: {"id":"closing-primary","composition":"Left-aligned tall vertical image pillar paired with right-aligned, extremely large brutalist text broken across multiple lines.","zones":["Left-aligned tall vertical image pillar paired with right-aligned, extremely large brutalist text broken across multiple lines."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Left-edge persistent vertical sidebar with accent script typography.","Right-edge persistent vertical branding zone featuring a barcode-like graphic motif.","Oversized, ultra-bold sans-serif typography that often spans multiple lines or overlaps images."],"optional_variants":["monumental-text","closing-statement"],"avoid":["Summary lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Strong call-to-actions"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-pillar","purpose":"Final brand texture or image","bbox":[0.27,0.11,0.15,0.67],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in sharp, borderless rectangles.
- Strong contrast between high-saturation abstract textures and desaturated/monochrome photography.
- Images are often positioned to bleed off the edge or overlap text blocks.

【图标与装饰】
- Minimal traditional iconography. Uses graphic motifs (like barcodes or geometric rings) instead of literal icons.

【数据页构图】
- Four distinct vertical image pillars, varying in height, each containing a large percentage and label.

【图表风格】
- Data is represented typographically rather than through traditional charts (e.g., oversized percentages paired with vertical image banners).

【章节页构图】
- Central vertical bleeding image overlaid with a large title, flanked by smaller, staggered textural squares.

【收尾页构图】
- Left-aligned tall vertical image pillar paired with right-aligned, extremely large brutalist text broken across multiple lines.

【禁止】
- Do not use rounded corners or soft drop shadows.
- Avoid centered, symmetrical layouts.
- Do not use literal stock icons; rely on typography and abstract shapes for structural markers.
- Avoid low-contrast text on dark backgrounds.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks or editorial pitches.、Avant-garde tech or creative agency portfolios.、Event promos requiring a cyberpunk or underground aesthetic.、Trend reports and mood boards.。
