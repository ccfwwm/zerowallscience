# 精选科技风7 · 模板 / linzi-tech-7-0cf19a16

## 风格ID
linzi-tech-7-0cf19a16

## 风格名称
精选科技风7 · 模板 / linzi-tech-7-0cf19a16

## 风格描述
A modern, technology-focused presentation template featuring abstract particle wave graphics, sharp geometric containers, and vibrant blue accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White or light gray backgrounds dominate; black for primary text; vibrant blue (#163BF5) for accents, borders, and branding; red (#FF4A4A) strictly for chart/data emphasis.
- fonts: Clean, geometric sans-serif (e.g., Helvetica or Arial). All-caps with wide tracking for major headings.
- spacing: Generous margins, centered focal points for transitions, 3- to 4-column balanced grid for content arrays.
- shape_language: Sharp right angles, thin uniform lines, circles used only for nodes/data points. High contrast between organic background waves and rigid foreground shapes.
- texture: Smooth flat shapes contrasted with intricate, dense dot-particle mesh waves.
- grid: Symmetrical centering for covers/transitions; strict vertical alignments for lists and timelines.
- motion_or_depth: Depth is implied entirely by the density and swooping lines of the background particle textures; foreground elements remain strictly flat.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风7 · 模板 / linzi-tech-7-0cf19a16」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, technology-focused presentation template featuring abstract particle wave graphics, sharp geometric containers, and vibrant blue accents.
- 推荐配色：#FFFFFF、#111111、#163BF5、#F4F5F7、#FF4A4A

【不可丢失的风格锚点】
- Abstract dot-matrix/particle wave background textures
- Top-right blue accent tab for logos/branding
- Sharp rectangular containers and thin border frames
- High-contrast, stark minimalist typography

【字体】
- Headings: All-caps, wide letter-spacing, bold or medium weight, typically black.
- Subtitles: All-caps, smaller scale, occasionally utilizing the primary blue.
- Body copy: Sentence case, regular weight, gray or black, left-aligned in multi-column layouts.

【封面页构图】
- Centered typography over a dense, landscape-like particle mesh, with a pseudo-search-bar element.

【内容页构图】
- Split layout: Left large image with intersecting typography box, right vertical list with icons.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography over a dense, landscape-like particle mesh, with a pseudo-search-bar element.","zones":["Centered typography over a dense, landscape-like particle mesh, with a pseudo-search-bar element."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["centered","tech-cover","minimal"],"avoid":["Text-heavy content","Detailed data","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Thematic introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered title and subtitle intersected by a swooping, dynamic particle wave, with a small action button below.","zones":["Centered title and subtitle intersected by a swooping, dynamic particle wave, with a small action button below."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["transition","wave-background"],"avoid":["Content lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout: Left large image with intersecting typography box, right vertical list with icons.","zones":["Split layout: Left large image with intersecting typography box, right vertical list with icons."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["image-left","icon-list"],"avoid":["Dense numerical data","copying source assets, source text, or an exact source arrangement"],"best_for":["About us summaries","Core features","Value propositions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-image","purpose":"contextual brand or feature imagery","bbox":[0.14,0.18,0.6,0.51],"priority":1}]},{"id":"content-comparison","composition":"Left aligned diamond-masked image paired with a right-aligned minimalist vertical timeline.","zones":["Left aligned diamond-masked image paired with a right-aligned minimalist vertical timeline."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["timeline","diamond-mask"],"avoid":["Detailed paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Company history","Project roadmaps"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"timeline-hero","purpose":"abstract or literal representation of timeline subject","bbox":[0.06,0.2,0.33,0.58],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left aligned diamond-masked image paired with a right-aligned minimalist vertical timeline.","zones":["Left aligned diamond-masked image paired with a right-aligned minimalist vertical timeline."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["timeline","diamond-mask"],"avoid":["Detailed paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Company history","Project roadmaps"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"timeline-hero","purpose":"abstract or literal representation of timeline subject","bbox":[0.06,0.2,0.33,0.58],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered title and subtitle intersected by a swooping, dynamic particle wave, with a small action button below.","zones":["Centered title and subtitle intersected by a swooping, dynamic particle wave, with a small action button below."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["transition","wave-background"],"avoid":["Content lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered, large solid black rectangle containing 'Thank You' text, set against a dynamic flowing particle background.","zones":["Centered, large solid black rectangle containing 'Thank You' text, set against a dynamic flowing particle background."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Abstract dot-matrix/particle wave background textures","Top-right blue accent tab for logos/branding","Sharp rectangular containers and thin border frames"],"optional_variants":["solid-plate","closing"],"avoid":["Any content slides","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into sharp geometric masks (rectangles or rounded diamonds).
- Text overlaps on images use solid or bordered container boxes to maintain legibility.

【图标与装饰】
- Thin-line, minimalist outlined icons.
- Monochrome or dual-tone (black/blue or black/red) matching the primary palette.
- Unboxed, placed directly above or beside corresponding text blocks.

【数据页构图】
- Left aligned diamond-masked image paired with a right-aligned minimalist vertical timeline.

【图表风格】
- Faux-3D bar charts using isometric rectangular prisms.
- Tear-drop/pin markers for data callouts with percentage values.
- Pictograms (human figures) used for demographic percentage visualization, utilizing gray for base and red/blue for fill.

【章节页构图】
- Centered title and subtitle intersected by a swooping, dynamic particle wave, with a small action button below.

【收尾页构图】
- Centered, large solid black rectangle containing 'Thank You' text, set against a dynamic flowing particle background.

【禁止】
- Avoid soft drop shadows; rely on flat colors and contrast.
- Do not use rounded sans-serif fonts; maintain rigid geometry.
- Avoid replacing particle backgrounds with realistic photography, as it breaks the tech aesthetic.
- Do not clutter the top-right corner; reserve it for the logo tab.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Technology company overviews、Software or SaaS product pitches、Data-driven quarterly reports、Modern corporate profiles。
