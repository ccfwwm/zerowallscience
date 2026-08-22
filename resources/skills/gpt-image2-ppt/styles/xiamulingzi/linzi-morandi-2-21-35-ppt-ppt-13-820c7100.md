# 莫兰迪风格PPT (13) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-13-820c7100

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-13-820c7100

## 风格名称
莫兰迪风格PPT (13) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-13-820c7100

## 风格描述
An editorial, Morandi-style presentation featuring warm earth tones, film grain textures, botanical shadow overlays, and elegant typography suitable for fashion or lifestyle lookbooks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Warm beige base (#F4F0EA) with strong terracotta (#A84223) accents. Dark charcoal (#2E2C2B) for high-contrast body text.
- fonts: Elegant transitional serif for primary display headers; clean, geometric sans-serif for body copy and subheaders.
- spacing: Generous margins, editorial asymmetry, overlapping elements to break rigid grid lines.
- shape_language: Contrast between soft fluid background blobs and sharp rectangular image/text containers. Small pill-shaped buttons.
- texture: Heavy digital noise/film grain mimicking analog photography or recycled paper.
- grid: Modular editorial grid, frequently utilizing 50/50 vertical splits or staggered multi-column arrangements.
- motion_or_depth: Significant depth created by layering: background -> flat shapes -> shadow overlays -> floating cards -> text.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (13) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-13-820c7100」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial, Morandi-style presentation featuring warm earth tones, film grain textures, botanical shadow overlays, and elegant typography suitable for fashion or lifestyle lookbooks.
- 推荐配色：#F4F0EA、#A84223、#DC964E、#A98E75、#2E2C2B

【不可丢失的风格锚点】
- Organic, fluid background shapes in muted tones
- Global film grain/noise texture overlay
- Botanical silhouette drop-shadows implying natural lighting
- Minimalist 3-dot decorative motif (rust, taupe, ochre)
- Floating central content cards with soft drop shadows

【字体】
- Use all-caps serif for primary titles to establish an editorial look.
- Use distinct tracking (letter-spacing) on smaller uppercase sans-serif subheadings.
- Body copy should be a highly legible sans-serif, kept relatively small for a sophisticated, airy feel.
- Invert text to white when placed over dark terracotta or heavy image backgrounds.

【封面页构图】
- Background with organic shapes and botanical shadow overlays. A central floating rectangular card containing a dominant serif title and the 3-dot motif.

【内容页构图】
- Top centered title. Lower area split vertically: a text block above a solid colored data block on the left, and a flush rectangular image on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Background with organic shapes and botanical shadow overlays. A central floating rectangular card containing a dominant serif title and the 3-dot motif.","zones":["Background with organic shapes and botanical shadow overlays. A central floating rectangular card containing a dominant serif title and the 3-dot motif."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["floating-card","textured-background","minimal-title"],"avoid":["Detailed agendas","Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Extremely sparse. Title top left, short text top right. A wide horizontal image container spans the bottom half, framing a minimalist subject.","zones":["Extremely sparse. Title top left, short text top right. A wide horizontal image container spans the bottom half, framing a minimalist subject."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["minimalist","negative-space","horizontal-focal-image"],"avoid":["Detailed explanations","Multiple data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Evocative pauses","Single concept focus"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"bottom-wide-image","purpose":"Minimalist visual metaphor","bbox":[0.05,0.38,0.9,0.53],"priority":1}]}
- content: [{"id":"content-content","composition":"Top centered title. Lower area split vertically: a text block above a solid colored data block on the left, and a flush rectangular image on the right.","zones":["Top centered title. Lower area split vertically: a text block above a solid colored data block on the left, and a flush rectangular image on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["split-layout","data-block","image-right"],"avoid":["Long form text","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics","Project highlights","Summary with visual evidence"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-feature","purpose":"Atmospheric or descriptive imagery","bbox":[0.43,0.35,0.5,0.57],"priority":1}]},{"id":"content-comparison","composition":"50/50 vertical split. Left side has a title over a large rectangular image. Right side is a full-bleed solid color block containing inverted text and a CTA link.","zones":["50/50 vertical split. Left side has a title over a large rectangular image. Right side is a full-bleed solid color block containing inverted text and a CTA link."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["50-50-split","color-block","contrast-text"],"avoid":["Bullet lists","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Call to action","Key statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left-image","purpose":"Primary visual focus","bbox":[0.05,0.3,0.4,0.61],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Top centered title. Lower area split vertically: a text block above a solid colored data block on the left, and a flush rectangular image on the right.","zones":["Top centered title. Lower area split vertically: a text block above a solid colored data block on the left, and a flush rectangular image on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["split-layout","data-block","image-right"],"avoid":["Long form text","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics","Project highlights","Summary with visual evidence"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-feature","purpose":"Atmospheric or descriptive imagery","bbox":[0.43,0.35,0.5,0.57],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: 50/50 vertical split. Left side has a title over a large rectangular image. Right side is a full-bleed solid color block containing inverted text and a CTA link.","zones":["50/50 vertical split. Left side has a title over a large rectangular image. Right side is a full-bleed solid color block containing inverted text and a CTA link."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["50-50-split","color-block","contrast-text"],"avoid":["Bullet lists","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Call to action","Key statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left-image","purpose":"Primary visual focus","bbox":[0.05,0.3,0.4,0.61],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Two horizontal bands. Each features an oversized quotation mark, italicized body text, stacked attribution, and a rectangular image. The layout alternates slightly.","zones":["Two horizontal bands. Each features an oversized quotation mark, italicized body text, stacked attribution, and a rectangular image. The layout alternates slightly."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["dual-quotes","oversized-punctuation","alternating-rows"],"avoid":["Standard body content","Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Client feedback","Key pull-quotes"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"top-image","purpose":"Quote subject 1","bbox":[0.47,0.08,0.48,0.39],"priority":1},{"id":"bottom-image","purpose":"Quote subject 2","bbox":[0.04,0.56,0.48,0.39],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Background with organic shapes and botanical shadow overlays. A central floating rectangular card containing a dominant closing message and the 3-dot motif.","zones":["Background with organic shapes and botanical shadow overlays. A central floating rectangular card containing a dominant closing message and the 3-dot motif."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, fluid background shapes in muted tones","Global film grain/noise texture overlay","Botanical silhouette drop-shadows implying natural lighting"],"optional_variants":["floating-card","textured-background","closing-message"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Thank you pages","Contact info frames"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be strictly rectangular with no border radius.
- Apply warm, vintage color grading to images to integrate with the Morandi color palette.
- Allow text or solid color blocks to overlap image edges to create depth.

【图标与装饰】
- Extremely minimal iconography. Rely more on the 3-dot color motif or simple thin-line circles with arrows for interactive cues.

【数据页构图】
- Top centered title. Lower area split vertically: a text block above a solid colored data block on the left, and a flush rectangular image on the right.

【图表风格】
- No traditional charts present. Data is displayed as oversized, high-contrast typographic percentages within solid color blocks.

【章节页构图】
- Extremely sparse. Title top left, short text top right. A wide horizontal image container spans the bottom half, framing a minimalist subject.

【收尾页构图】
- Background with organic shapes and botanical shadow overlays. A central floating rectangular card containing a dominant closing message and the 3-dot motif.

【禁止】
- Do not use highly saturated primary colors (neon, bright blue, pure red).
- Avoid heavily rounded image corners or playful geometric image masks.
- Do not clutter slides with bullet points; use paragraph blocks with ample leading.
- Do not remove the grain texture, as the flat colors will lose their intended tactile quality.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Interior design proposals、Lifestyle brand decks、Editorial mood boards、Artistic portfolios。
