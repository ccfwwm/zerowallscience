# 15 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-15-0d966a46

## 风格ID
linzi-morandi-2-21-ppt-ppt-15-0d966a46

## 风格名称
15 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-15-0d966a46

## 风格描述
Minimalist editorial style featuring muted earthy tones, botanical watermark motifs, ample whitespace, and strict rectangular image framing.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dominant white for breathability, warm taupe/khaki for solid structural blocks, and deep black for high-contrast typography.
- fonts: Stylized, modulated sans-serif for main headings; clean geometric sans-serif for body; occasional script accents.
- spacing: Generous macro-whitespace, wide asymmetrical margins, clear separation between text zones and imagery.
- shape_language: Sharp, unrounded rectangles for image containers and color blocks, juxtaposed with fluid botanical shapes.
- texture: Flat vector silhouettes mixed with smooth solid color fills and photographic realism.
- grid: Modular, asymmetrical grid favoring vertical divisions (e.g., 1/3 to 2/3 splits) and dynamic content placement.
- motion_or_depth: Shallow, layered depth created by placing solid elements or text over the pale background watermarks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「15 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-15-0d966a46」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist editorial style featuring muted earthy tones, botanical watermark motifs, ample whitespace, and strict rectangular image framing.
- 推荐配色：#FFFFFF、#9C856C、#1A1A1A、#E0E0E0

【不可丢失的风格锚点】
- Organic, pale botanical silhouettes used as a recurring background watermark
- Strict orthogonal image crops contrasting with organic watermarks
- Muted earthy color blocking paired with extensive whitespace
- Vertical, rotated typography for secondary structural labels

【字体】
- Primary headings use a stylized display sans-serif, often with tight letter-spacing.
- Body text uses a highly legible, small-scale geometric sans-serif with high line-height.
- Secondary structural labels (e.g., page numbers, section tags) are tracked out widely and sometimes rotated vertically.
- Text alignments vary between left-aligned, right-aligned, and centered depending on the layout's center of gravity.

【封面页构图】
- Asymmetrical split with large central image, side vertical accent bar, and offset typography

【内容页构图】
- Vertical split: minimal object/image on white left, solid color block with text on right

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with large central image, side vertical accent bar, and offset typography","zones":["Asymmetrical split with large central image, side vertical accent bar, and offset typography"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["asymmetrical-cover","photo-hero","vertical-accent"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section covers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-image","purpose":"Main visual anchor","bbox":[0.33,0.12,0.59,0.76],"priority":1}]}
- section: {"id":"section-primary","composition":"Wide top image banner with split-column text below","zones":["Wide top image banner with split-column text below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["top-banner","split-text","minimalist-header"],"avoid":["Complex lists","Detailed charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Statement slides"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"banner-image","purpose":"Thematic top visual","bbox":[0.08,0.11,0.84,0.47],"priority":1}]}
- content: [{"id":"content-content","composition":"Vertical split: minimal object/image on white left, solid color block with text on right","zones":["Vertical split: minimal object/image on white left, solid color block with text on right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["color-block-split","isolated-object","text-on-color"],"avoid":["Dense data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Core messages","Product highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-isolated-image","purpose":"Minimal focal object","bbox":[0.13,0.0,0.39,1.0],"priority":1}]},{"id":"content-comparison","composition":"Split layout with color swatches on left and framed portrait with vertical typography on right color block","zones":["Split layout with color swatches on left and framed portrait with vertical typography on right color block"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["framed-image","vertical-text","color-swatches"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Brand identity guidelines","Product specs"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"framed-portrait","purpose":"Profile or focal visual","bbox":[0.56,0.16,0.26,0.68],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Wide top image banner with split-column text below","zones":["Wide top image banner with split-column text below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["top-banner","split-text","minimalist-header"],"avoid":["Complex lists","Detailed charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Statement slides"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"banner-image","purpose":"Thematic top visual","bbox":[0.08,0.11,0.84,0.47],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Half-slide image on right, title and sparse text on left with botanical watermark","zones":["Half-slide image on right, title and sparse text on left with botanical watermark"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["vertical-split","half-image","quote-layout"],"avoid":["Multi-point arguments","copying source assets, source text, or an exact source arrangement"],"best_for":["Impactful quotes","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-half-image","purpose":"Contextual mood visual","bbox":[0.59,0.0,0.41,1.0],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Half-slide image on right, title and sparse text on left with botanical watermark","zones":["Half-slide image on right, title and sparse text on left with botanical watermark"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Organic, pale botanical silhouettes used as a recurring background watermark","Strict orthogonal image crops contrasting with organic watermarks","Muted earthy color blocking paired with extensive whitespace"],"optional_variants":["vertical-split","half-image","quote-layout"],"avoid":["Multi-point arguments","copying source assets, source text, or an exact source arrangement"],"best_for":["Impactful quotes","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-half-image","purpose":"Contextual mood visual","bbox":[0.59,0.0,0.41,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in strict, sharp-cornered rectangular frames.
- Full-bleed edges are used on one or two sides, rarely all four.
- Photography favors muted, desaturated, or earthy tones to harmonize with the color palette.

【图标与装饰】
- Minimalist, uniform line-art icons.
- Strictly monochrome (black on white).
- Used in simple, structured grid layouts.

【数据页构图】
- Wide top image banner with split-column text below

【图表风格】
- No charts present; rely on simple typography and minimal graphics for data representation.

【章节页构图】
- Wide top image banner with split-column text below

【收尾页构图】
- Asymmetrical split with large central image, side vertical accent bar, and offset typography

【禁止】
- Avoid bright, saturated, or primary colors.
- Do not use rounded corners on images or shapes.
- Avoid dense, wall-to-wall text blocks; maintain high whitespace ratios.
- Do not use heavy drop shadows or 3D effects.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Fashion or lifestyle brand lookbooks、Editorial pitches、Minimalist product showcases。
