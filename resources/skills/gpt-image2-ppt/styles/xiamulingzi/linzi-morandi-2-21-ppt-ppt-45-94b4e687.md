# 45 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-45-94b4e687

## 风格ID
linzi-morandi-2-21-ppt-ppt-45-94b4e687

## 风格名称
45 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-45-94b4e687

## 风格描述
Boho-chic editorial presentation featuring terracotta tones, botanical shadow overlays, and asymmetrical grid layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Terracotta/rust as primary accent, ochre for secondary highlights, off-white/beige for backgrounds, dark charcoal for body text.
- fonts: Elegant serif for primary headings, clean geometric sans-serif for body text and metadata.
- spacing: Generous asymmetrical padding, often employing 50/50 vertical splits or floating center-aligned cards.
- shape_language: Sharp rectangular blocks for content/photos contrasted with organic, fluid background shapes and circular dot accents.
- texture: Visible grain/noise on backgrounds paired with organic botanical shadows.
- grid: Asymmetrical editorial grid with overlapping elements and broken alignments.
- motion_or_depth: Moderate depth created via subtle drop shadows on central cards and leaf shadows cast onto the background layer.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「45 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-45-94b4e687」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Boho-chic editorial presentation featuring terracotta tones, botanical shadow overlays, and asymmetrical grid layouts.
- 推荐配色：#B14725、#F0EBE1、#E79F45、#333333、#FFFFFF

【不可丢失的风格锚点】
- Earthy terracotta and ochre accent blocks
- Three-dot horizontal decorative dividers
- Botanical silhouette shadow overlays on textured backgrounds
- Floating white content cards with soft drop shadows

【字体】
- Use high-contrast serif headers in accent colors.
- Separate headings from body text using small 3-dot motifs.
- Employ uppercase tracking for subheadings and eyebrow text.
- Keep body paragraphs sans-serif and left-aligned with generous line height.

【封面页构图】
- Floating central title card over textured organic background with corner shadows

【内容页构图】
- Two-column split with lower-left solid stat block and right-aligned vertical image

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Floating central title card over textured organic background with corner shadows","zones":["Floating central title card over textured organic background with corner shadows"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["floating-card","textured-background","centered"],"avoid":["Data-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"50/50 vertical split with isolated image on white left and solid color text block right","zones":["50/50 vertical split with isolated image on white left and solid color text block right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["split-screen","color-block","high-contrast"],"avoid":["Full-bleed image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Featured profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left-square","purpose":"portrait or featured subject","bbox":[0.05,0.3,0.4,0.61],"priority":1}]}
- content: [{"id":"content-content","composition":"Two-column split with lower-left solid stat block and right-aligned vertical image","zones":["Two-column split with lower-left solid stat block and right-aligned vertical image"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["stat-block","split-layout","asymmetrical"],"avoid":["Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Introduction with statistics"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-hero","purpose":"contextual editorial image","bbox":[0.43,0.35,0.5,0.57],"priority":1}]},{"id":"content-comparison","composition":"Three-column masonry layout with floating image, text blocks, and bottom-right accent square","zones":["Three-column masonry layout with floating image, text blocks, and bottom-right accent square"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["masonry","asymmetrical","floating-elements"],"avoid":["Sequential reading","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Multi-faceted descriptions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-portrait","purpose":"central visual focus","bbox":[0.35,0.13,0.3,0.54],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Two-column split with lower-left solid stat block and right-aligned vertical image","zones":["Two-column split with lower-left solid stat block and right-aligned vertical image"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["stat-block","split-layout","asymmetrical"],"avoid":["Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Introduction with statistics"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-hero","purpose":"contextual editorial image","bbox":[0.43,0.35,0.5,0.57],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: 50/50 vertical split with isolated image on white left and solid color text block right","zones":["50/50 vertical split with isolated image on white left and solid color text block right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["split-screen","color-block","high-contrast"],"avoid":["Full-bleed image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Featured profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left-square","purpose":"portrait or featured subject","bbox":[0.05,0.3,0.4,0.61],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Stacked alternating horizontal bands of text and large landscape images separated by oversized quote marks","zones":["Stacked alternating horizontal bands of text and large landscape images separated by oversized quote marks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["alternating-rows","quotes","stacked-images"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Dual narratives"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"top-right-image","purpose":"visual accompaniment to top quote","bbox":[0.47,0.08,0.48,0.39],"priority":1},{"id":"bottom-left-image","purpose":"visual accompaniment to bottom quote","bbox":[0.04,0.56,0.48,0.39],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Floating central title card over textured organic background with corner shadows (identical to cover)","zones":["Floating central title card over textured organic background with corner shadows (identical to cover)"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Earthy terracotta and ochre accent blocks","Three-dot horizontal decorative dividers","Botanical silhouette shadow overlays on textured backgrounds"],"optional_variants":["floating-card","textured-background","centered","closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use warm, high-contrast editorial or vintage-toned photography.
- Display images as sharp rectangles without border radii.
- Allow images to intersect with solid color accent blocks.

【图标与装饰】
- Minimalist iconography; primarily using large decorative quotation marks and simple geometric dots.

【数据页构图】
- Two-column split with lower-left solid stat block and right-aligned vertical image

【图表风格】
- Highlight key metrics using large typographic numbers overlaid on solid accent-colored blocks.

【章节页构图】
- 50/50 vertical split with isolated image on white left and solid color text block right

【收尾页构图】
- Floating central title card over textured organic background with corner shadows (identical to cover)

【禁止】
- Avoid bright, neon, or primary colors that break the earthy palette.
- Do not use rounded corners on photos or major content blocks.
- Avoid dense text walls; maintain editorial whitespace.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle lookbooks、Boutique agency case studies、Editorial portfolios、Brand identity presentations。
