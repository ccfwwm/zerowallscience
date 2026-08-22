# 86 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-86-9bea9e12

## 风格ID
linzi-morandi-2-21-ppt-ppt-86-9bea9e12

## 风格名称
86 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-86-9bea9e12

## 风格描述
A minimalist, editorial-style presentation framework featuring strict rectangular grid alignments, persistent marginalia, and muted pastel accent colors.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light gray/off-white background canvas, high-contrast dark gray text, and saturated pastel accents (salmon, soft blue, mustard) used strictly for data and typographic highlights.
- fonts: Bold, clean sans-serif for dominant headers; ultra-light, highly legible sans-serif for body copy with generous line height.
- spacing: High negative space, particularly at the top of content slides and along the left bounding margin.
- shape_language: Strictly rectangular and orthogonal. No border radii, circles used exclusively for icons or pie charts.
- texture: Completely flat UI elements contrasted against high-resolution photographic textures in designated content zones.
- grid: Modular multi-column grid, frequently bisected horizontally to separate header text from galleries or body content.
- motion_or_depth: Absolutely flat. Depth is achieved purely through overlap of flat geometric planes onto photography.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「86 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-86-9bea9e12」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, editorial-style presentation framework featuring strict rectangular grid alignments, persistent marginalia, and muted pastel accent colors.
- 推荐配色：#F4F4F4、#222222、#F08C8C、#4A80F0、#F5A623、#9B9B9B

【不可丢失的风格锚点】
- Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.
- Top-right horizontal black stroke acting as a consistent page anchor.
- Strict 90-degree sharp corners on all image masks and layout blocks.
- Flat, borderless data visualizations using the core accent palette.

【字体】
- Headers are bold, tightly tracked, and occasionally color-coded to emphasize specific words.
- Body text blocks are set in a light weight with high line-height to maintain an airy, editorial feel.
- Structural text (like the left margin anchor) is rotated 90 degrees counter-clockwise.

【封面页构图】
- Full-bleed background image with absolute-centered giant typography and subtle supporting text below.

【内容页构图】
- Split layout: left column text with icon indicators, right column flush rectangular image.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with absolute-centered giant typography and subtle supporting text below.","zones":["Full-bleed background image with absolute-centered giant typography and subtle supporting text below."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.","Top-right horizontal black stroke acting as a consistent page anchor.","Strict 90-degree sharp corners on all image masks and layout blocks."],"optional_variants":["hero","minimal","centered"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Section breaker"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg_hero","purpose":"Full bleed background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Left typographic lockup with color emphasis, right side featuring three identical vertical image columns (triptych).","zones":["Left typographic lockup with color emphasis, right side featuring three identical vertical image columns (triptych)."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.","Top-right horizontal black stroke acting as a consistent page anchor.","Strict 90-degree sharp corners on all image masks and layout blocks."],"optional_variants":["triptych","gallery","header-left"],"avoid":["Narrative text","copying source assets, source text, or an exact source arrangement"],"best_for":["Team members","Product highlights","Partner logos/images"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"col_1","purpose":"Gallery item 1","bbox":[0.2,0.29,0.59,0.23],"priority":1},{"id":"col_2","purpose":"Gallery item 2","bbox":[0.2,0.53,0.59,0.23],"priority":2},{"id":"col_3","purpose":"Gallery item 3","bbox":[0.2,0.77,0.59,0.23],"priority":3}]}
- content: [{"id":"content-content","composition":"Split layout: left column text with icon indicators, right column flush rectangular image.","zones":["Split layout: left column text with icon indicators, right column flush rectangular image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.","Top-right horizontal black stroke acting as a consistent page anchor.","Strict 90-degree sharp corners on all image masks and layout blocks."],"optional_variants":["split-layout","icon-list","text-left"],"avoid":["Heavy data","Full-width diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Services overview"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right_image","purpose":"Contextual representation","bbox":[0.2,0.4,0.8,0.6],"priority":1}]},{"id":"content-comparison","composition":"Large left-aligned vertical image block, right-aligned text blocks separated by wide gaps and an icon marker.","zones":["Large left-aligned vertical image block, right-aligned text blocks separated by wide gaps and an icon marker."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.","Top-right horizontal black stroke acting as a consistent page anchor.","Strict 90-degree sharp corners on all image masks and layout blocks."],"optional_variants":["image-left","spacious-text"],"avoid":["Dense lists","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Brand storytelling","Quotes"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left_hero","purpose":"Main visual","bbox":[0.17,0.12,0.83,0.31],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Two identical vertical image slices on the left, flat bar chart with a title on the right.","zones":["Two identical vertical image slices on the left, flat bar chart with a title on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.","Top-right horizontal black stroke acting as a consistent page anchor.","Strict 90-degree sharp corners on all image masks and layout blocks."],"optional_variants":["data-chart","image-slices","bar-chart"],"avoid":["Long text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Data comparisons","Metric highlights paired with visual context"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"slice_1","purpose":"Visual texture","bbox":[0.21,0.09,0.79,0.18],"priority":1},{"id":"slice_2","purpose":"Visual texture","bbox":[0.21,0.3,0.79,0.18],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split layout: left column text with icon indicators, right column flush rectangular image.","zones":["Split layout: left column text with icon indicators, right column flush rectangular image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Persistent left-margin spine: bottom-aligned solid black square with 90-degree rotated vertical text extending upwards.","Top-right horizontal black stroke acting as a consistent page anchor.","Strict 90-degree sharp corners on all image masks and layout blocks."],"optional_variants":["split-layout","icon-list","text-left"],"avoid":["Heavy data","Full-width diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Services overview"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right_image","purpose":"Contextual representation","bbox":[0.2,0.4,0.8,0.6],"priority":1}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Edge-to-edge full bleed on covers.
- Unframed, sharp rectangular crops on content pages.
- Frequent use of vertical 'triptych' splits or asymmetrical masonry grids for galleries.

【图标与装饰】
- Minimalist, high-contrast. Icons are often placed in negative space within solid black circles or used as flat vector glyphs.

【数据页构图】
- Two identical vertical image slices on the left, flat bar chart with a title on the right.

【图表风格】
- Extremely flat data visualization.
- No borders or strokes on bars; thin white strokes separate pie chart segments.
- Minimalist axes with only faint horizontal grid lines and no bounding boxes.

【章节页构图】
- Left typographic lockup with color emphasis, right side featuring three identical vertical image columns (triptych).

【收尾页构图】
- Full-bleed background image with absolute-centered giant typography and subtle supporting text below.

【禁止】
- Avoid rounded corners on images or shapes.
- Avoid drop shadows or 3D effects.
- Avoid centering body text; maintain strict left-alignment within designated grid columns.
- Avoid breaking the left-margin spine structure on content slides.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Editorial lookbooks、Agency portfolios、Minimalist corporate reports、Data-driven strategic overviews。
