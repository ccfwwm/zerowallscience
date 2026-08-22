# 莫兰迪风尚 (14) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-14-1678fc3d

## 风格ID
linzi-morandi-2-21-40ppt-ppt-14-1678fc3d

## 风格名称
莫兰迪风尚 (14) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-14-1678fc3d

## 风格描述
A sophisticated, minimalist presentation system featuring a muted Morandi color palette, clean geometric layouts, and high-contrast typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Forest green and dusty rose as primary structural elements; warm beige and white as foundational backgrounds.
- fonts: Brush script for primary headers to provide organic contrast; clean, geometric sans-serif for body text.
- spacing: Wide margins and generous padding within content blocks; distinct separation between structural elements.
- shape_language: Perfectly rectangular image frames and solid color blocks; occasional perfect circles for icons and charts.
- texture: Completely flat, solid colors with zero gradients, drop shadows, or 3D effects.
- grid: Flexible modular grid supporting 2-column, 3-column, and asymmetrical split layouts.
- motion_or_depth: Flat depth profile; visual interest is created through color contrast and overlapping flat geometric planes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (14) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-14-1678fc3d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, minimalist presentation system featuring a muted Morandi color palette, clean geometric layouts, and high-contrast typography.
- 推荐配色：#4b6455、#d68f80、#eedcc6、#ffffff、#595959

【不可丢失的风格锚点】
- Muted, earthy color palette with high-contrast accent blocks
- Expressive brush script paired with neutral sans-serif typography
- Strictly orthogonal geometric layouts with solid color blocking
- Generous, asymmetrical negative space

【字体】
- Use script fonts exclusively for large headers or brief accent words.
- Maintain strict left or center alignment for body copy depending on the bounding container.
- Use dark gray, not pure black, for body text to soften contrast.

【封面页构图】
- Solid background with asymmetrical two-column layout: square image left, layered text and accent block right.

【内容页构图】
- Symmetrical three-column layout with centered circular focal points over text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Solid background with asymmetrical two-column layout: square image left, layered text and accent block right.","zones":["Solid background with asymmetrical two-column layout: square image left, layered text and accent block right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["cover","split-layout","dark-mode"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","High-impact visual introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"hero brand imagery","bbox":[0.14,0.17,0.31,0.55],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical split layout: large vertical image anchored left, right-aligned accent bar, central text block.","zones":["Asymmetrical split layout: large vertical image anchored left, right-aligned accent bar, central text block."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["section-divider","left-image","minimal"],"avoid":["Detailed content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section dividers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-hero","purpose":"thematic section image","bbox":[0.06,0.24,0.29,0.64],"priority":1}]}
- content: [{"id":"content-content","composition":"Symmetrical three-column layout with centered circular focal points over text blocks.","zones":["Symmetrical three-column layout with centered circular focal points over text blocks."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["3-column","icon-grid","symmetrical"],"avoid":["Long paragraphs","Complex data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Features lists","Core values","Three-step processes"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Horizontal split background with three-column text grid and one overlapping image anchored to the left.","zones":["Horizontal split background with three-column text grid and one overlapping image anchored to the left."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["horizontal-split","3-column","overlapping-image"],"avoid":["Full-bleed photography","Single focused message","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Team profiles","Product features"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"feature-image","purpose":"supporting context image","bbox":[0.1,0.46,0.17,0.31],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Two-column layout: left column contains framed text block and horizontal chart row; right column contains text list with vertical separator.","zones":["Two-column layout: left column contains framed text block and horizontal chart row; right column contains text list with vertical separator."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["split-content","metrics","framed-text"],"avoid":["Dense financial tables","Complex multi-axis charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Process highlights","Statistical summaries"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical split layout: large vertical image anchored left, right-aligned accent bar, central text block.","zones":["Asymmetrical split layout: large vertical image anchored left, right-aligned accent bar, central text block."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["section-divider","left-image","minimal"],"avoid":["Detailed content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section dividers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-hero","purpose":"thematic section image","bbox":[0.06,0.24,0.29,0.64],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Solid background with asymmetrical two-column layout: square image left, prominent typographic focal point right.","zones":["Solid background with asymmetrical two-column layout: square image left, prominent typographic focal point right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy color palette with high-contrast accent blocks","Expressive brush script paired with neutral sans-serif typography","Strictly orthogonal geometric layouts with solid color blocking"],"optional_variants":["closing","split-layout","dark-mode"],"avoid":["Summary bullet points","New information","copying source assets, source text, or an exact source arrangement"],"best_for":["Final slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-image","purpose":"memorable exit visual","bbox":[0.09,0.17,0.31,0.55],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Crop images to strict rectangular or square aspect ratios without border radii.
- Anchor images flush to slide edges or within precise color-blocked frames.
- Do not apply photographic filters or drop shadows.

【图标与装饰】
- Use minimalist, monoline white icons.
- House icons within perfect circles filled with solid palette colors.

【数据页构图】
- Two-column layout: left column contains framed text block and horizontal chart row; right column contains text list with vertical separator.

【图表风格】
- Utilize simple, thin-stroke donut charts for percentage metrics.
- Color-code chart progress strokes using the primary green palette color.

【章节页构图】
- Asymmetrical split layout: large vertical image anchored left, right-aligned accent bar, central text block.

【收尾页构图】
- Solid background with asymmetrical two-column layout: square image left, prominent typographic focal point right.

【禁止】
- Do not use drop shadows, gradients, or 3D layer effects.
- Avoid bright, saturated, or primary colors.
- Do not use complex or organic bounding shapes for layouts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lifestyle brand pitches、Boutique agency portfolios、Interior design or architecture presentations、Lookbooks and mood boards。
