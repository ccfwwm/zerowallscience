# 71 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-71-4d973efc

## 风格ID
linzi-morandi-2-21-ppt-ppt-71-4d973efc

## 风格名称
71 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-71-4d973efc

## 风格描述
Modern minimalist presentation using asymmetric block layouts, floating rectangles, and a recurring 3x3 square motif with a stark blue and charcoal palette.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light pastel blue as primary accent, charcoal for high-contrast text and blocks, light grey for subtle background splitting.
- fonts: Clean, neutral sans-serif (e.g., Arial or Helvetica) focusing on stark size contrasts between headings and body.
- spacing: Generous margins with intentional boundary-breaking overlaps; elements often cross over split background planes.
- shape_language: Strictly orthogonal; sharp corners, perfect squares, and hard-edged rectangles.
- texture: Flat color blocks layered over flat backgrounds or edge-to-edge photography, no gradients or shadows.
- grid: Asymmetric structural grid, frequently split 40/60 or 30/70, with elements floating to bridge the columns.
- motion_or_depth: Depth achieved exclusively through flat Z-index overlaps (e.g., text over color block over image).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「71 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-71-4d973efc」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Modern minimalist presentation using asymmetric block layouts, floating rectangles, and a recurring 3x3 square motif with a stark blue and charcoal palette.
- 推荐配色：#B6E5FC、#343434、#F4F4F4、#FFFFFF、#9A9A9A

【不可丢失的风格锚点】
- Recurring 3x3 small square grid motif
- Floating, overlapping solid color rectangles
- Large vertical typographic watermarks
- Asymmetric 2-column splits with off-center vertical color bands

【字体】
- Headings: Large, sentence-case, charcoal or black, often overlapping background elements.
- Body: Small, light grey or charcoal, generous line height.
- Accents: Extra-large numerals for stats, oversized faded vertical watermarks along edges.

【封面页构图】
- Left-biased large image intersecting a prominent vertical accent band, bridged by large overlapping title text.

【内容页构图】
- Centered vertical image strip dividing the slide, flanked by a 3x3 square motif and large title on the left, and body text on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-biased large image intersecting a prominent vertical accent band, bridged by large overlapping title text.","zones":["Left-biased large image intersecting a prominent vertical accent band, bridged by large overlapping title text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["hero-image","overlap","minimal"],"avoid":["Text-heavy content","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Impactful visual intros"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Atmospheric main cover image","bbox":[0.0,0.13,0.56,0.74],"priority":1}]}
- section: {"id":"section-primary","composition":"Two-tone split background with left-aligned text and a right-aligned vertical list featuring square icon blocks.","zones":["Two-tone split background with left-aligned text and a right-aligned vertical list featuring square icon blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["split-background","icon-list","features"],"avoid":["Long paragraphs","Large continuous text","copying source assets, source text, or an exact source arrangement"],"best_for":["Service lists","Feature highlights","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Centered vertical image strip dividing the slide, flanked by a 3x3 square motif and large title on the left, and body text on the right.","zones":["Centered vertical image strip dividing the slide, flanked by a 3x3 square motif and large title on the left, and body text on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["vertical-split","central-image","grid-motif"],"avoid":["Complex data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","High-level introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-column","purpose":"Contextual vertical image","bbox":[0.31,0.0,0.23,1.0],"priority":1}]},{"id":"content-comparison","composition":"Diagonal composition with two staggered portrait images, each featuring an overlapping solid-color name card.","zones":["Diagonal composition with two staggered portrait images, each featuring an overlapping solid-color name card."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["team","staggered-layout","cards"],"avoid":["Heavy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product comparisons","Case study previews"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"profile-left","purpose":"First subject image","bbox":[0.05,0.33,0.22,0.6],"priority":1},{"id":"profile-right","purpose":"Second subject image","bbox":[0.74,0.05,0.22,0.62],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Floating accent-colored title block on the left, interacting with a vertical watermark, paired with three distinct vertical statistics on the right.","zones":["Floating accent-colored title block on the left, interacting with a vertical watermark, paired with three distinct vertical statistics on the right."],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["stats","floating-card","vertical-text"],"avoid":["Complex charts","Detailed tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics","Milestones","Data highlights"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered vertical image strip dividing the slide, flanked by a 3x3 square motif and large title on the left, and body text on the right.","zones":["Centered vertical image strip dividing the slide, flanked by a 3x3 square motif and large title on the left, and body text on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["vertical-split","central-image","grid-motif"],"avoid":["Complex data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","High-level introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-column","purpose":"Contextual vertical image","bbox":[0.31,0.0,0.23,1.0],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Left-aligned wide image crossing into a central vertical accent band, with large 'Thanks' text overlapping both.","zones":["Left-aligned wide image crossing into a central vertical accent band, with large 'Thanks' text overlapping both."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Recurring 3x3 small square grid motif","Floating, overlapping solid color rectangles","Large vertical typographic watermarks"],"optional_variants":["closing","overlap","minimal"],"avoid":["Any new information or data","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact info","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-image","purpose":"Final atmospheric image","bbox":[0.0,0.18,0.57,0.6],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images used as stark, unbordered geometric blocks.
- Frequent use of vertical sliver crops or floating rectangular photos.
- Mockup frames (like laptops) used sparingly for digital context.

【图标与装饰】
- Minimalist line-art icons centered in stark, solid-color square bounding boxes.

【数据页构图】
- Floating accent-colored title block on the left, interacting with a vertical watermark, paired with three distinct vertical statistics on the right.

【图表风格】
- Flat, hard-edged column charts with colors directly mapped to the core palette (charcoal, light blue, grey).
- Minimal axes, clean gridlines, sans-serif legends below the chart.

【章节页构图】
- Two-tone split background with left-aligned text and a right-aligned vertical list featuring square icon blocks.

【收尾页构图】
- Left-aligned wide image crossing into a central vertical accent band, with large 'Thanks' text overlapping both.

【禁止】
- Avoid centering all content; the layout relies on asymmetry.
- Do not use rounded corners or drop shadows; maintain flat, sharp geometry.
- Avoid highly complex images behind text without adjusting overlap zones for contrast.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Modern corporate overviews、Design or architecture agency pitches、Minimalist product showcases。
