# 莫兰迪风格PPT (34) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-34-4baaf592

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-34-4baaf592

## 风格名称
莫兰迪风格PPT (34) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-34-4baaf592

## 风格描述
A minimalist, editorial-style presentation utilizing a muted 'Morandi' palette, heavy negative space, intersecting geometric blocks, and oversized typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted slate blue and soft mustard amber serve as primary accents, anchored by crisp white and light grey base layers.
- fonts: Clean, light-weight sans-serif for body text; ultra-large, slightly bolder numerals for section markers.
- spacing: Extremely loose and breathable. High margins, wide gaps between textual columns, and intentional use of empty quadrants.
- shape_language: Strictly orthogonal. Sharp rectangles, borderless color blocks, and perfectly aligned text margins.
- texture: Flat, matte solid blocks mixed with soft-focus or low-contrast photographic underlays.
- grid: Asymmetric modular grid. Frequently uses 1/3 to 2/3 splits, intersecting vertical accent bands, and floating text boxes.
- motion_or_depth: Mostly flat design with very subtle, soft drop shadows applied only to oversized typographic elements to create a slight floating effect.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (34) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-34-4baaf592」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, editorial-style presentation utilizing a muted 'Morandi' palette, heavy negative space, intersecting geometric blocks, and oversized typography.
- 推荐配色：#4A606D、#D79F4F、#F4F4F4、#FFFFFF、#222222

【不可丢失的风格锚点】
- Intersecting vertical and horizontal color bands
- Oversized, standalone numerals with subtle drop shadows
- Muted, earthy accent colors against expansive light grey/white backgrounds
- Asymmetrical split-screen layouts

【字体】
- Use light/thin sans-serif for body copy to maintain an airy feel.
- Deploy ultra-large numerals (often exceeding 100pt) to anchor sections.
- Allow text to occasionally overlap background color blocks.
- Use dark grey/black for text on light backgrounds, and white text for high contrast on dark accent blocks.

【封面页构图】
- Full-bleed background with central oversized typography and a bottom-center colored accent square containing an icon.

【内容页构图】
- Four-column grid with equal spacing, each featuring a top-aligned icon, short heading, and paragraph text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with central oversized typography and a bottom-center colored accent square containing an icon.","zones":["Full-bleed background with central oversized typography and a bottom-center colored accent square containing an icon."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["hero-image","minimal-cover","centered-text"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-hero","purpose":"Full bleed atmospheric background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Intersecting horizontal background panel and right-aligned vertical accent block, with an oversized left-aligned numeral.","zones":["Intersecting horizontal background panel and right-aligned vertical accent block, with an oversized left-aligned numeral."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["big-number","intersecting-blocks","vertical-text"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter headers"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"section-img-right","purpose":"Contextual mood image","bbox":[0.66,0.13,0.21,0.51],"priority":1}]}
- content: [{"id":"content-content","composition":"Four-column grid with equal spacing, each featuring a top-aligned icon, short heading, and paragraph text.","zones":["Four-column grid with equal spacing, each featuring a top-aligned icon, short heading, and paragraph text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["four-column","icon-grid","symmetrical"],"avoid":["Complex narratives","Large image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Services overview","Team values"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Split layout with a horizontal background color split, left-aligned image, and right-aligned text featuring a large typographic watermark.","zones":["Split layout with a horizontal background color split, left-aligned image, and right-aligned text featuring a large typographic watermark."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["split-screen","typographic-watermark","offset-image"],"avoid":["Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Author intros","Key quotes","Product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-img-left","purpose":"Contextual image anchoring the left side","bbox":[0,0.28,0.5,0.58],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split layout: left side simple bar charts and text, right side device mockup overlapping a prominent vertical background rectangle.","zones":["Split layout: left side simple bar charts and text, right side device mockup overlapping a prominent vertical background rectangle."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["device-mockup","simple-charts","split-layout"],"avoid":["Complex multi-axis charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Digital product showcases","Key metrics alongside software previews"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"mockup-screen","purpose":"Screen content for device","bbox":[0.52,0.3,0.4,0.45],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Four-column grid with equal spacing, each featuring a top-aligned icon, short heading, and paragraph text.","zones":["Four-column grid with equal spacing, each featuring a top-aligned icon, short heading, and paragraph text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["four-column","icon-grid","symmetrical"],"avoid":["Complex narratives","Large image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Services overview","Team values"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background image with an offset vertical translucent/solid accent band, overlain with massive white typography.","zones":["Full-bleed background image with an offset vertical translucent/solid accent band, overlain with massive white typography."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Intersecting vertical and horizontal color bands","Oversized, standalone numerals with subtle drop shadows","Muted, earthy accent colors against expansive light grey/white backgrounds"],"optional_variants":["closing-statement","vertical-band","hero-image"],"avoid":["Data or lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Final quotes","Contact info wrappers"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-closing","purpose":"Full bleed closing background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should ideally be color-graded to match the muted, warm 'Morandi' palette.
- Use full-bleed for covers/closers, but strict rectangular crops for interior gallery layouts.
- Images frequently intersect with solid vertical or horizontal background color bands.

【图标与装饰】
- Minimalist, flat white icons housed inside softly rounded dark squares.
- Avoid line-art icons; prefer solid, chunky geometric shapes.

【数据页构图】
- Split layout: left side simple bar charts and text, right side device mockup overlapping a prominent vertical background rectangle.

【图表风格】
- Extremely simplified flat bar charts.
- Use the primary accent colors (slate blue, light blue/grey) for data series.
- Remove all axis lines and grid markers; rely purely on proportional bar lengths and inline labels.

【章节页构图】
- Intersecting horizontal background panel and right-aligned vertical accent block, with an oversized left-aligned numeral.

【收尾页构图】
- Full-bleed background image with an offset vertical translucent/solid accent band, overlain with massive white typography.

【禁止】
- High-saturation primary or neon colors.
- Cluttered slides with edge-to-edge text.
- Heavy borders or strokes around images and shapes.
- Complex 3D graphics or highly textured gradients.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Editorial design portfolios、Fashion or lifestyle brand lookbooks、High-end minimalist corporate overviews、Art and architecture presentations。
