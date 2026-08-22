# 3621 · FG11【朋克酷风】 / linzi-punk-fg11-3621-343c19fa

## 风格ID
linzi-punk-fg11-3621-343c19fa

## 风格名称
3621 · FG11【朋克酷风】 / linzi-punk-fg11-3621-343c19fa

## 风格描述
A dark, edgy, 'punk-cool' template featuring asymmetrical layouts, split-color typography, and hatched geometric motifs.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Charcoal background establishes the dark mode. Coral acts as the primary accent for partial titles, icons, and geometric vectors. White is used for secondary title segments and all body copy.
- fonts: Bold, extended geometric sans-serif for primary headings. Clean, readable standard sans-serif for body copy.
- spacing: Generous negative space with deliberate asymmetrical overlapping of text, images, and vector patterns.
- shape_language: Sharp rectangles for images, hatched squares/rectangles for accents, thin line segments, and plus sign (+) icons.
- texture: High contrast between smooth flat colors, realistic photography, and heavily textured diagonal hatched lines.
- grid: Deconstructed, asymmetrical grid. Elements overlap and float rather than snapping to rigid column structures.
- motion_or_depth: Flat design aesthetic. Depth is achieved purely through the overlapping of solid photography over flat, hatched vector shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「3621 · FG11【朋克酷风】 / linzi-punk-fg11-3621-343c19fa」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A dark, edgy, 'punk-cool' template featuring asymmetrical layouts, split-color typography, and hatched geometric motifs.
- 推荐配色：#2C2C2F、#EE8C6A、#FFFFFF

【不可丢失的风格锚点】
- Dark charcoal background paired with soft coral accents.
- Split-color typography (coral and white) within single words or adjacent lines.
- Diagonal hatched/striped geometric blocks used as framing or background elements.
- Circular text badges functioning as localized graphical seals.
- Asymmetrical, unconstrained image placements that break traditional grid boundaries.

【字体】
- Split color within titles: alternate colors (coral/white) across syllables, words, or stacked lines.
- Use oversized, bold tracking for primary section headers.
- Body copy should be small, left-aligned, and well-spaced to contrast with massive headers.
- Incorporate oversized numbers (e.g., years or dates) as graphic background elements.

【封面页构图】
- Large top-left split-color title, off-center dominant image, right-aligned circular badge, bottom-right hatched corner anchor.

【内容页构图】
- Full-height left image overlapped by a center-left hatched square, right-aligned stacked split-color title, and body copy below.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Large top-left split-color title, off-center dominant image, right-aligned circular badge, bottom-right hatched corner anchor.","zones":["Large top-left split-color title, off-center dominant image, right-aligned circular badge, bottom-right hatched corner anchor."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Dark charcoal background paired with soft coral accents.","Split-color typography (coral and white) within single words or adjacent lines.","Diagonal hatched/striped geometric blocks used as framing or background elements."],"optional_variants":["hero-image","bold-title","asymmetrical"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Replaceable dominant visual","bbox":[0.05,0.27,0.51,0.64],"priority":1}]}
- section: {"id":"section-primary","composition":"Center-right main image framed by disconnected hatched graphics, huge split-color numbers overlapping the right edge, left-aligned text.","zones":["Center-right main image framed by disconnected hatched graphics, huge split-color numbers overlapping the right edge, left-aligned text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Dark charcoal background paired with soft coral accents.","Split-color typography (coral and white) within single words or adjacent lines.","Diagonal hatched/striped geometric blocks used as framing or background elements."],"optional_variants":["large-numbers","framed-image","overlap"],"avoid":["Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Milestones","Chapter titles"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"portrait","purpose":"Main subject image","bbox":[0.53,0.15,0.31,0.7],"priority":1}]}
- content: [{"id":"content-content","composition":"Full-height left image overlapped by a center-left hatched square, right-aligned stacked split-color title, and body copy below.","zones":["Full-height left image overlapped by a center-left hatched square, right-aligned stacked split-color title, and body copy below."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Dark charcoal background paired with soft coral accents.","Split-color typography (coral and white) within single words or adjacent lines.","Diagonal hatched/striped geometric blocks used as framing or background elements."],"optional_variants":["vertical-split","image-heavy","profile"],"avoid":["Multiple distinct data points","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Founder profiles","Vision statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"profile","purpose":"Tall portrait or atmospheric image","bbox":[0.0,0.0,0.43,1.0],"priority":1}]},{"id":"content-comparison","composition":"Tall left image, center stacked typography, small bottom-right accent image with hatched backing.","zones":["Tall left image, center stacked typography, small bottom-right accent image with hatched backing."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Dark charcoal background paired with soft coral accents.","Split-color typography (coral and white) within single words or adjacent lines.","Diagonal hatched/striped geometric blocks used as framing or background elements."],"optional_variants":["multi-image","staggered","editorial"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Editorial content","Dual-image narratives"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"primary","purpose":"Tall side image","bbox":[0.08,0.0,0.32,0.8],"priority":1},{"id":"secondary","purpose":"Small accent image","bbox":[0.76,0.58,0.2,0.35],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Full-height left image overlapped by a center-left hatched square, right-aligned stacked split-color title, and body copy below.","zones":["Full-height left image overlapped by a center-left hatched square, right-aligned stacked split-color title, and body copy below."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Dark charcoal background paired with soft coral accents.","Split-color typography (coral and white) within single words or adjacent lines.","Diagonal hatched/striped geometric blocks used as framing or background elements."],"optional_variants":["vertical-split","image-heavy","profile"],"avoid":["Multiple distinct data points","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Founder profiles","Vision statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"profile","purpose":"Tall portrait or atmospheric image","bbox":[0.0,0.0,0.43,1.0],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Tall left image, center stacked typography, small bottom-right accent image with hatched backing.","zones":["Tall left image, center stacked typography, small bottom-right accent image with hatched backing."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Dark charcoal background paired with soft coral accents.","Split-color typography (coral and white) within single words or adjacent lines.","Diagonal hatched/striped geometric blocks used as framing or background elements."],"optional_variants":["multi-image","staggered","editorial"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Editorial content","Dual-image narratives"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"primary","purpose":"Tall side image","bbox":[0.08,0.0,0.32,0.8],"priority":1},{"id":"secondary","purpose":"Small accent image","bbox":[0.76,0.58,0.2,0.35],"priority":2}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should bleed to the edge occasionally, but mostly float as unconstrained rectangles.
- Never use soft edges or drop shadows; frame images with solid hatched geometric shapes underneath.
- Allow large typography or structural shapes to overlap image boundaries.

【图标与装饰】
- Use strictly flat, single-color (coral) vector icons.
- Avoid complex or multi-colored illustrations.
- Employ minimal, technical symbols like small plus signs (+) as spatial anchors.

【数据页构图】
- Full-height left image overlapped by a center-left hatched square, right-aligned stacked split-color title, and body copy below.

【图表风格】
- Not explicitly demonstrated, but should theoretically rely on high-contrast coral data points against the dark charcoal background, using hatched patterns for fills.

【章节页构图】
- Center-right main image framed by disconnected hatched graphics, huge split-color numbers overlapping the right edge, left-aligned text.

【收尾页构图】
- Large top-left split-color title, off-center dominant image, right-aligned circular badge, bottom-right hatched corner anchor.

【禁止】
- Do not use gradients, 3D effects, or drop shadows.
- Avoid centered, perfectly symmetrical layouts.
- Do not place body text directly over complex areas of photographs.
- Avoid standard bullet points; use spatial separation instead.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolio presentations、Fashion or streetwear lookbooks、Modern agency pitches、Trend reports or editorial decks。
