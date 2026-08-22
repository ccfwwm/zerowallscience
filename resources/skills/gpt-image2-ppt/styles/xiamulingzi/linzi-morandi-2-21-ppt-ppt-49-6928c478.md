# 49 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-49-6928c478

## 风格ID
linzi-morandi-2-21-ppt-ppt-49-6928c478

## 风格名称
49 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-49-6928c478

## 风格描述
An elegant, editorial-style presentation template featuring strict rectangular color blocking, a muted mauve palette, and split-screen image layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background uses dusty mauve/taupe (#BAA6A8). Contrast accents rely on deep rose (#B56D71) and occasional muted mustard (#A5946A). Text is strictly white (#FFFFFF) for high contrast against mid-tones.
- fonts: Clean, modern sans-serif. Titles use uppercase with wide tracking. Body copy uses standard leading and lighter weights.
- spacing: Generous internal margins within color blocks. Strict alignment to invisible 2-column or 3-column vertical grid boundaries.
- shape_language: Exclusively sharp, non-rounded rectangles. Modular, interlocking rectangular zones.
- texture: Flat vector color blocks contrasted with rich photographic textures and simulated organic silhouette drop-shadows (e.g., foliage).
- grid: Asymmetric vertical splits (often 1/3 to 2/3 ratios) and edge-to-edge modular masonry layouts.
- motion_or_depth: Primarily flat 2D layering, enhanced occasionally by botanical shadow overlays that create a false sense of environmental depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「49 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-49-6928c478」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style presentation template featuring strict rectangular color blocking, a muted mauve palette, and split-screen image layouts.
- 推荐配色：#BAA6A8、#B56D71、#FFFFFF、#C8B6B7、#A5946A

【不可丢失的风格锚点】
- Muted, low-contrast background tones
- Strict orthogonal geometric color blocking
- Full-bleed edge-to-edge image zones
- Organic botanical shadow overlays used as subtle background textures
- Delicate, high-tracking uppercase typography for headings

【字体】
- Use uppercase sans-serif with wide letter-spacing for all primary headings.
- Body text should remain lightweight and left-aligned within its container block.
- Use solid rectangular accent bars adjacent to titles for emphasis rather than font-weight changes.
- Ensure high contrast by keeping primary text white against the mid-tone colored backgrounds.

【封面页构图】
- 1/3 vertical solid color block on left with accent rectangle, 2/3 full-bleed image on right.

【内容页构图】
- Three-zone vertical layout: narrow solid left column, vertical image strip, wide text area with pill-shaped button.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"1/3 vertical solid color block on left with accent rectangle, 2/3 full-bleed image on right.","zones":["1/3 vertical solid color block on left with accent rectangle, 2/3 full-bleed image on right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["split-screen","asymmetric","editorial-cover"],"avoid":["Data heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Primary visual establishing theme","bbox":[0.32,0.0,0.68,1.0],"priority":1}]}
- section: {"id":"section-primary","composition":"Perfect 50/50 vertical split, solid color block on left with accent bar, full-bleed image on right.","zones":["Perfect 50/50 vertical split, solid color block on left with accent bar, full-bleed image on right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["50-50-split","half-bleed","minimalist"],"avoid":["Multi-point lists","Comparison tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Key quotes","Product feature highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"right-half-image","purpose":"Prominent thematic visual","bbox":[0.5,0.0,0.5,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Three-zone vertical layout: narrow solid left column, vertical image strip, wide text area with pill-shaped button.","zones":["Three-zone vertical layout: narrow solid left column, vertical image strip, wide text area with pill-shaped button."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["vertical-slice","button-cta","shadow-overlay"],"avoid":["Full width imagery","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction pages","Mission statements","Call-to-action slides"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"vertical-slice","purpose":"Atmospheric vertical visual","bbox":[0.18,0.0,0.31,1.0],"priority":1}]},{"id":"content-comparison","composition":"Three-zone layout: left text block, central vertical image slice, right list block with contrasting background.","zones":["Three-zone layout: left text block, central vertical image slice, right list block with contrasting background."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["three-column","color-blocked-list","vertical-divider"],"avoid":["Large horizontal charts","Group photos","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Service breakdowns","Text-heavy comparisons"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"center-divider","purpose":"Visual pacing between text columns","bbox":[0.36,0.15,0.21,0.85],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left narrow full-bleed image, right side featuring a horizontal row of three solid-color vertical cards.","zones":["Left narrow full-bleed image, right side featuring a horizontal row of three solid-color vertical cards."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["three-cards","column-layout","color-variants"],"avoid":["Long continuous paragraphs","Large singular focus images","copying source assets, source text, or an exact source arrangement"],"best_for":["Pricing tiers","Core service pillars","Value propositions"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"left-anchor","purpose":"Establishing visual anchor","bbox":[0.05,0.0,0.26,1.0],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered title tab dropping from top edge, 2x2 grid of icon-text clusters.","zones":["Centered title tab dropping from top edge, 2x2 grid of icon-text clusters."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["2x2-grid","icon-list","top-tab-header"],"avoid":["Deep textual narratives","Complex timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Core values","Feature summaries"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Centered title tab dropping from top edge, 2x2 grid of icon-text clusters.","zones":["Centered title tab dropping from top edge, 2x2 grid of icon-text clusters."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["2x2-grid","icon-list","top-tab-header"],"avoid":["Deep textual narratives","Complex timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Core values","Feature summaries"],"evidence_pages":["page-01"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"1/3 vertical solid color block on left with accent rectangle, 2/3 full-bleed image on right.","zones":["1/3 vertical solid color block on left with accent rectangle, 2/3 full-bleed image on right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-contrast background tones","Strict orthogonal geometric color blocking","Full-bleed edge-to-edge image zones"],"optional_variants":["split-screen","bookend","closing"],"avoid":["Summaries","Detailed references","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final contact info","Closing statements"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero-bg","purpose":"Final impression visual","bbox":[0.32,0.0,0.68,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should primarily be full-bleed within their designated orthogonal grid zones.
- Do not use rounded corners or borders on images; let the modular grid frame them naturally.
- Select editorial, desaturated, or color-graded photography that harmonizes with the muted template palette.

【图标与装饰】
- Use simple, flat, white line-art or solid icons.
- Enclose icons in simple geometric shapes (circles or squares) to maintain modularity.
- Keep icon sizing relatively small to preserve the elegant, minimalist aesthetic.

【数据页构图】
- Left narrow full-bleed image, right side featuring a horizontal row of three solid-color vertical cards.

【图表风格】
- No distinct data charts present; use text-based multi-column cards for data points.
- If charts are added, they should use flat styling with colors derived strictly from the established muted palette, avoiding 3D effects.

【章节页构图】
- Perfect 50/50 vertical split, solid color block on left with accent bar, full-bleed image on right.

【收尾页构图】
- 1/3 vertical solid color block on left with accent rectangle, 2/3 full-bleed image on right.

【禁止】
- Do not use harsh, opaque drop shadows on text (as seen on the cover/closing), as it breaks the modern flat aesthetic.
- Avoid bright, highly saturated primary colors that clash with the 'Morandi' palette.
- Do not use rounded shapes, circles, or diagonal cuts for image frames.
- Avoid floating images without a clear connection to the rectangular grid system.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Editorial lookbooks、Fashion or lifestyle brand decks、Creative agency portfolios、Art gallery or exhibition proposals。
