# 莫兰迪风格PPT (4) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-4-349295b8

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-4-349295b8

## 风格名称
莫兰迪风格PPT (4) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-4-349295b8

## 风格描述
An editorial, magazine-style presentation featuring aggressive white space, stark red and yellow accents, and strict rectangular image masking.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White background dominance; high-contrast primary red for solid shapes and typography brackets; yellow for textured accent strokes; black for text.
- fonts: Highly stylized brush script for display, calligraphic serif for primary headings, standard sans-serif for body copy.
- spacing: Generous asymmetrical white space offsetting dense, heavy rectangular image blocks.
- shape_language: Strict, sharp-edged rectangles for images and solid blocks; perfect circles used sparingly as backgrounds or bullets; distressed organic brush strokes.
- texture: Flat solid colors contrasted with digital paint brush textures.
- grid: Modular, asymmetrical grid with frequent edge-bleeding elements.
- motion_or_depth: Strictly flat with layered overlaps (text over shapes, shapes over images).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (4) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-4-349295b8」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial, magazine-style presentation featuring aggressive white space, stark red and yellow accents, and strict rectangular image masking.
- 推荐配色：#FFFFFF、#D32F2F、#F2A900、#000000

【不可丢失的风格锚点】
- Partial red rectangular brackets framing text
- Textured yellow brush stroke accents
- Solid red geometric blocks and circles
- Asymmetrical masonry image grids bleeding to edges

【字体】
- Use rotated sans-serif text on the extreme left margin for framing.
- Frame primary section titles with a 2-sided or 3-sided thin red rectangular border.
- Maintain strict separation between the highly decorative display text and standard body copy to preserve legibility.

【封面页构图】
- Asymmetrical split with rotated margin text, layered geometric shapes, and a right-aligned cutout hero image.

【内容页构图】
- Left-aligned text and progress bars balanced by a right-aligned vertical image bounded by a solid red edge block.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with rotated margin text, layered geometric shapes, and a right-aligned cutout hero image.","zones":["Asymmetrical split with rotated margin text, layered geometric shapes, and a right-aligned cutout hero image."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["cover","split-layout","bold-typography","cutout-image"],"avoid":["Data-heavy introductions","Standard corporate titles","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Bold introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-cutout","purpose":"Replaceable cutout hero portrait","bbox":[0.6,0.1,0.4,0.9],"priority":1}]}
- section: {"id":"section-primary","composition":"Three-column layout: left text list, center vertical image stack, right solid color block with centered text.","zones":["Three-column layout: left text list, center vertical image stack, right solid color block with centered text."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["three-column","image-column","solid-block"],"avoid":["Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Mission statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-top-image","purpose":"Replaceable square/landscape image","bbox":[0.44,0.1,0.22,0.25],"priority":1},{"id":"center-mid-image","purpose":"Replaceable square/landscape image","bbox":[0.44,0.38,0.22,0.25],"priority":2},{"id":"center-bottom-image","purpose":"Replaceable square/landscape image","bbox":[0.44,0.65,0.22,0.25],"priority":3}]}
- content: [{"id":"content-content","composition":"Left-aligned text and progress bars balanced by a right-aligned vertical image bounded by a solid red edge block.","zones":["Left-aligned text and progress bars balanced by a right-aligned vertical image bounded by a solid red edge block."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["text-with-image","progress-bars","asymmetrical"],"avoid":["Complex charts","Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Feature highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-vertical-image","purpose":"Replaceable editorial portrait or feature image","bbox":[0.55,0.15,0.3,0.7],"priority":1}]},{"id":"content-comparison","composition":"Left-aligned stacked horizontal images bleeding off-edge, right-aligned text grid with pill-shaped labels.","zones":["Left-aligned stacked horizontal images bleeding off-edge, right-aligned text grid with pill-shaped labels."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["image-stack","text-grid","pill-labels"],"avoid":["Single-focus narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-left-image","purpose":"Replaceable landscape image","bbox":[0.05,0.15,0.35,0.35],"priority":1},{"id":"bottom-left-image","purpose":"Replaceable landscape image","bbox":[0.05,0.5,0.35,0.35],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned text and progress bars balanced by a right-aligned vertical image bounded by a solid red edge block.","zones":["Left-aligned text and progress bars balanced by a right-aligned vertical image bounded by a solid red edge block."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["text-with-image","progress-bars","asymmetrical"],"avoid":["Complex charts","Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Feature highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-vertical-image","purpose":"Replaceable editorial portrait or feature image","bbox":[0.55,0.15,0.3,0.7],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned stacked horizontal images bleeding off-edge, right-aligned text grid with pill-shaped labels.","zones":["Left-aligned stacked horizontal images bleeding off-edge, right-aligned text grid with pill-shaped labels."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["image-stack","text-grid","pill-labels"],"avoid":["Single-focus narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-left-image","purpose":"Replaceable landscape image","bbox":[0.05,0.15,0.35,0.35],"priority":1},{"id":"bottom-left-image","purpose":"Replaceable landscape image","bbox":[0.05,0.5,0.35,0.35],"priority":2}]}]
- quote: {"id":"quote-primary","composition":"Extreme asymmetrical layout with scattered rectangular blocks (images, color, black numbering square) and vast empty white space.","zones":["Extreme asymmetrical layout with scattered rectangular blocks (images, color, black numbering square) and vast empty white space."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["extreme-negative-space","scattered-blocks","numbering"],"avoid":["Standard content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Section transitions"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"top-left-landscape","purpose":"Replaceable landscape image","bbox":[0.0,0.05,0.6,0.4],"priority":1},{"id":"bottom-left-square","purpose":"Replaceable square image","bbox":[0.0,0.5,0.25,0.45],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Identical structure to the cover page but with severe text clipping at the bottom edge.","zones":["Identical structure to the cover page but with severe text clipping at the bottom edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Partial red rectangular brackets framing text","Textured yellow brush stroke accents","Solid red geometric blocks and circles"],"optional_variants":["closing","cutout-image","broken-typography"],"avoid":["Any slide requiring legible text at the bottom","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero-cutout","purpose":"Replaceable cutout hero portrait","bbox":[0.6,0.1,0.4,0.9],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use strict, sharp-cornered rectangular crops.
- Bleed images off the edges of the slide canvas.
- Pair distinct rectangular image blocks side-by-side without gaps (masonry style).

【图标与装饰】
- Minimal use of thin, outlined geometric icons (e.g., globe, arrows).

【数据页构图】
- Left-aligned text and progress bars balanced by a right-aligned vertical image bounded by a solid red edge block.

【图表风格】
- Use flat, horizontal bar charts with a monochromatic colored fill representing progress.

【章节页构图】
- Three-column layout: left text list, center vertical image stack, right solid color block with centered text.

【收尾页构图】
- Identical structure to the cover page but with severe text clipping at the bottom edge.

【禁止】
- Do not use rounded corners on images or shapes.
- Avoid standard stock photography; the template demands highly stylized, textured, or editorial imagery.
- Do not overlap script/display fonts over complex backgrounds where legibility is lost.
- Avoid clipping text off the bottom edge of the canvas.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or editorial lookbooks、Art and design portfolios、Avant-garde agency credentials。
