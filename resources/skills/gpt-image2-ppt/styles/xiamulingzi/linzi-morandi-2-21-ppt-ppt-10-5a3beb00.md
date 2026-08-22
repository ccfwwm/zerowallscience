# 10 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-10-5a3beb00

## 风格ID
linzi-morandi-2-21-ppt-ppt-10-5a3beb00

## 风格名称
10 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-10-5a3beb00

## 风格描述
An elegant, fashion-forward presentation deck featuring a muted Morandi palette, fluid organic shapes, and minimalist typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Low-contrast backgrounds (beige/off-white) punctuated by medium-to-dark brown focal elements and text.
- fonts: Light, elegant sans-serif with wide letter-spacing for headings; clean legible sans for body.
- spacing: Generous negative space, often utilizing asymmetric balance with heavy framing in opposite corners.
- shape_language: Contrast between perfect geometric circles/pills and unpredictable organic amoeba shapes.
- texture: Matte, flat vector shapes with zero drop-shadows or gradients.
- grid: Flexible organic layouts anchored by rigid center alignments or distinct column gutters.
- motion_or_depth: Flat composition relying strictly on color blocking and overlapping vectors for depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「10 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-10-5a3beb00」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, fashion-forward presentation deck featuring a muted Morandi palette, fluid organic shapes, and minimalist typography.
- 推荐配色：#E6E3DB、#82593E、#B4967C、#9F988F、#FFFFFF

【不可丢失的风格锚点】
- Muted earth-tone color scheme
- Organic, fluid blob shapes used as framing
- Wide-tracked uppercase typography
- Scattered minimalist geometric accents (confetti-like dashes)

【字体】
- Use significant letter-spacing (tracking) for primary and secondary headings.
- Reserve uppercase formatting for structural titles and small metric labels.
- Maintain small, cleanly leaded body text (approx. 1.5 line height).

【封面页构图】
- Central oversized white circle acting as a text island over an organic-shaped background.

【内容页构图】
- Asymmetric split layout with left-aligned text and a right-aligned circular image mask.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central oversized white circle acting as a text island over an organic-shaped background.","zones":["Central oversized white circle acting as a text island over an organic-shaped background."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["centered","organic-frame","minimal"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Cover slides","Major section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Three uniform columns with circular numbered badges above centered text.","zones":["Three uniform columns with circular numbered badges above centered text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["3-column","numbered","centered-text"],"avoid":["Long-form paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Three-step summaries","Feature highlights"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetric split layout with left-aligned text and a right-aligned circular image mask.","zones":["Asymmetric split layout with left-aligned text and a right-aligned circular image mask."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["image-text","circle-mask","asymmetric"],"avoid":["Data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product spotlights","Introduction pages"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"circular-portrait","purpose":"Replaceable subject image","bbox":[0.6,0.25,0.35,0.5],"priority":1}]},{"id":"content-comparison","composition":"Left text block separated by a vertical line from a converging arrow diagram on the right.","zones":["Left text block separated by a vertical line from a converging arrow diagram on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["process-diagram","converging-arrows","split-layout"],"avoid":["Linear timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Input-output diagrams","Consolidation concepts","Process flows"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Four-column vertical timeline with one column visually highlighted by a solid background shape.","zones":["Four-column vertical timeline with one column visually highlighted by a solid background shape."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["timeline","vertical-columns","highlighted-step"],"avoid":["Quantitative charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Company history","Project roadmaps","Sequential phases"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three uniform columns with circular numbered badges above centered text.","zones":["Three uniform columns with circular numbered badges above centered text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["3-column","numbered","centered-text"],"avoid":["Long-form paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Three-step summaries","Feature highlights"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Ultra-minimalist layout with central cross-arranged text inside a thin circle, overlaid on swooping background curves.","zones":["Ultra-minimalist layout with central cross-arranged text inside a thin circle, overlaid on swooping background curves."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["minimalist","typographic-art","line-art-background"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key quotes","Thematic breaks"],"evidence_pages":["page-06"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Centered brief text over a dense organic blob and confetti background (mirroring the cover).","zones":["Centered brief text over a dense organic blob and confetti background (mirroring the cover)."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earth-tone color scheme","Organic, fluid blob shapes used as framing","Wide-tracked uppercase typography"],"optional_variants":["closing","bookend","centered"],"avoid":["Any content requiring reading","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information","Final remarks"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Mask images into perfect geometric circles.
- Intersect rectangular image blocks with solid horizontal background bands.

【图标与装饰】
- Forego literal icons in favor of oversized numeric markers inside solid circles.
- Use abstract shapes or intersecting lines instead of complex graphics.

【数据页构图】
- Four-column vertical timeline with one column visually highlighted by a solid background shape.

【图表风格】
- Remove all axis lines and gridlines for a minimalist look.
- Use discrete thematic colors for individual bars in a series.
- Overlay translucent area charts behind primary bar charts for multi-metric views.

【章节页构图】
- Three uniform columns with circular numbered badges above centered text.

【收尾页构图】
- Centered brief text over a dense organic blob and confetti background (mirroring the cover).

【禁止】
- High-saturation or primary colors.
- Literal icons or detailed 3D illustrations.
- Heavy drop shadows or 3D bevel effects.
- Cluttered layouts that destroy the asymmetric negative space.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle brand lookbooks、Creative agency portfolios、Boutique annual reports、Minimalist trend analysis。
