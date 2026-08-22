# 优雅线条（01）---木七设计 · ppt模板 / linzi-morandi-ppt-01-59c9ef00

## 风格ID
linzi-morandi-ppt-01-59c9ef00

## 风格名称
优雅线条（01）---木七设计 · ppt模板 / linzi-morandi-ppt-01-59c9ef00

## 风格描述
An elegant, minimalist template utilizing a Morandi color palette, organic overlapping curves, and clean split layouts suitable for modern lifestyle or brand presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted grey-purple and soft blush/beige serve as alternating canvas backgrounds; white is used for distinct content cards; dark charcoal for high-contrast typography.
- fonts: Primary rounded or geometric sans-serif for clean legibility; occasional use of elegant script font for secondary decorative accents.
- spacing: Generous margins, relying on the structural divisions of the background (splits and curves) to dictate content zones.
- shape_language: Fluid organic blobs, circles, and rounded rectangles. Arrow-like directional tags and speech bubbles add structural detail.
- texture: Flat, matte finish with very soft, diffused drop shadows purely for elevating white cards above split backgrounds.
- grid: Predominantly vertical half-splits or asymmetrical two-column layouts divided 40/60.
- motion_or_depth: Depth is achieved minimally through overlapping layers: text over split lines, central focal images bridging two background colors, and floating cards.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（01）---木七设计 · ppt模板 / linzi-morandi-ppt-01-59c9ef00」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist template utilizing a Morandi color palette, organic overlapping curves, and clean split layouts suitable for modern lifestyle or brand presentations.
- 推荐配色：#9A99A8、#E8DCDA、#C1B4B0、#FFFFFF、#222222

【不可丢失的风格锚点】
- Muted, low-saturation 'Morandi' color blocking
- Large, sweeping organic curves spanning the slide edges
- 50/50 vertical color split backgrounds
- Soft, rounded-corner content cards with subtle shadows

【字体】
- Headings: Sans-serif, bold, often left-aligned or centered depending on layout symmetry.
- Body text: Sans-serif, regular weight, high line height for readability.
- Accents: Oversized translucent watermark text or subtle cursive script for aesthetic layering.

【封面页构图】
- Large organic intersecting curves dividing the canvas into three asymmetrical color zones

【内容页构图】
- Asymmetrical image placement overlaid with oversized, translucent background typography

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Large organic intersecting curves dividing the canvas into three asymmetrical color zones","zones":["Large organic intersecting curves dividing the canvas into three asymmetrical color zones"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["organic-cover","minimal-title","color-blocked"],"avoid":["Data heavy content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"50/50 vertical color split background with centered overlapping card trio","zones":["50/50 vertical color split background with centered overlapping card trio"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["vertical-split","three-cards","feature-trio"],"avoid":["Timeline sequences","Single large images","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Service pillars","Value propositions"],"evidence_pages":["page-02"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetrical image placement overlaid with oversized, translucent background typography","zones":["Asymmetrical image placement overlaid with oversized, translucent background typography"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["watermark-text","staggered-images","editorial-layout"],"avoid":["Dense paragraphs","Standard bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Mood boards"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-1","purpose":"Secondary contextual image","bbox":[0.05,0.46,0.25,0.27],"priority":2},{"id":"image-2","purpose":"Primary showcase image","bbox":[0.24,0.65,0.31,0.35],"priority":1}]},{"id":"content-comparison","composition":"Vertical split screen with directional numbered tags anchoring the central axis","zones":["Vertical split screen with directional numbered tags anchoring the central axis"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["split-comparison","numbered-axis","two-column"],"avoid":["Full-width diagrams","Dense data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Step-by-step concepts","Dual narratives"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Central vertical dashed timeline with staggered alternating content and media","zones":["Central vertical dashed timeline with staggered alternating content and media"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["vertical-timeline","staggered-nodes","process-flow"],"avoid":["Three-column layouts","Symmetrical grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Company history","Process flows","Roadmaps"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"timeline-image","purpose":"Step illustration","bbox":[0.48,0.6,0.52,0.21],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical image placement overlaid with oversized, translucent background typography","zones":["Asymmetrical image placement overlaid with oversized, translucent background typography"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["watermark-text","staggered-images","editorial-layout"],"avoid":["Dense paragraphs","Standard bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Mood boards"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-1","purpose":"Secondary contextual image","bbox":[0.05,0.46,0.25,0.27],"priority":2},{"id":"image-2","purpose":"Primary showcase image","bbox":[0.24,0.65,0.31,0.35],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Large organic intersecting curves dividing the canvas into three asymmetrical color zones (identical to cover)","zones":["Large organic intersecting curves dividing the canvas into three asymmetrical color zones (identical to cover)"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation 'Morandi' color blocking","Large, sweeping organic curves spanning the slide edges","50/50 vertical color split backgrounds"],"optional_variants":["closing-slide","bookend-design","organic-shapes"],"avoid":["Any content payload","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are often constrained within geometric shapes (circles) or simple rectangles with no borders.
- Unframed, isolated objects (cut-outs) are used for product showcases.
- Images occasionally span full width inside a defined horizontal or split container.

【图标与装饰】
- Monocolor, flat vector icons matched to the dark charcoal or muted background tones.
- Icons are frequently placed inside circular nodes or centered at the top of content cards.

【数据页构图】
- Central vertical dashed timeline with staggered alternating content and media

【图表风格】
- No traditional data charts present; data/processes are represented through vertical timelines and staggered nodes.

【章节页构图】
- 50/50 vertical color split background with centered overlapping card trio

【收尾页构图】
- Large organic intersecting curves dividing the canvas into three asymmetrical color zones (identical to cover)

【禁止】
- Avoid high-saturation primary colors or neon brights.
- Avoid sharp, pointed right angles on internal content containers.
- Do not outline text or use heavy gradient fills.
- Prevent opaque overlapping text from entirely obscuring underlying image subjects.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Brand identity pitch decks、Lifestyle, fashion, or interior design portfolios、Calm, wellness-oriented corporate overviews、Minimalist product showcases。
