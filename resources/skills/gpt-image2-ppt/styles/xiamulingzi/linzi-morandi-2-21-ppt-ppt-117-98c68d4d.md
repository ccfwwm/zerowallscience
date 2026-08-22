# 117 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-117-98c68d4d

## 风格ID
linzi-morandi-2-21-ppt-ppt-117-98c68d4d

## 风格名称
117 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-117-98c68d4d

## 风格描述
A modern, minimalist presentation template featuring organic abstract shapes, floating content cards, and a muted earthy Morandi color palette.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Warm beige background with olive, mustard, and dusty brown accents used for vector shapes and primary text.
- fonts: Clean sans-serif fonts with distinct weight and size contrasts for headers vs body.
- spacing: Generous margins, airy composition, allowing background shapes to frame the content.
- shape_language: Organic, amorphous blobs and continuous curved strokes mixed with strict rectangular image bounds.
- texture: Flat vectors, no gradients or shadows, pure matte colors.
- grid: Centered alignments for titles; multi-column structural grids within white overlay cards for content.
- motion_or_depth: Flat design with overlapping vector layers (lines over blobs) to create subtle 2D depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「117 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-117-98c68d4d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, minimalist presentation template featuring organic abstract shapes, floating content cards, and a muted earthy Morandi color palette.
- 推荐配色：#F7F2E6、#8B9A77、#E1C67E、#987267

【不可丢失的风格锚点】
- Organic overlapping blob shapes in corners/edges
- Thin sweeping curved lines intersecting with solid shapes
- Muted, low-saturation earthy color palette
- Floating white content cards over patterned backgrounds

【字体】
- Use theme colors (olive/brown) for major headings to tie into the palette.
- Employ distinct size hierarchies, keeping body text small and airy.
- Center-align titles on section covers, left-align within content cards.

【封面页构图】
- Centered prominent title with horizontal divider lines, flanked by large overlapping organic blobs and curved strokes in corners.

【内容页构图】
- White content card overlaying patterned background. Left column for main text, center column for vertically stacked images, right column for icon-led text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered prominent title with horizontal divider lines, flanked by large overlapping organic blobs and curved strokes in corners.","zones":["Centered prominent title with horizontal divider lines, flanked by large overlapping organic blobs and curved strokes in corners."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["cover","minimal","organic"],"avoid":["Data heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Opening remarks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered section number and title, body text below, framed by asymmetric organic shapes on left and right.","zones":["Centered section number and title, body text below, framed by asymmetric organic shapes on left and right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["section","centered","asymmetric"],"avoid":["Complex content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"White content card overlaying patterned background. Left column for main text, center column for vertically stacked images, right column for icon-led text blocks.","zones":["White content card overlaying patterned background. Left column for main text, center column for vertically stacked images, right column for icon-led text blocks."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["multi-column","image-stack","content-card"],"avoid":["Single large charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Company overview","Service highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img1","purpose":"Vertical stack top image","bbox":[0.35,0.05,0.3,0.45],"priority":1},{"id":"img2","purpose":"Vertical stack bottom image","bbox":[0.35,0.5,0.3,0.45],"priority":2}]},{"id":"content-comparison","composition":"White content card overlay. Left side features a large rectangular image. Right side features two equal columns of text, each topped with a centered icon and separated by horizontal lines.","zones":["White content card overlay. Left side features a large rectangular image. Right side features two equal columns of text, each topped with a centered icon and separated by horizontal lines."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["image-left","text-columns","comparison"],"avoid":["Timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Team profiles","Comparisons"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"left_img","purpose":"Feature image","bbox":[0.06,0.28,0.29,0.57],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"White content card overlay. Serpentine timeline using thick colored arrows, starting from a target and ending with a dart, with text nodes at each turn.","zones":["White content card overlay. Serpentine timeline using thick colored arrows, starting from a target and ending with a dart, with text nodes at each turn."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["process","timeline","serpentine"],"avoid":["Unordered lists","Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process flows","Step-by-step guides"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered section number and title, body text below, framed by asymmetric organic shapes on left and right.","zones":["Centered section number and title, body text below, framed by asymmetric organic shapes on left and right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["section","centered","asymmetric"],"avoid":["Complex content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing statement and subtitle, flanked by large overlapping organic blobs and curved strokes in corners.","zones":["Centered closing statement and subtitle, flanked by large overlapping organic blobs and curved strokes in corners."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic overlapping blob shapes in corners/edges","Thin sweeping curved lines intersecting with solid shapes","Muted, low-saturation earthy color palette"],"optional_variants":["closing","minimal","organic"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A","Thank you slide","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Place images within clean rectangular bounds to contrast with the organic background shapes.
- Use images with bright, airy lighting and minimal clutter to complement the muted Morandi palette.
- Avoid complex masking or rounded corners on photos.

【图标与装饰】
- Simple, flat, single-color icons matching the theme palette.
- Use icons as anchors for text columns or timeline steps.

【数据页构图】
- White content card overlay. Serpentine timeline using thick colored arrows, starting from a target and ending with a dart, with text nodes at each turn.

【图表风格】
- Flat vector graphics without shadows or 3D effects.
- Flowcharts use thick, rounded continuous lines.
- Infographics rely on thematic vector illustrations grouped by color and size.

【章节页构图】
- Centered section number and title, body text below, framed by asymmetric organic shapes on left and right.

【收尾页构图】
- Centered closing statement and subtitle, flanked by large overlapping organic blobs and curved strokes in corners.

【禁止】
- Do not use stark white backgrounds as the base layer; stick to the warm beige.
- Avoid sharp geometric shapes (triangles, harsh polygons) as primary background decorations.
- No drop shadows or 3D effects on vector elements.
- Do not use highly saturated or neon colors.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Lifestyle or wellness brand pitches、Modern HR or team summaries、Minimalist project updates。
