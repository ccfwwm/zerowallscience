# 60 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-60-9edd662a

## 风格ID
linzi-morandi-2-21-ppt-ppt-60-9edd662a

## 风格名称
60 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-60-9edd662a

## 风格描述
Minimalist corporate presentation utilizing wide geometric typography, continuous organic line motifs, and striking diagonal image masks in a yellow and gray palette.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominate. Mustard yellow acts as the primary accent for lines, highlights, and key graphical shapes. Medium-dark gray is used for secondary elements and primary typography.
- fonts: Wide-tracking, uppercase geometric sans-serif for headings. Standard geometric sans-serif for body copy.
- spacing: High whitespace (macro-spacing), with content pushed into distinct quadrants or halved by diagonal vectors.
- shape_language: Contrast between perfectly smooth organic curves (sine waves, circles) and rigid sharp angles (diagonals, triangles).
- texture: Flat vector graphics layered over or under grayscale photography.
- grid: Non-traditional grid; relies on diagonal axes and sweeping curves to guide eye movement rather than strict columns, though text blocks are rigorously left-aligned.
- motion_or_depth: Flat design with depth implied only through shapes clipping images or text overlapping the background wavy lines.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「60 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-60-9edd662a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist corporate presentation utilizing wide geometric typography, continuous organic line motifs, and striking diagonal image masks in a yellow and gray palette.
- 推荐配色：#DFB142、#777777、#595959、#F4F4F4、#FFFFFF

【不可丢失的风格锚点】
- Continuous, intersecting organic yellow wavy line spanning across slides.
- Sharp diagonal divisions and V-shaped masks for imagery.
- Persistent vertical tracking text along the right margin.
- Circular motifs including solid yellow dots, gray rings, and circular image crops.
- Pill-shaped solid color buttons/callouts.

【字体】
- Headings: Uppercase, extra-wide letter spacing, bold weight, often in gray.
- Subheadings: Standard tracking, uppercase, bold.
- Body: Regular weight, slightly increased line height, medium gray.
- Marginalia: Small, uppercase, extremely wide tracking, rotated 90 degrees vertically on the right edge.

【封面页构图】
- Massive centered typography intersected by a continuous organic line and a small circular image mask.

【内容页构图】
- Bottom-right diagonal solid shape, left-aligned text, large right-aligned floating title.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Massive centered typography intersected by a continuous organic line and a small circular image mask.","zones":["Massive centered typography intersected by a continuous organic line and a small circular image mask."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["hero-typography","circular-mask","organic-line"],"avoid":["Text-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Year-in-review openers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-circle","purpose":"Abstract or thematic focal image","bbox":[0.55,0.3,0.2,0.35],"priority":1}]}
- section: {"id":"section-primary","composition":"Top-left diagonal image mask with right-aligned text block and bottom-right wavy line accent.","zones":["Top-left diagonal image mask with right-aligned text block and bottom-right wavy line accent."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["diagonal-cut","right-aligned","asymmetrical"],"avoid":["Data charts","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"top-left-diag","purpose":"Atmospheric or portrait image","bbox":[0.0,0.0,0.4,0.7],"priority":1}]}
- content: [{"id":"content-content","composition":"Bottom-right diagonal solid shape, left-aligned text, large right-aligned floating title.","zones":["Bottom-right diagonal solid shape, left-aligned text, large right-aligned floating title."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["pill-button","diagonal-background","split-layout"],"avoid":["Detailed comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Left-side organic line, solid circle overlaid with strikethrough text, two stacked right-aligned content blocks.","zones":["Left-side organic line, solid circle overlaid with strikethrough text, two stacked right-aligned content blocks."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["circle-badge","stacked-text","wavy-divider"],"avoid":["Long continuous paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Conclusions","Two-point comparisons"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"S-curve segmented arrow path (timeline/process) dominating the center, flanked by text blocks.","zones":["S-curve segmented arrow path (timeline/process) dominating the center, flanked by text blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["s-curve","timeline","process-flow"],"avoid":["Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Process diagrams","Timelines","Journey mapping"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top-left diagonal image mask with right-aligned text block and bottom-right wavy line accent.","zones":["Top-left diagonal image mask with right-aligned text block and bottom-right wavy line accent."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["diagonal-cut","right-aligned","asymmetrical"],"avoid":["Data charts","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"top-left-diag","purpose":"Atmospheric or portrait image","bbox":[0.0,0.0,0.4,0.7],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Large central V-shaped mask revealing an image, with text tucked into the lower-left negative space.","zones":["Large central V-shaped mask revealing an image, with text tucked into the lower-left negative space."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["v-mask","hero-image","dramatic-crop"],"avoid":["Data, lists, or complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Impact quotes","Section dividers","Vision statements"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"center-v-shape","purpose":"Dramatic focal background image","bbox":[0.2,0.0,0.6,1.0],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Echoes the cover slide: large centered typography, background wavy line, without the image mask.","zones":["Echoes the cover slide: large centered typography, background wavy line, without the image mask."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Continuous, intersecting organic yellow wavy line spanning across slides.","Sharp diagonal divisions and V-shaped masks for imagery.","Persistent vertical tracking text along the right margin."],"optional_variants":["closing","centered-text","minimal"],"avoid":["Contact detail lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Convert images to high-contrast grayscale to prevent color clashing with the strict yellow accent.
- Mask images heavily using either sharp diagonal splits, full V-shapes, or perfect circles.
- Never use raw rectangular images.

【图标与装饰】
- Minimalist line-art icons.
- Placed centrally inside circular nodes with generous padding.
- White icons on colored backgrounds, or colored icons on white backgrounds.

【数据页构图】
- S-curve segmented arrow path (timeline/process) dominating the center, flanked by text blocks.

【图表风格】
- Flat, 2D charts without borders or shadows.
- Monochromatic or dual-color palette mapped directly from the global palette (yellows, grays).
- Legends are represented by simple stacked colored squares.

【章节页构图】
- Top-left diagonal image mask with right-aligned text block and bottom-right wavy line accent.

【收尾页构图】
- Echoes the cover slide: large centered typography, background wavy line, without the image mask.

【禁止】
- Do not place body text directly over the wavy line without a solid background layer or sufficient contrast.
- Avoid using highly saturated, multi-colored photos that break the monochromatic+accent aesthetic.
- Do not use heavy drop shadows or 3D effects on any shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Annual reports、Creative agency portfolios、Minimalist corporate overviews、Trend forecasting presentations。
