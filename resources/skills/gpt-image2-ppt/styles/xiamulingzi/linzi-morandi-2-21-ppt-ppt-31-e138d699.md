# 31 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-31-e138d699

## 风格ID
linzi-morandi-2-21-ppt-ppt-31-e138d699

## 风格名称
31 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-31-e138d699

## 风格描述
A stylish, organic template featuring a Morandi pastel palette, fluid blob shapes, delicate line-art accents, and soft shadow elevated content cards.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Pastel bases (beige/sand) with soft rose, sage, and slate accents. Dark slate/charcoal is strictly used for high-contrast typography.
- fonts: Clean, geometric sans-serif for headings with generous tracking; legible, lightweight sans-serif for body copy.
- spacing: Airy and relaxed. Wide margins around floating elements to emphasize negative space.
- shape_language: A striking contrast between strictly structured, rounded-corner rectangles (cards) and highly irregular, fluid background shapes.
- texture: Flat, matte vector layers accented by very thin, hand-drawn line art.
- grid: Fluid and asymmetrical. Content is often staggered or overlaps background elements loosely rather than adhering to rigid columns.
- motion_or_depth: Distinct dual-layer depth: a flat painted background layer of blobs, overlaid with a 'floating' foreground layer of UI-like cards lifted by soft drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「31 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-31-e138d699」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A stylish, organic template featuring a Morandi pastel palette, fluid blob shapes, delicate line-art accents, and soft shadow elevated content cards.
- 推荐配色：#F4EBE4、#D6A5A3、#D9BA9D、#9FB4A8、#839CA6、#222E35

【不可丢失的风格锚点】
- Fluid, organic 'blob' background shapes
- Muted, low-saturation pastel color palette
- Floating white content cards with soft, diffuse drop shadows
- Delicate, continuous-line art graphic accents
- Generous border radii on all image and content containers

【字体】
- Headings: Bold, dark slate, often overlapping background shape boundaries.
- Subtitles: Muted colors (matching the palette), sometimes accompanied by small line accents.
- Body text: Light sans-serif, reduced opacity or lighter grey/slate to establish clear hierarchy.
- Interactive elements: Text inside pill shapes acts as tags or buttons.

【封面页构图】
- Centered typography with a pill-shaped subtitle, framed by corner fluid blobs and a central graphic element.

