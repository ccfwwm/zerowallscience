# 8 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-8-0f71568d

## 风格ID
linzi-morandi-2-21-ppt-ppt-8-0f71568d

## 风格名称
8 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-8-0f71568d

## 风格描述
An elegant, minimalist presentation style featuring earthy color blocking, stark geometric shapes, and distinctive brush-script typography accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Forest green serves as the primary grounding background, with dusty salmon and white as alternating canvas sections. Beige acts as a soft accent for borders.
- fonts: Expressive, horizontal brush script for primary display titles; clean, neutral sans-serif (e.g., Arial/Helvetica) for body copy and data.
- spacing: Generous, breathable margins with content often constrained to strict horizontal halves or thirds. High whitespace around text blocks.
- shape_language: Strictly orthogonal. Sharp corners on all image slots and background panels. Perfect circles used exclusively for icons and charts.
- texture: Flat, matte solid colors. Zero gradients or drop shadows (except for solid offset-shape shadows).
- grid: Symmetrical 2-column and 3-column splits, often interrupted intentionally by bridging image containers.
- motion_or_depth: Depth is created entirely through planar layering—images overlapping solid background color intersections.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「8 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-8-0f71568d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation style featuring earthy color blocking, stark geometric shapes, and distinctive brush-script typography accents.
- 推荐配色：#496455、#CF8B7F、#EFE6D5、#FFFFFF、#BFB888

【不可丢失的风格锚点】
- Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)
- Sharp, unrounded image containers often intersecting background color boundaries
- Expressive brush script headers paired with neutral sans-serif body text
- Vertical accent stripes framing slide edges or title groups

【字体】
- Use script/brush fonts solely for large aesthetic headers or minimal key phrases.
- Body text must remain clean, low-weight sans-serif.
- Maintain high line-height (1.4+) for paragraph text.
- Utilize vertical text orientation sparingly for decorative edge framing.

【封面页构图】
- Dark primary background with contrasting bottom border, square image left, large stylized title right with highlight box.

【内容页构图】
- Centered header above a symmetric 3-column layout featuring solid-color circular icons and paragraph text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Dark primary background with contrasting bottom border, square image left, large stylized title right with highlight box.","zones":["Dark primary background with contrasting bottom border, square image left, large stylized title right with highlight box."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["split-cover","highlight-box","accent-stripe"],"avoid":["Heavy data","Multiple authors","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Event cover"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-left","purpose":"Primary cover visual","bbox":[0.14,0.17,0.31,0.55],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical split. Vertical image left overlapping a stark white right background. Decorative vertical text on the right edge.","zones":["Asymmetrical split. Vertical image left overlapping a stark white right background. Decorative vertical text on the right edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["section-divider","vertical-edge","offset-button"],"avoid":["Complex lists","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter title","New section introduction"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-image","purpose":"Section thematic visual","bbox":[0.06,0.24,0.28,0.64],"priority":1}]}
- content: [{"id":"content-content","composition":"Centered header above a symmetric 3-column layout featuring solid-color circular icons and paragraph text.","zones":["Centered header above a symmetric 3-column layout featuring solid-color circular icons and paragraph text."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["3-column","icon-grid","centered-layout"],"avoid":["Long form text","Detailed workflows","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Value propositions","Service pillars"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Split horizontal background (dark top, white bottom). Inner white card housing a left-aligned image followed by three staggered horizontal text groups.","zones":["Split horizontal background (dark top, white bottom). Inner white card housing a left-aligned image followed by three staggered horizontal text groups."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["horizontal-timeline","overlap-card"],"avoid":["Large dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Team profiles"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"inline-square","purpose":"Accompanying thumbnail","bbox":[0.1,0.45,0.17,0.31],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Two-column mixed content. Left column features an outlined text container above three mini donut charts. Right column features a vertical line accent and bulleted text.","zones":["Two-column mixed content. Left column features an outlined text container above three mini donut charts. Right column features a vertical line accent and bulleted text."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["donut-charts","split-columns","outlined-box"],"avoid":["Large impactful imagery","Simple quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Performance metrics","Executive summaries","Mixed data and text"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical split. Vertical image left overlapping a stark white right background. Decorative vertical text on the right edge.","zones":["Asymmetrical split. Vertical image left overlapping a stark white right background. Decorative vertical text on the right edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["section-divider","vertical-edge","offset-button"],"avoid":["Complex lists","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter title","New section introduction"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-image","purpose":"Section thematic visual","bbox":[0.06,0.24,0.28,0.64],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Dark primary background with contrasting bottom border, square image left, large stylized closing title right with highlight box.","zones":["Dark primary background with contrasting bottom border, square image left, large stylized closing title right with highlight box."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy split-color backgrounds (forest green, dusty salmon, beige)","Sharp, unrounded image containers often intersecting background color boundaries","Expressive brush script headers paired with neutral sans-serif body text"],"optional_variants":["closing-split","bookend"],"avoid":["Body content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-hero","purpose":"Final brand visual","bbox":[0.08,0.16,0.31,0.55],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Strictly sharp corners (0px border radius).
- No borders or outer strokes.
- Position images to straddle the line between two different background color blocks to enhance depth.
- Use a solid background rectangle behind an image, slightly offset, to create a pseudo-shadow effect.

【图标与装饰】
- Minimalist linear white icons centered inside solid-colored perfect circles.
- Icon backgrounds should draw from the secondary palette (salmon, tan, green).

【数据页构图】
- Two-column mixed content. Left column features an outlined text container above three mini donut charts. Right column features a vertical line accent and bulleted text.

【图表风格】
- Ultra-minimalist donut charts using thin strokes.
- Monochrome data segments (dark green) against faint grey tracks.
- Values centered clearly inside the donuts.

【章节页构图】
- Asymmetrical split. Vertical image left overlapping a stark white right background. Decorative vertical text on the right edge.

【收尾页构图】
- Dark primary background with contrasting bottom border, square image left, large stylized closing title right with highlight box.

【禁止】
- No rounded corners on layout blocks or images.
- No gradient backgrounds or glowing drop shadows.
- Do not use script font for body copy or small text.
- Avoid heavily saturated or neon colors; strictly adhere to muted/dusty tones.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Interior design or architectural proposals、Lifestyle brand pitch decks、Editorial style business reports、Artistic or creative agency introductions。
