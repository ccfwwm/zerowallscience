# 99 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-99-204c2b6c

## 风格ID
linzi-morandi-2-21-ppt-ppt-99-204c2b6c

## 风格名称
99 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-99-204c2b6c

## 风格描述
A retro, Morandi-themed presentation using strong color blocking (terracotta and teal), thin white borders, and flat geometric layouts for structured reports.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Tan acts as a universal canvas/border. Terracotta and teal act as co-primary block colors, often split 50/50 or 33/33/33. White used strictly for text and iconography.
- fonts: Casual, handwritten sans-serif for both headers and body. Fallback to Comic Sans or casual marker fonts.
- spacing: Uniform, medium padding inside colored blocks. Thick tan gutters between floating blocks. Thin (1px) white lines for dividers.
- shape_language: Strict sharp-edged rectangles for spatial zones; perfect circles for icons/charts; hexagons exclusively for image masks.
- texture: Completely flat and matte. Zero gradients, shadows, or 3D effects.
- grid: Strict modular grids (2, 3, or 4 columns) with distinct colored background blocks defining the spatial zones.
- motion_or_depth: Absolute flat depth. Overlap only occurs when icons sit inside circles or circular icons break the edge of rectangular text blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「99 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-99-204c2b6c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A retro, Morandi-themed presentation using strong color blocking (terracotta and teal), thin white borders, and flat geometric layouts for structured reports.
- 推荐配色：#B79C85、#A74A45、#46828D、#FFFFFF、#A3A6A5

【不可丢失的风格锚点】
- Thin white double-line perimeter frame on every slide
- Harsh color blocking splitting the canvas into rigid terracotta and teal zones
- Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers
- Playful, handwritten typography contrasting with rigid geometric grids

【字体】
- Use casual, handwritten-style fonts for all text to maintain the retro vibe
- Center text alignment vertically and horizontally within geometric blocks
- Use pure white text exclusively on dark color blocks
- Use horizontal thin white lines as structural dividers between title and body text

【封面页构图】
- Asymmetrical vertical color split with centered overlapping text and bottom circular metadata

【内容页构图】
- Three vertical columns, each split horizontally into alternating colored blocks

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical vertical color split with centered overlapping text and bottom circular metadata","zones":["Asymmetrical vertical color split with centered overlapping text and bottom circular metadata"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["split-background","bold-title","minimalist"],"avoid":["Long subtitles or dense introductory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Speaker introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Vertical left title bar with main right content area containing a structured list","zones":["Vertical left title bar with main right content area containing a structured list"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["list","vertical-title","two-column"],"avoid":["Deeply nested lists or long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Agenda overview"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three vertical columns, each split horizontally into alternating colored blocks","zones":["Three vertical columns, each split horizontally into alternating colored blocks"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["three-column","color-blocking","grid"],"avoid":["Sequential timelines","Large image displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature comparisons","Three-pillar concepts","Service offerings"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"2x2 hybrid grid mixing solid color text blocks and rectangular image blocks","zones":["2x2 hybrid grid mixing solid color text blocks and rectangular image blocks"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["masonry","image-grid","mixed-content"],"avoid":["Data-heavy reporting","copying source assets, source text, or an exact source arrangement"],"best_for":["Mixed media layout","Team profiles","Product highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img-bottom-left","purpose":"contextual image","bbox":[0.06,0.5,0.2,0.35],"priority":2},{"id":"img-bottom-mid","purpose":"contextual image","bbox":[0.28,0.5,0.2,0.35],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three flat donut charts arranged horizontally with text labels beneath","zones":["Three flat donut charts arranged horizontally with text labels beneath"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["donut-charts","metrics","three-columns"],"avoid":["Complex multi-variable data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["Key performance indicators (KPIs)","Completion metrics","Comparative percentages"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Vertical left title bar with main right content area containing a structured list","zones":["Vertical left title bar with main right content area containing a structured list"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["list","vertical-title","two-column"],"avoid":["Deeply nested lists or long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Agenda overview"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Vertical left title bar with main right content area containing a structured list","zones":["Vertical left title bar with main right content area containing a structured list"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["list","vertical-title","two-column"],"avoid":["Deeply nested lists or long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Agenda overview"],"evidence_pages":["page-01"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Asymmetrical vertical color split mirroring the cover layout","zones":["Asymmetrical vertical color split mirroring the cover layout"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Thin white double-line perimeter frame on every slide","Harsh color blocking splitting the canvas into rigid terracotta and teal zones","Flat, borderless geometric shapes (circles, rectangles, hexagons) acting as content containers"],"optional_variants":["closing","split-background","minimalist"],"avoid":["Any new content or data","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Mask images strictly into sharp geometric shapes (rectangles or hexagons)
- Cluster image masks closely together with uniform thick tan gutters between them
- Do not apply borders, drop shadows, or filters to images

【图标与装饰】
- Monocolor pure white icons
- Mix of line-art and simple solid fill vector styles
- Always housed inside a contrasting colored circle or centered squarely within a colored block

【数据页构图】
- Three flat donut charts arranged horizontally with text labels beneath

【图表风格】
- Flat donut charts utilizing the primary palette (terracotta, teal, grey) with white text centered in the hole
- Bar charts with thin horizontal white gridlines and no visible axes
- Pure flat colored data series matching the overall Morandi theme

【章节页构图】
- Vertical left title bar with main right content area containing a structured list

【收尾页构图】
- Asymmetrical vertical color split mirroring the cover layout

【禁止】
- Avoid using gradients, drop shadows, or 3D effects of any kind
- Do not use dark or black text; stick strictly to white on colored backgrounds
- Avoid formal serif or stark corporate sans-serif fonts
- Do not break the thin white perimeter border on the slides
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative project updates and agency portfolios、Retro or vintage-themed educational materials、Casual team recaps and internal cultural decks、Design moodboards or aesthetic proposals。
