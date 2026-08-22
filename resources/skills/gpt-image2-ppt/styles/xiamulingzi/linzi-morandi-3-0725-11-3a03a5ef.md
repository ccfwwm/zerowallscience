# 11 · 3.07更新高级色25 / linzi-morandi-3-0725-11-3a03a5ef

## 风格ID
linzi-morandi-3-0725-11-3a03a5ef

## 风格名称
11 · 3.07更新高级色25 / linzi-morandi-3-0725-11-3a03a5ef

## 风格描述
Minimalist Morandi-style presentation featuring organic background shapes contrasted with strict geometric content blocks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary accents of terracotta and sand over white backgrounds, with charcoal text for high legibility.
- fonts: Clean, modern sans-serif typography with distinct weight contrast between headings and body.
- spacing: Generous margins with dense internal clustering within content blocks; distinct 50/50 split layouts.
- shape_language: Contrast between purely decorative organic blobs and highly structured functional rectangles/chevrons.
- texture: Flat, matte vectors with no drop shadows or gradients.
- grid: Predominantly uses central alignment for intros and a strict 2-column or 3-column split for detailed content.
- motion_or_depth: Depth is created strictly through overlapping solid shapes and images, without artificial shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「11 · 3.07更新高级色25 / linzi-morandi-3-0725-11-3a03a5ef」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist Morandi-style presentation featuring organic background shapes contrasted with strict geometric content blocks.
- 推荐配色：#C5684D、#EABF8C、#B6BEC1、#555555、#F4F4F4

【不可丢失的风格锚点】
- Asymmetrical organic fluid shapes framing the corners
- Clusters of floating dots/seeds for textural accents
- Concentric curved line motifs in negative space
- High-contrast solid colored rectangles for content structuring

【字体】
- Headings: Bold, charcoal grey, often centered or left-aligned with a small decorative accent.
- Body: Lighter grey, medium density, consistently aligned to its bounding container.
- Labels: White text used exclusively inside dark, solid-color structural shapes.

【封面页构图】
- Centered typography framed by organic fluid shapes and abstract lines in the corners.

【内容页构图】
- Asymmetrical 60/40 split with a large image on the left and a stacked text block on the right, anchored by a solid bottom block.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography framed by organic fluid shapes and abstract lines in the corners.","zones":["Centered typography framed by organic fluid shapes and abstract lines in the corners."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["cover-centered","organic-frame"],"avoid":["Heavy data","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation intros"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered typography with a pill-shaped badge, utilizing the identical organic framing as the cover.","zones":["Centered typography with a pill-shaped badge, utilizing the identical organic framing as the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["section-break","pill-badge"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetrical 60/40 split with a large image on the left and a stacked text block on the right, anchored by a solid bottom block.","zones":["Asymmetrical 60/40 split with a large image on the left and a stacked text block on the right, anchored by a solid bottom block."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["image-text-split","anchored-block"],"avoid":["Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Executive summaries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-image-left","purpose":"Replaceable contextual image","bbox":[0.05,0.28,0.55,0.58],"priority":1}]},{"id":"content-comparison","composition":"Full-height image on the right, overlapped by a solid text block, with minimalist text on the left.","zones":["Full-height image on the right, overlapped by a solid text block, with minimalist text on the left."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["image-overlap","half-bleed-photo"],"avoid":["Dense multi-column data","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Highlighting outcomes"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"right-hero-image","purpose":"Full height background image for the right side","bbox":[0.45,0.0,0.55,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three vertical columns utilizing split-color cards with a downward-pointing speech bubble logic.","zones":["Three vertical columns utilizing split-color cards with a downward-pointing speech bubble logic."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["3-column","split-cards"],"avoid":["Long paragraphs","Sequential timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Core pillars","Methodology breakdown"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered typography with a pill-shaped badge, utilizing the identical organic framing as the cover.","zones":["Centered typography with a pill-shaped badge, utilizing the identical organic framing as the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["section-break","pill-badge"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered typography framed by organic fluid shapes, identical to the cover layout.","zones":["Centered typography framed by organic fluid shapes, identical to the cover layout."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical organic fluid shapes framing the corners","Clusters of floating dots/seeds for textural accents","Concentric curved line motifs in negative space"],"optional_variants":["closing-centered","bookend"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A","Thank you slides"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into strict, borderless rectangles.
- Often overlapped by solid-color text containers to create layering.

【图标与装饰】
- Flat, minimalist white vectors.
- Enclosed in solid circular badges or used as standalone accents inside heavy color blocks.

【数据页构图】
- Three vertical columns utilizing split-color cards with a downward-pointing speech bubble logic.

【图表风格】
- Relies on process arrows (chevrons) and split-color cards rather than standard data graphs.
- Process steps use alternating placement (top/bottom) along a continuous horizontal axis.

【章节页构图】
- Centered typography with a pill-shaped badge, utilizing the identical organic framing as the cover.

【收尾页构图】
- Centered typography framed by organic fluid shapes, identical to the cover layout.

【禁止】
- Avoid using gradients or drop shadows; stick to flat, solid shapes.
- Do not clutter the center of cover/section slides; leave breathing room around centered text.
- Avoid strictly rigid borders on slides without the organic corner framing.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic defenses and research summaries、Minimalist corporate overviews、Creative portfolio presentations、Process and methodology explanations。
