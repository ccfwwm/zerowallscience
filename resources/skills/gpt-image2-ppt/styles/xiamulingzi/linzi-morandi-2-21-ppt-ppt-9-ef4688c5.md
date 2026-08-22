# 9 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-9-ef4688c5

## 风格ID
linzi-morandi-2-21-ppt-ppt-9-ef4688c5

## 风格名称
9 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-9-ef4688c5

## 风格描述
A minimalist, artistic presentation template featuring a 'Morandi' color palette, organic fluid shapes, and delicate line work suitable for creative or lifestyle topics.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background as canvas; slate blue, muted brick red, and sandy yellow as primary shape/accent colors; dark grey for typography.
- fonts: Elegant serif for primary headings; clean sans-serif for body copy and data labels.
- spacing: Generous margins with a focus on asymmetrical balance and airy, open layouts.
- shape_language: Primarily organic, fluid, and soft. Strict geometry is avoided except in functional diagrams (charts, pyramids).
- texture: Completely flat and matte. No gradients, shadows, or glossy effects.
- grid: Loose and unstructured. Elements often float or bleed off the edges rather than snapping to a rigid grid.
- motion_or_depth: Visual interest relies on 2D overlapping of flat, colored shapes rather than artificial depth or 3D effects.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「9 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-9-ef4688c5」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, artistic presentation template featuring a 'Morandi' color palette, organic fluid shapes, and delicate line work suitable for creative or lifestyle topics.
- 推荐配色：#F7F2EB、#4D6D7C、#A64F51、#F2CE9A、#2F383D

【不可丢失的风格锚点】
- Muted, low-saturation 'Morandi' color palette
- Organic, overlapping amoeba-like flat shapes
- Thin, continuous, sweeping vector lines
- Scattered, small pebble or confetti-like decorative shapes

【字体】
- Headings use a serif font and are often centered or left-aligned depending on the layout balance.
- Body text is sans-serif, keeping a clean and readable appearance against the stylized backgrounds.
- Subtitles and small decorative text often use a contrasting accent color (like muted red).

【封面页构图】
- Asymmetrical split composition with text anchored left and large organic shapes bleeding off the right and top edges.

【内容页构图】
- Structured layout with a centered title, a main text block, a rectangular image slot, and an offset solid color block for highlighted text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split composition with text anchored left and large organic shapes bleeding off the right and top edges.","zones":["Asymmetrical split composition with text anchored left and large organic shapes bleeding off the right and top edges."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["minimal","asymmetrical","fluid-shapes"],"avoid":["Data heavy content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Hero statements"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered typography framed by a cluster of overlapping organic shapes in the bottom right and a sweeping thin line from top left.","zones":["Centered typography framed by a cluster of overlapping organic shapes in the bottom right and a sweeping thin line from top left."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["centered","corner-cluster","minimal"],"avoid":["Detailed lists","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key quotes"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Structured layout with a centered title, a main text block, a rectangular image slot, and an offset solid color block for highlighted text.","zones":["Structured layout with a centered title, a main text block, a rectangular image slot, and an offset solid color block for highlighted text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["split-layout","image-text","framed"],"avoid":["Full screen imagery","Complex data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Text with supporting image","Highlighting key statistics"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-image","purpose":"Supporting visual content","bbox":[0.08,0.57,0.55,0.24],"priority":1}]},{"id":"content-comparison","composition":"Left-aligned stacked pyramid diagram composed of flat polygons, with corresponding text descriptions aligned to the right via thin connecting lines.","zones":["Left-aligned stacked pyramid diagram composed of flat polygons, with corresponding text descriptions aligned to the right via thin connecting lines."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["pyramid","hierarchy","diagram"],"avoid":["Linear timelines","Unrelated lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Hierarchical information","Funnel processes","Tiered concepts"],"evidence_pages":["page-08"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Horizontal timeline with a divided pill-shaped central track, top-aligned labels, and a full-width bottom text description area.","zones":["Horizontal timeline with a divided pill-shaped central track, top-aligned labels, and a full-width bottom text description area."],"content_capacity":{"density":"medium","max_items":7},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["timeline","horizontal","process"],"avoid":["Hierarchical structures","Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","Historical timelines","Roadmaps"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered typography framed by a cluster of overlapping organic shapes in the bottom right and a sweeping thin line from top left.","zones":["Centered typography framed by a cluster of overlapping organic shapes in the bottom right and a sweeping thin line from top left."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["centered","corner-cluster","minimal"],"avoid":["Detailed lists","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key quotes"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing message heavily framed on the left by large, overlapping fluid shapes bleeding off the edge.","zones":["Centered closing message heavily framed on the left by large, overlapping fluid shapes bleeding off the edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation 'Morandi' color palette","Organic, overlapping amoeba-like flat shapes","Thin, continuous, sweeping vector lines"],"optional_variants":["closing","heavy-shapes","centered-text"],"avoid":["Data presentation","Detailed summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used sparsely.
- When present, images are contained in simple rectangular frames without borders or shadows, allowing the organic background elements to dominate the style.

【图标与装饰】
- Extremely minimal use of icons.
- When used, icons are simple, flat, white silhouettes placed inside colored geometric containers.

【数据页构图】
- Horizontal timeline with a divided pill-shaped central track, top-aligned labels, and a full-width bottom text description area.

【图表风格】
- Charts use flat, solid colors directly from the core palette.
- Gridlines and axes are minimized or removed for a cleaner look.
- Diagrams (like pyramids) adapt basic geometric shapes but keep the flat, matte color treatment of the overall system.

【章节页构图】
- Centered typography framed by a cluster of overlapping organic shapes in the bottom right and a sweeping thin line from top left.

【收尾页构图】
- Centered closing message heavily framed on the left by large, overlapping fluid shapes bleeding off the edge.

【禁止】
- Harsh, highly saturated, or neon colors.
- Drop shadows, bevels, or 3D effects on shapes.
- Sharp, rigid geometric background patterns.
- Cluttered layouts with minimal white space.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Lifestyle brand pitches、Creative agency credentials、Soft-skills training modules、Minimalist corporate overviews。
