# 个性朋克（02）---木七设计 · ppt模板 / linzi-punk-ppt-02-55bfaee3

## 风格ID
linzi-punk-ppt-02-55bfaee3

## 风格名称
个性朋克（02）---木七设计 · ppt模板 / linzi-punk-ppt-02-55bfaee3

## 风格描述
Edgy, editorial-style presentation with high-contrast split layouts, overlapping blocks, and repeating typographic textures.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark teal as primary grounding background, vibrant coral for accent blocks and highlights, white for negative space.
- fonts: Clean, highly geometric sans-serif or monospaced fonts for structural and display text, functional sans-serif for body copy.
- spacing: Generous outer margins, but intentional overlap of elements (images over text, blocks over images) to break the grid.
- shape_language: Strictly orthogonal. Sharp corners, rigid rectangles, no rounded elements.
- texture: Flat color blocks layered over high-contrast photography; text itself is used as a repeating graphic texture.
- grid: Complex editorial grid heavily relying on vertical dividing lines and horizontal intersecting bands.
- motion_or_depth: Shallow depth achieved through flat overlapping layers rather than shadows; elements slice into one another.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「个性朋克（02）---木七设计 · ppt模板 / linzi-punk-ppt-02-55bfaee3」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Edgy, editorial-style presentation with high-contrast split layouts, overlapping blocks, and repeating typographic textures.
- 推荐配色：#0A2E3F、#FF7264、#FFFFFF、#348CA0、#E6E6E6

【不可丢失的风格锚点】
- Repeating block-text typographic textures
- Asymmetrical 50/50 or 40/60 vertical background color splits
- Rigid rectangular color blocks overlapping image corners
- Persistent perimeter framing (top horizontal nav, left vertical pagination)

【字体】
- Display text often staggered or repeated multiple times to create a visual block.
- Single oversized letters placed decoratively around the corners of image containers.
- Left-aligned body copy with ragged right edges.
- Consistent use of small, tracked-out all-caps for metadata and navigation.

【封面页构图】
- Full-bleed background image with a centralized, vertically stacked repeating text motif.

【内容页构图】
- Left-anchored primary image block alongside a text column, resting above a distinct footer metadata grid.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with a centralized, vertically stacked repeating text motif.","zones":["Full-bleed background image with a centralized, vertically stacked repeating text motif."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["cover-typographic-texture","full-bleed-hero"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact introductions","Title slides"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full bleed atmospheric background","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}
- section: {"id":"section-primary","composition":"Split-color background with a central floating image intersecting the split line, surrounded by scattered text blocks.","zones":["Split-color background with a central floating image intersecting the split line, surrounded by scattered text blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["split-background","central-floating-image","editorial-layout"],"avoid":["Dense technical descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Product highlights","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-portrait","purpose":"Primary subject focus bridging two zones","bbox":[0.2,0.15,0.4,0.7],"priority":1},{"id":"edge-bleed","purpose":"Decorative partial image entry at the screen edge","bbox":[0.9,0.0,0.1,1.0],"priority":2}]}
- content: [{"id":"content-content","composition":"Left-anchored primary image block alongside a text column, resting above a distinct footer metadata grid.","zones":["Left-anchored primary image block alongside a text column, resting above a distinct footer metadata grid."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["metadata-footer","left-weighted-image"],"avoid":["Large charts or diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Article summaries","Project case studies","Detailed profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left-feature","purpose":"Main context image","bbox":[0.08,0.0,0.38,0.75],"priority":1},{"id":"bottom-right-peek","purpose":"Secondary contextual or transitional image","bbox":[0.8,0.5,0.2,0.5],"priority":2}]},{"id":"content-comparison","composition":"50/50 split layout featuring a corner-letter typography treatment on one side and an overlaid title on the other.","zones":["50/50 split layout featuring a corner-letter typography treatment on one side and an overlaid title on the other."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["50-50-split","corner-typography","overlapping-footer-block"],"avoid":["Long form body text","copying source assets, source text, or an exact source arrangement"],"best_for":["Conceptual overviews","Brand pillars","Dual-concept comparisons"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-square","purpose":"Thematic or conceptual inset image","bbox":[0.12,0.15,0.3,0.6],"priority":2},{"id":"right-feature","purpose":"Large descriptive background or feature image","bbox":[0.5,0.0,0.5,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split layout pairing a visual or creative graphic slot on one side with a clean bar chart on the other, underpinned by dual stat boxes.","zones":["Split layout pairing a visual or creative graphic slot on one side with a clean bar chart on the other, underpinned by dual stat boxes."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["editorial-data","chart-and-stats","split-data-view"],"avoid":["Complex data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Quarterly results","Performance comparisons"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"creative-graphic","purpose":"Conceptual visualization or thematic image complementing the data","bbox":[0.08,0.0,0.35,0.7],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split-color background with a central floating image intersecting the split line, surrounded by scattered text blocks.","zones":["Split-color background with a central floating image intersecting the split line, surrounded by scattered text blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["split-background","central-floating-image","editorial-layout"],"avoid":["Dense technical descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Product highlights","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-portrait","purpose":"Primary subject focus bridging two zones","bbox":[0.2,0.15,0.4,0.7],"priority":1},{"id":"edge-bleed","purpose":"Decorative partial image entry at the screen edge","bbox":[0.9,0.0,0.1,1.0],"priority":2}]}]
- quote: {"id":"quote-primary","composition":"Full-bleed background dominated by repeating lines of text, anchored by an opaque color block containing navigation elements.","zones":["Full-bleed background dominated by repeating lines of text, anchored by an opaque color block containing navigation elements."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["text-pattern-overlay","full-bleed-divider"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key statements or quotes","Pacing breaks"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"atmospheric-bg","purpose":"Mood-setting background","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Solid background featuring two vertically staggered columns of repeating display text creating an interlocking typographic pattern.","zones":["Solid background featuring two vertically staggered columns of repeating display text creating an interlocking typographic pattern."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Repeating block-text typographic textures","Asymmetrical 50/50 or 40/60 vertical background color splits","Rigid rectangular color blocks overlapping image corners"],"optional_variants":["interlocking-text","typographic-pattern","staggered-columns"],"avoid":["Contact information slides requiring legible details","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Section transitions","Strong final statements"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds or sharp-edged rectangular crops.
- Images often intersect background color boundary lines.
- Images frequently serve as a base layer for overlapping opaque color boxes.

【图标与装饰】
- Minimalist line-art arrows for pagination controls.
- Simple text-based abbreviations for social media links (Fb, Tw, In) instead of graphic icons.

【数据页构图】
- Split layout pairing a visual or creative graphic slot on one side with a clean bar chart on the other, underpinned by dual stat boxes.

【图表风格】
- Flat, minimalist bar charts using the primary color palette.
- No 3D effects, borders, or heavy grid lines; axes are subtle or omitted.

【章节页构图】
- Split-color background with a central floating image intersecting the split line, surrounded by scattered text blocks.

【收尾页构图】
- Solid background featuring two vertically staggered columns of repeating display text creating an interlocking typographic pattern.

【禁止】
- Avoid rounded corners or soft shadows, which break the rigid editorial aesthetic.
- Do not center-align body text; it breaks the established structured grid.
- Avoid pastel or low-contrast color combinations; the template relies on bold interplay.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lookbook presentations.、Creative agency portfolios.、Trend reports or editorial pitches.、Youth-oriented or streetwear brand decks.。
