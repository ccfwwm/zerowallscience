# 莫兰迪风格PPT (32) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-32-75711782

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-32-75711782

## 风格名称
莫兰迪风格PPT (32) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-32-75711782

## 风格描述
An editorial, minimalist presentation featuring stark monochrome contrasts, typewriter typography, and highly structured grid layouts with a persistent vertical left-margin anchor.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Absolute white backgrounds with deep charcoal/black text and solid accents. Color is introduced exclusively through photography.
- fonts: Typewriter/Slab-serif for primary titles, labels, and accents (Courier/Roboto Slab style). Clean Sans-serif for body copy.
- spacing: Generous asymmetrical margins, with an oversized left margin to house the vertical structural text. Ample whitespace between grid quadrants.
- shape_language: Strictly orthogonal. Sharp corners, pure rectangles. Zero border radius.
- texture: Flat, matte, high-contrast. No gradients, shadows, or 3D effects.
- grid: Modular editorial grid. Commonly split into 3-column, 4-column, or asymmetrical 50/50 horizontal splits.
- motion_or_depth: Extremely flat, relying on solid-color box overlaps (black over image, white over image) to create a subtle z-index layering.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (32) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-32-75711782」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial, minimalist presentation featuring stark monochrome contrasts, typewriter typography, and highly structured grid layouts with a persistent vertical left-margin anchor.
- 推荐配色：#FFFFFF、#2A2A2A、#F5F5F5

【不可丢失的风格锚点】
- Persistent vertical text running down the far-left margin of almost every content slide
- Stark, overlapping dark rectangular label boxes intersecting images or white space
- High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text
- Rigid, unbordered, sharp-edged rectangular image containers

【字体】
- Headings: Bold, all-caps, typewriter/monospace font, highly tracked.
- Body: Left-aligned, sentence case, sans-serif, standard leading.
- Vertical Anchor: Left-aligned, spaced-out all-caps text rotated 90-degrees counter-clockwise.
- Labels: White all-caps text inset inside solid black rectangular boxes.

【封面页构图】
- Off-center background plate heavily masked by a massive white rectangular overlay, featuring a dominant bold typewriter title and small label box.