【内容页构图】
- Split layout with layered text and list on the left, and a partially masked, organically framed image on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography with a pill-shaped subtitle, framed by corner fluid blobs and a central graphic element.","zones":["Centered typography with a pill-shaped subtitle, framed by corner fluid blobs and a central graphic element."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["centered","minimal","organic-frame"],"avoid":["Detailed information","Image-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section transitions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Top title leading into a split lower section: horizontal data bars on the left, and a trio of rounded cards with masked top images on the right.","zones":["Top title leading into a split lower section: horizontal data bars on the left, and a trio of rounded cards with masked top images on the right."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["data-plus-cards","wavy-mask","dashboard-lite"],"avoid":["Single hero messages","Timeline events","copying source assets, source text, or an exact source arrangement"],"best_for":["Service offerings","Pricing tiers","Capability summaries"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"service-img-1","purpose":"Service/Project header image","bbox":[0.34,0.34,0.18,0.35],"priority":1},{"id":"service-img-2","purpose":"Service/Project header image","bbox":[0.55,0.34,0.18,0.35],"priority":2},{"id":"service-img-3","purpose":"Service/Project header image","bbox":[0.76,0.34,0.18,0.35],"priority":3}]}
- content: [{"id":"content-content","composition":"Split layout with layered text and list on the left, and a partially masked, organically framed image on the right.","zones":["Split layout with layered text and list on the left, and a partially masked, organically framed image on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["split-layout","list-highlight","organic-mask"],"avoid":["Full-screen data","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Project details","Feature highlights","Introduction of key concepts"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"project-showcase","purpose":"Atmospheric or project-specific image","bbox":[0.45,0.25,0.55,0.65],"priority":1}]},{"id":"content-comparison","composition":"Dynamic split layout featuring a sweeping background curve on one side and a large, full-height cutout subject on the other, annotated by a floating shape.","zones":["Dynamic split layout featuring a sweeping background curve on one side and a large, full-height cutout subject on the other, annotated by a floating shape."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["cutout-hero","sweeping-curve","annotated"],"avoid":["Standard bulleted lists","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member introductions","Product spotlights","Hero statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-cutout","purpose":"Full-height isolated subject image","bbox":[0.4,0.0,0.4,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split layout with layered text and list on the left, and a partially masked, organically framed image on the right.","zones":["Split layout with layered text and list on the left, and a partially masked, organically framed image on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["split-layout","list-highlight","organic-mask"],"avoid":["Full-screen data","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Project details","Feature highlights","Introduction of key concepts"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"project-showcase","purpose":"Atmospheric or project-specific image","bbox":[0.45,0.25,0.55,0.65],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned vertical timeline axis connecting horizontal content rows, each featuring a date badge, thumbnail, details, and an end tag.","zones":["Left-aligned vertical timeline axis connecting horizontal content rows, each featuring a date badge, thumbnail, details, and an end tag."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["timeline","list","scheduled"],"avoid":["Large text blocks","Hero imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Schedules","Event agendas","Process steps"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"thumb-1","purpose":"Event thumbnail","bbox":[0.18,0.32,0.12,0.14],"priority":1},{"id":"thumb-2","purpose":"Event thumbnail","bbox":[0.18,0.52,0.12,0.14],"priority":2},{"id":"thumb-3","purpose":"Event thumbnail","bbox":[0.18,0.72,0.12,0.14],"priority":3}]}]
- agenda: {"id":"agenda-primary","composition":"Left-aligned vertical timeline axis connecting horizontal content rows, each featuring a date badge, thumbnail, details, and an end tag.","zones":["Left-aligned vertical timeline axis connecting horizontal content rows, each featuring a date badge, thumbnail, details, and an end tag."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["timeline","list","scheduled"],"avoid":["Large text blocks","Hero imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Schedules","Event agendas","Process steps"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"thumb-1","purpose":"Event thumbnail","bbox":[0.18,0.32,0.12,0.14],"priority":1},{"id":"thumb-2","purpose":"Event thumbnail","bbox":[0.18,0.52,0.12,0.14],"priority":2},{"id":"thumb-3","purpose":"Event thumbnail","bbox":[0.18,0.72,0.12,0.14],"priority":3}]}
- closing: {"id":"closing-primary","composition":"Stacked, overlapping text pills in the center over a sweeping organic background curve, with a neat row of icon-based contact info at the very bottom.","zones":["Stacked, overlapping text pills in the center over a sweeping organic background curve, with a neat row of icon-based contact info at the very bottom."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, organic 'blob' background shapes","Muted, low-saturation pastel color palette","Floating white content cards with soft, diffuse drop shadows"],"optional_variants":["closing","overlapping-pills","contact-footer"],"avoid":["Summaries","Data presentations","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A transitions","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are enclosed in heavily rounded rectangles (corner radius ~24px).
- Some images feature fluid, wavy masking on one edge (e.g., bottom edge).
- Subjects are occasionally extracted from backgrounds (cutouts) and placed directly over the organic blobs.
- Text overlays on images use subtle, dark bottom gradients for legibility.

【图标与装饰】
- Minimalist, thin line-art style.
- Icons are often placed inside solid pastel circles or soft organic blobs.
- Small, solid vector elements are used sparingly for UI components like checkmarks or stars.

【数据页构图】
- Split layout with layered text and list on the left, and a partially masked, organically framed image on the right.

【图表风格】
- Data visualization is extremely simplified, fitting the minimalist aesthetic.
- Progress bars use rounded pill shapes with pastel gradient fills.
- Donut charts are clean circles with pastel track segments and empty centers for percentage text.

【章节页构图】
- Top title leading into a split lower section: horizontal data bars on the left, and a trio of rounded cards with masked top images on the right.

【收尾页构图】
- Stacked, overlapping text pills in the center over a sweeping organic background curve, with a neat row of icon-based contact info at the very bottom.

【禁止】
- Avoid harsh right angles or sharp corners; everything must be rounded or fluid.
- Avoid primary, highly saturated colors.
- Avoid dense, wall-to-wall text without generous line-height and margin.
- Avoid rigid 50/50 split grids; favor overlapping asymmetrical arrangements.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Lifestyle and wellness brand pitches、Modern, friendly corporate overviews、Design and architectural presentations。
