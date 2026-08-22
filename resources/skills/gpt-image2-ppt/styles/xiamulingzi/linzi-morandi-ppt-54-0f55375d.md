# 优雅线条（54）---木七设计 · ppt模板 / linzi-morandi-ppt-54-0f55375d

## 风格ID
linzi-morandi-ppt-54-0f55375d

## 风格名称
优雅线条（54）---木七设计 · ppt模板 / linzi-morandi-ppt-54-0f55375d

## 风格描述
Minimalist presentation system utilizing a grayscale palette, fluid organic background shapes, delicate botanical line-art, and editorial serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary charcoal for high contrast, mid-grays for secondary elements, soft light gray for canvas backgrounds, white for negative text.
- fonts: Elegant serif (e.g., Playfair Display) for structural headers to impart an editorial feel; clean geometric sans-serif for body copy.
- spacing: Generous, breathable margins with asymmetrical padding. Elements are allowed to float with wide gutters.
- shape_language: Contrast between fluid organic background geometry and strict structural foreground elements (rectangles, perfect circles, pills).
- texture: Subtle canvas/brushstroke textures applied exclusively to dark background macro-shapes; smooth vector finish on foregrounds.
- grid: Asymmetrical, freeform grid anchored by strong, consistent left-alignments for textual content blocks.
- motion_or_depth: Flat design where depth is achieved exclusively through the overlapping of opaque shapes and intersecting thin line-art.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（54）---木七设计 · ppt模板 / linzi-morandi-ppt-54-0f55375d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist presentation system utilizing a grayscale palette, fluid organic background shapes, delicate botanical line-art, and editorial serif typography.
- 推荐配色：#353739、#7D7D7D、#C4C4C4、#F3F3F3

【不可丢失的风格锚点】
- Monochrome desaturated color palette
- Fluid, overlapping organic background blobs
- Delicate, continuous line-art motifs (botanical/abstract)
- Pill-shaped and perfectly circular content containers
- High-contrast editorial serif typography for primary headers

【字体】
- Use classic serif fonts for prominent English headers to establish an elegant tone.
- Utilize modern sans-serif fonts for detailed body copy to ensure legibility.
- Maintain high line-heights and relaxed tracking for a breathable reading experience.
- Anchor text to left alignments, allowing right edges to rag naturally against background shapes.

【封面页构图】
- Dark textured organic shapes dominating the canvas, overlaid with thin line-art, centered prominent serif text, small pill badge at the bottom.

【内容页构图】
- Header top-left, followed by stacked horizontal pill shapes containing distinct content blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Dark textured organic shapes dominating the canvas, overlaid with thin line-art, centered prominent serif text, small pill badge at the bottom.","zones":["Dark textured organic shapes dominating the canvas, overlaid with thin line-art, centered prominent serif text, small pill badge at the bottom."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["dark-theme","hero-title","abstract-background"],"avoid":["Data-heavy slides","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Light canvas with a dominant dark circular badge on the left, primary text block on the right, intersecting botanical lines.","zones":["Light canvas with a dominant dark circular badge on the left, primary text block on the right, intersecting botanical lines."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["light-theme","numbered-section","asymmetrical"],"avoid":["Complex data","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Header top-left, followed by stacked horizontal pill shapes containing distinct content blocks.","zones":["Header top-left, followed by stacked horizontal pill shapes containing distinct content blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["pill-containers","horizontal-list","stacked"],"avoid":["Dense paragraphs","Photography","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Key takeaways","Sequential lists"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Split layout: stacked text blocks and a dark horizontal band on the left; a large, sharp rectangular image block on the right.","zones":["Split layout: stacked text blocks and a dark horizontal band on the left; a large, sharp rectangular image block on the right."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["split-layout","image-right","text-heavy"],"avoid":["Data visualization","Timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Product details","About us"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"hero","purpose":"replaceable real image","bbox":[0.55,0.2,0.35,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Header top-left, horizontal sequence of flat chevron arrows in varying shades.","zones":["Header top-left, horizontal sequence of flat chevron arrows in varying shades."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["chevron-timeline","process-flow","horizontal-sequence"],"avoid":["Unrelated lists","Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Milestones"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Light canvas with a dominant dark circular badge on the left, primary text block on the right, intersecting botanical lines.","zones":["Light canvas with a dominant dark circular badge on the left, primary text block on the right, intersecting botanical lines."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["light-theme","numbered-section","asymmetrical"],"avoid":["Complex data","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Dark textured organic shapes dominating the canvas, overlaid with thin line-art, centered prominent serif text, small pill badge at the bottom.","zones":["Dark textured organic shapes dominating the canvas, overlaid with thin line-art, centered prominent serif text, small pill badge at the bottom."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Monochrome desaturated color palette","Fluid, overlapping organic background blobs","Delicate, continuous line-art motifs (botanical/abstract)"],"optional_variants":["bookend","dark-theme","minimalist-closing"],"avoid":["Content summaries","Next steps","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Strictly monochrome or highly desaturated imagery to match the color palette.
- Use sharp, unrounded rectangular frames for all photographs.
- Favor minimalist, structural, or architectural photography to contrast with organic backgrounds.
- Overlap solid color blocks onto images to create integrated captions or titles.

【图标与装饰】
- Use perfectly circular solid backgrounds for icons.
- Employ ultra-minimalist, flat white iconography inside dark gray containers.
- Avoid multi-colored or highly detailed illustrative icons.

【数据页构图】
- Header top-left, horizontal sequence of flat chevron arrows in varying shades.

【图表风格】
- Represent timelines using flat, consecutive chevron shapes in descending gray tones.
- Display key statistics inside floating circular nodes of varying scales.
- Avoid 3D effects, shadows, or gridlines on data visualizations.

【章节页构图】
- Light canvas with a dominant dark circular badge on the left, primary text block on the right, intersecting botanical lines.

【收尾页构图】
- Dark textured organic shapes dominating the canvas, overlaid with thin line-art, centered prominent serif text, small pill badge at the bottom.

【禁止】
- Highly saturated or neon colors.
- Drop shadows, bevels, or 3D layer effects.
- Symmetrical, rigid, highly structured corporate grids.
- Full-color lifestyle or highly textured stock photography.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
High-end architectural or interior design proposals、Editorial lookbooks and fashion portfolios、Minimalist art or photography showcases、Boutique consulting agency profiles。