【内容页构图】
- Asymmetrical horizontal bands of imagery overlaid with contrasting text boxes (white box on top image, dark box on bottom image).

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Off-center background plate heavily masked by a massive white rectangular overlay, featuring a dominant bold typewriter title and small label box.","zones":["Off-center background plate heavily masked by a massive white rectangular overlay, featuring a dominant bold typewriter title and small label box."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["minimal-cover","typography-focus","asymmetrical"],"avoid":["Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Cover slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-accent","purpose":"background texture peeking through edges","bbox":[0.0,0.0,1.0,1.0],"priority":2}]}
- section: {"id":"section-primary","composition":"Left vertical text axis with four subsequent columns: three identical image+text stacks and one bordered text-only box.","zones":["Left vertical text axis with four subsequent columns: three identical image+text stacks and one bordered text-only box."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["4-column","editorial-grid","bordered-box"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product features","Process steps"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"col1-img","purpose":"column top image","bbox":[0.12,0.2,0.19,0.23],"priority":1},{"id":"col2-img","purpose":"column top image","bbox":[0.32,0.2,0.19,0.23],"priority":1},{"id":"col3-img","purpose":"column top image","bbox":[0.52,0.2,0.19,0.23],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetrical horizontal bands of imagery overlaid with contrasting text boxes (white box on top image, dark box on bottom image).","zones":["Asymmetrical horizontal bands of imagery overlaid with contrasting text boxes (white box on top image, dark box on bottom image)."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["horizontal-split","overlapping-boxes","contrast"],"avoid":["Complex data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Statement slides","Moodboards"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-band","purpose":"top background layer","bbox":[0.1,0.15,0.9,0.35],"priority":1},{"id":"bottom-band","purpose":"bottom background layer","bbox":[0.1,0.5,0.9,0.35],"priority":1}]},{"id":"content-comparison","composition":"Left text column paired with a tightly packed 2x3 photographic grid on the right, featuring faded background typography behind the primary text.","zones":["Left text column paired with a tightly packed 2x3 photographic grid on the right, featuring faded background typography behind the primary text."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["image-grid","watermark-text","split-layout"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Portfolios","Gallery views","Concept introductions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"grid-1","purpose":"collage tile","bbox":[0.48,0.15,0.16,0.35],"priority":2},{"id":"grid-2","purpose":"collage tile","bbox":[0.64,0.15,0.16,0.35],"priority":2},{"id":"grid-3","purpose":"collage tile","bbox":[0.8,0.15,0.16,0.35],"priority":2},{"id":"grid-4","purpose":"collage tile","bbox":[0.48,0.52,0.16,0.35],"priority":2},{"id":"grid-5","purpose":"collage tile","bbox":[0.64,0.52,0.16,0.35],"priority":2},{"id":"grid-6","purpose":"collage tile","bbox":[0.8,0.52,0.16,0.35],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Left vertical text axis with four subsequent columns: three identical image+text stacks and one bordered text-only box.","zones":["Left vertical text axis with four subsequent columns: three identical image+text stacks and one bordered text-only box."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["4-column","editorial-grid","bordered-box"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product features","Process steps"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"col1-img","purpose":"column top image","bbox":[0.12,0.2,0.19,0.23],"priority":1},{"id":"col2-img","purpose":"column top image","bbox":[0.32,0.2,0.19,0.23],"priority":1},{"id":"col3-img","purpose":"column top image","bbox":[0.52,0.2,0.19,0.23],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical horizontal bands of imagery overlaid with contrasting text boxes (white box on top image, dark box on bottom image).","zones":["Asymmetrical horizontal bands of imagery overlaid with contrasting text boxes (white box on top image, dark box on bottom image)."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["horizontal-split","overlapping-boxes","contrast"],"avoid":["Complex data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Statement slides","Moodboards"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-band","purpose":"top background layer","bbox":[0.1,0.15,0.9,0.35],"priority":1},{"id":"bottom-band","purpose":"bottom background layer","bbox":[0.1,0.5,0.9,0.35],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background image heavily muted by a dark semi-transparent overlay band, framing a central bordered text lockup.","zones":["Full-bleed background image heavily muted by a dark semi-transparent overlay band, framing a central bordered text lockup."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Persistent vertical text running down the far-left margin of almost every content slide","Stark, overlapping dark rectangular label boxes intersecting images or white space","High-contrast pairing of bold typewriter/monospace headers with clean sans-serif body text"],"optional_variants":["full-bleed","centered-overlay","framed-text"],"avoid":["Detailed content","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Thank you slides","Bold statements"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero-bg","purpose":"ambient background image","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Strictly rectangular and unbordered.
- Frequently intersected by solid black typographic label boxes placed off-center.
- Used in sequential grids or as horizontal full-bleed bands.

【图标与装饰】
- No traditional icons are used; relies entirely on typographic labels and photographic content.

【数据页构图】
- Left vertical text axis with four subsequent columns: three identical image+text stacks and one bordered text-only box.

【图表风格】
- Not applicable (no data charts present); structure implies relying on text lists or photographic evidence.

【章节页构图】
- Left vertical text axis with four subsequent columns: three identical image+text stacks and one bordered text-only box.

【收尾页构图】
- Full-bleed background image heavily muted by a dark semi-transparent overlay band, framing a central bordered text lockup.

【禁止】
- Do not use rounded corners or soft shapes.
- Avoid bright or saturated interface colors; adhere to monochrome base.
- Do not center-align body copy; maintain rigid left-alignment.
- Avoid drop shadows or glossy effects.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Editorial lookbooks、Architecture or design portfolios、Minimalist brand guidelines、High-end lifestyle pitching。
