# 2 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-2-d2e4a666

## 风格ID
linzi-morandi-2-21-ppt-ppt-2-d2e4a666

## 风格名称
2 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-2-d2e4a666

## 风格描述
Editorial magazine-style presentation with a muted Morandi palette, asymmetrical layouts, and oversized intersecting typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted olive green and warm grays dominate backgrounds; deep charcoal used for high-contrast dark modes; earthy browns and beiges serve as accent shapes.
- fonts: Massive, bold sans-serif for primary display headers (often breaking lines or overlapping); clean, small, regular-weight sans-serif for body copy and captions.
- spacing: Extreme margins with localized clusters; massive negative space juxtaposed against dense image grids or oversized text.
- shape_language: Perfect circles, quarter circles bleeding off edges, and sharp rectangular image blocks. Minimalist and geometric.
- texture: Flat vector shapes contrasting with highly textured, stylized photography. 'Background text' used as a structural texture.
- grid: Deconstructed modular grid. Elements align to invisible axes but intentionally overlap or break traditional boundaries for an editorial feel.
- motion_or_depth: Flat layering (Z-index stacking) without drop shadows. Depth is created purely through overlapping opaque elements (text over image, image over shape).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「2 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-2-d2e4a666」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial magazine-style presentation with a muted Morandi palette, asymmetrical layouts, and oversized intersecting typography.
- 推荐配色：#5e6354、#333333、#e5e1da、#716454、#d8cdbe

【不可丢失的风格锚点】
- Oversized, word-breaking display typography layered over images
- Muted, earthy 'Morandi' color palette with low saturation
- Asymmetrical floating image placement with intersecting geometric background shapes
- Frequent use of 90-degree rotated vertical text labels
- Thin horizontal and vertical separator lines for structural alignment

【字体】
- Use massive font sizes for primary headers, allowing them to span multiple lines or intersect image borders.
- Employ 90-degree rotated text to serve as section dividers or vertical structural anchors.
- Create extreme contrast: juxtapose giant display text immediately next to 10pt or 12pt localized body copy.
- Use thin typographic underlines and strikethroughs as decorative separators.
- Use oversized, low-opacity text as a background watermarked texture.

【封面页构图】
- Centered square image overlaid with massive, multi-line, line-separated text on a solid color background.

【内容页构图】
- 50/50 vertical split with an edge-to-edge image on the left and a minimalist typography layout on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered square image overlaid with massive, multi-line, line-separated text on a solid color background.","zones":["Centered square image overlaid with massive, multi-line, line-separated text on a solid color background."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["hero-image","oversized-text","centered-layout"],"avoid":["Corporate decks requiring prominent logos","Text-heavy executive summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Impactful title covers","Portfolio introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Central background portrait/image","bbox":[0.22,0.08,0.56,0.84],"priority":1}]}
- section: {"id":"section-primary","composition":"Four equal-width vertical columns; one solid color text column and three edge-to-edge image columns.","zones":["Four equal-width vertical columns; one solid color text column and three edge-to-edge image columns."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["vertical-columns","gallery","full-bleed"],"avoid":["Detailed content delivery","Charts and graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Collection overviews","Section transitions"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"col-1","purpose":"Vertical portrait slice","bbox":[0.28,0.0,0.24,1.0],"priority":1},{"id":"col-2","purpose":"Vertical portrait slice","bbox":[0.52,0.0,0.24,1.0],"priority":2},{"id":"col-3","purpose":"Vertical portrait slice","bbox":[0.76,0.0,0.24,1.0],"priority":3}]}
- content: [{"id":"content-content","composition":"50/50 vertical split with an edge-to-edge image on the left and a minimalist typography layout on the right.","zones":["50/50 vertical split with an edge-to-edge image on the left and a minimalist typography layout on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["split-screen","minimalist","asymmetrical-text"],"avoid":["Dense data lists","Multi-chart comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Single-point highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-half","purpose":"Full height editorial image","bbox":[0.0,0.0,0.5,1.0],"priority":1}]},{"id":"content-comparison","composition":"Two floating rectangular images placed asymmetrically with abstract geometric shapes bleeding off the left edge.","zones":["Two floating rectangular images placed asymmetrically with abstract geometric shapes bleeding off the left edge."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["floating-images","asymmetrical","geometry-accents"],"avoid":["Text-heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Dual product showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-left-bottom","purpose":"Landscape visual","bbox":[0.05,0.5,0.45,0.5],"priority":1},{"id":"image-right-top","purpose":"Portrait visual","bbox":[0.63,0.23,0.23,0.53],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Minimalist map visualization adjacent to a horizontal timeline, unified by massive background watermark typography.","zones":["Minimalist map visualization adjacent to a horizontal timeline, unified by massive background watermark typography."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["map","timeline","watermark-text"],"avoid":["Complex data charts (bar/pie)","copying source assets, source text, or an exact source arrangement"],"best_for":["Geographic roadmaps","Location-based timelines","Expansion plans"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: 50/50 vertical split with an edge-to-edge image on the left and a minimalist typography layout on the right.","zones":["50/50 vertical split with an edge-to-edge image on the left and a minimalist typography layout on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["split-screen","minimalist","asymmetrical-text"],"avoid":["Dense data lists","Multi-chart comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Single-point highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-half","purpose":"Full height editorial image","bbox":[0.0,0.0,0.5,1.0],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Central, heavily margined landscape image treated as a focal window, with minimal text arranged in the left margin.","zones":["Central, heavily margined landscape image treated as a focal window, with minimal text arranged in the left margin."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Oversized, word-breaking display typography layered over images","Muted, earthy 'Morandi' color palette with low saturation","Asymmetrical floating image placement with intersecting geometric background shapes"],"optional_variants":["dark-mode","focal-image","wide-margins"],"avoid":["Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Focus on a single powerful visual"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"center-window","purpose":"Primary focal landscape image","bbox":[0.26,0.14,0.74,0.72],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds with central text overlays.
- Asymmetrical masonry collages with varying aspect ratios.
- Floating, unbordered rectangular crops overlapping background geometric shapes.

【图标与装饰】
- Almost completely devoid of traditional icons; relies on pure typography, numbers, and photography for wayfinding.

【数据页构图】
- Minimalist map visualization adjacent to a horizontal timeline, unified by massive background watermark typography.

【图表风格】
- Minimalist map visualizations using flat, monochromatic silhouettes with a single contrasting accent color for highlighted regions.
- Timelines constructed using minimal horizontal rules and right-aligned dates.

【章节页构图】
- Four equal-width vertical columns; one solid color text column and three edge-to-edge image columns.

【收尾页构图】
- Centered square image overlaid with massive, multi-line, line-separated text on a solid color background.

【禁止】
- Avoid standard bullet points; use localized text blocks or clean lists separated by thin lines.
- Do not use drop shadows or 3D effects; keep all layers flat and opaque.
- Avoid primary or highly saturated colors; stick to the muted, earthy palette.
- Do not center-align body text; adhere strictly to left-aligned blocks anchored to the grid.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Photography portfolios、Fashion or lookbook presentations、Creative agency creds decks、High-end editorial pitches。
