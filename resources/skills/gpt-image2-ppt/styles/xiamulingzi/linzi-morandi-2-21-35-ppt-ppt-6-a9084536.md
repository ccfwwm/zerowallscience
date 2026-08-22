# 莫兰迪风格PPT (6) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-6-a9084536

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-6-a9084536

## 风格名称
莫兰迪风格PPT (6) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-6-a9084536

## 风格描述
An elegant, fashion-editorial presentation featuring a muted Morandi color palette, asymmetrical overlapping rectangles, and high-contrast typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominate, with structural rectangles in muted olive and khaki. Text is predominantly dark charcoal gray.
- fonts: High-contrast traditional serif for primary headers; clean, geometric sans-serif for body copy and uppercase subheadings.
- spacing: Generous outer margins, loose tracking on uppercase subtitles, breathable padding between distinct content columns.
- shape_language: Strict, sharp-edged rectangles for photos and accent blocks; perfect circles or rounded squares exclusively for enclosing icons.
- texture: Flat, matte color blocks with no gradients or drop shadows, relying on subtle color contrast for depth.
- grid: Asymmetrical 2-column or 3-column layouts with intentional overlapping elements that break rigid boundaries.
- motion_or_depth: Depth is created entirely through 2D overlap (e.g., text spanning across a photo and a solid background, or rectangles layered behind text).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (6) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-6-a9084536」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, fashion-editorial presentation featuring a muted Morandi color palette, asymmetrical overlapping rectangles, and high-contrast typography.
- 推荐配色：#FFFFFF、#5A5B5A、#D5D6B6、#A8B084、#E5E5E5

【不可丢失的风格锚点】
- Muted earthy 'Morandi' color palette
- Asymmetrical overlapping rectangular color blocks
- Elegant serif headers paired with clean sans-serif text
- Generous use of negative space in editorial-style grids

【字体】
- Main titles use a prominent serif font in sentence case.
- Subtitles utilize an uppercase sans-serif font with wide tracking.
- Body text is set in a small, legible sans-serif with generous line height.
- Two-tone text colors are occasionally used within a single header line to highlight specific words (e.g., matching the accent palette).

【封面页构图】
- Full-bleed background image with a dark overlay, left-aligned typography anchored by a semi-transparent overlapping rectangular block.

【内容页构图】
- Asymmetrical layout with a center-left image overlapped by a top-left color block containing text, paired with a right-aligned text column.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with a dark overlay, left-aligned typography anchored by a semi-transparent overlapping rectangular block.","zones":["Full-bleed background image with a dark overlay, left-aligned typography anchored by a semi-transparent overlapping rectangular block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["image-heavy","dark-mode","minimal"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-bg","purpose":"Full-bleed background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Split asymmetric layout: prominent left-aligned text column and a large vertical image block on the right, accented by top-right color block.","zones":["Split asymmetric layout: prominent left-aligned text column and a large vertical image block on the right, accented by top-right color block."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["split-layout","image-right","asymmetrical"],"avoid":["Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction","About Us","Key Message"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-img-1","purpose":"Large vertical editorial image","bbox":[0.55,0.12,0.35,0.75],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetrical layout with a center-left image overlapped by a top-left color block containing text, paired with a right-aligned text column.","zones":["Asymmetrical layout with a center-left image overlapped by a top-left color block containing text, paired with a right-aligned text column."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["overlapping-blocks","image-left"],"avoid":["Bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlight","Team profile","Product description"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-img-2","purpose":"Vertical portrait image","bbox":[0.22,0.25,0.3,0.75],"priority":1}]},{"id":"content-comparison","composition":"Left-aligned image bleeding off the left and bottom edges, accompanied by right-side text and structural floating rectangles.","zones":["Left-aligned image bleeding off the left and bottom edges, accompanied by right-side text and structural floating rectangles."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["image-bleed-left","text-right"],"avoid":["Charts and graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Storytelling","Concept introduction"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"content-img-3","purpose":"Large anchored image","bbox":[0,0.15,0.45,0.85],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split asymmetric layout: prominent left-aligned text column and a large vertical image block on the right, accented by top-right color block.","zones":["Split asymmetric layout: prominent left-aligned text column and a large vertical image block on the right, accented by top-right color block."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["split-layout","image-right","asymmetrical"],"avoid":["Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction","About Us","Key Message"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-img-1","purpose":"Large vertical editorial image","bbox":[0.55,0.12,0.35,0.75],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: A 3x2 grid of text blocks separated by circular arrow icons, under a central main header.","zones":["A 3x2 grid of text blocks separated by circular arrow icons, under a central main header."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["grid-layout","list","text-heavy"],"avoid":["Visual storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Table of contents","Feature matrices"],"evidence_pages":["page-06"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"A 3x2 grid of text blocks separated by circular arrow icons, under a central main header.","zones":["A 3x2 grid of text blocks separated by circular arrow icons, under a central main header."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["grid-layout","list","text-heavy"],"avoid":["Visual storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Table of contents","Feature matrices"],"evidence_pages":["page-06"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Dark solid background with left-aligned typography intersected by a muted solid color rectangle.","zones":["Dark solid background with left-aligned typography intersected by a muted solid color rectangle."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earthy 'Morandi' color palette","Asymmetrical overlapping rectangular color blocks","Elegant serif headers paired with clean sans-serif text"],"optional_variants":["dark-mode","closing","text-only"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information","Q&A"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are given large, sharp-edged rectangular crops.
- Photographs often bleed off the edge of the slide or span full vertical height.
- Images are frequently juxtaposed or overlapped with solid-colored rectangular accent blocks.

【图标与装饰】
- Flat, solid white icons placed centrally within colored circles or rounded squares.
- Icon backgrounds map to the primary muted color palette (khaki, olive, gray).

【数据页构图】
- Split asymmetric layout: prominent left-aligned text column and a large vertical image block on the right, accented by top-right color block.

【图表风格】
- No traditional charts; data and concepts are visualized through clean icon grids, spatial lists, and minimalist vector graphics (e.g., road/map pin).

【章节页构图】
- Split asymmetric layout: prominent left-aligned text column and a large vertical image block on the right, accented by top-right color block.

【收尾页构图】
- Dark solid background with left-aligned typography intersected by a muted solid color rectangle.

【禁止】
- Avoid bright, saturated, or primary colors.
- Do not use rounded corners on structural layout blocks or photographs.
- Avoid dense, wall-to-wall text blocks; maintain high negative space.
- Do not use drop shadows, gradients, or 3D effects on shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion pitch decks、Editorial lookbooks、Elegant brand identity guidelines、Minimalist lifestyle or wellness presentations、Creative portfolio showcases。
