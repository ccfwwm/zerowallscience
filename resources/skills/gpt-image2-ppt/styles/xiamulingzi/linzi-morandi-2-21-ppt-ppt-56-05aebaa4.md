# 56 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-56-05aebaa4

## 风格ID
linzi-morandi-2-21-ppt-ppt-56-05aebaa4

## 风格名称
56 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-56-05aebaa4

## 风格描述
Sophisticated editorial lookbook presentation featuring a rich dark brown palette with mustard and rust accents. Strict rectangular geometry and bold typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark brown background creates high contrast for white text; mustard and rust used strictly for accents, backgrounds of small modules, and highlights.
- fonts: Elegant, geometric sans-serif headings, often italicized and heavily tracked; legible sans-serif for body text.
- spacing: Magazine-style wide margins with dense, clustered text blocks balanced by large empty spaces.
- shape_language: Exclusively sharp rectangles and squares; no circles or rounded corners.
- texture: Flat, matte color blocks contrasting with rich photographic textures.
- grid: Modular multi-column structures (2-column split, 3-column galleries, 4-row lists).
- motion_or_depth: Strictly flat layering; depth is achieved solely through color contrast and overlapping elements (text over images, blocks under text).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「56 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-56-05aebaa4」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Sophisticated editorial lookbook presentation featuring a rich dark brown palette with mustard and rust accents. Strict rectangular geometry and bold typography.
- 推荐配色：#46281e、#ffffff、#f69d41、#9d3f27

【不可丢失的风格锚点】
- Dark coffee background across all slides
- Mustard and rust-colored rectangular accent blocks behind titles or text
- Double forward slash '//' used as decorative quote marks
- Strict rectangular, unrounded image crops
- Five-star rating graphic elements

【字体】
- Titles often feature a colored rectangular underlay behind the first few characters
- Key focal words in high-impact areas use bold italics
- Blockquotes marked with offset '//' characters at start and end
- Hierarchical font sizing with extreme contrast between hero text and fine-print body copy

【封面页构图】
- Full-bleed background image with centered, large, tracked-out italic typography

【内容页构图】
- Asymmetric split layout with highlighted title, floating quote block, and large portrait image

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with centered, large, tracked-out italic typography","zones":["Full-bleed background image with centered, large, tracked-out italic typography"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["hero-image","centered-text","minimalist"],"avoid":["Data heavy content","Multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section transitions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-bg","purpose":"Full bleed atmospheric background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"2x2 masonry-style grid on the right featuring solid color text blocks above square images","zones":["2x2 masonry-style grid on the right featuring solid color text blocks above square images"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["2x2-grid","color-blocks","masonry"],"avoid":["Long form reading","Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Mood boards","Service summaries"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"grid-image-1","purpose":"Bottom left grid image","bbox":[0.5,0.52,0.21,0.38],"priority":1},{"id":"grid-image-2","purpose":"Bottom right grid image","bbox":[0.73,0.52,0.21,0.38],"priority":2}]}
- content: [{"id":"content-content","composition":"Asymmetric split layout with highlighted title, floating quote block, and large portrait image","zones":["Asymmetric split layout with highlighted title, floating quote block, and large portrait image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["split-layout","quote","portrait-image"],"avoid":["Quantitative data","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product highlights","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-portrait","purpose":"Hero portrait or product shot","bbox":[0.64,0.1,0.3,0.8],"priority":1}]},{"id":"content-comparison","composition":"Top-right heavy image layout with lower descriptive text and an isolated bottom-right accent block","zones":["Top-right heavy image layout with lower descriptive text and an isolated bottom-right accent block"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["asymmetric","image-top-right","icon-block"],"avoid":["Full width charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Service descriptions","Process overviews"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-landscape","purpose":"Atmospheric or detailed visual context","bbox":[0.5,0.1,0.45,0.52],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Vertical split with a bold text statement and background square on the left, and an icon-driven list on the right","zones":["Vertical split with a bold text statement and background square on the left, and an icon-driven list on the right"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["list","iconography","vertical-split"],"avoid":["Storytelling","Large photography","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Feature lists","Core competencies"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetric split layout with highlighted title, floating quote block, and large portrait image","zones":["Asymmetric split layout with highlighted title, floating quote block, and large portrait image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["split-layout","quote","portrait-image"],"avoid":["Quantitative data","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product highlights","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-portrait","purpose":"Hero portrait or product shot","bbox":[0.64,0.1,0.3,0.8],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Full-width landscape image strip intersecting text zones","zones":["Full-width landscape image strip intersecting text zones"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["horizontal-band","overlay-text","quote"],"avoid":["Dense paragraphs","Multiple distinct topics","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Brand pillars","Evocative statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-landscape","purpose":"Panoramic lifestyle or texture shot","bbox":[0.05,0.33,0.75,0.55],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-bleed background image mirroring the cover, with centered bold closing typography","zones":["Full-bleed background image mirroring the cover, with centered bold closing typography"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Dark coffee background across all slides","Mustard and rust-colored rectangular accent blocks behind titles or text","Double forward slash '//' used as decorative quote marks"],"optional_variants":["closing","hero-image","centered-text"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Q&A introduction","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Full bleed closing atmospheric background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds with dark overlays for covers
- Large portrait and landscape crops fitted into strict column grids
- No borders, shadows, or rounded edges on images

【图标与装饰】
- Solid white, minimalist, flat icons
- Icons consistently scaled and aligned with adjacent text blocks in list views

【数据页构图】
- Vertical split with a bold text statement and background square on the left, and an icon-driven list on the right

【图表风格】
- Minimal data visualization present; relies on text lists, icons, and structured grids rather than standard charts

【章节页构图】
- 2x2 masonry-style grid on the right featuring solid color text blocks above square images

【收尾页构图】
- Full-bleed background image mirroring the cover, with centered bold closing typography

【禁止】
- Avoid rounded corners on images or shapes
- Avoid light backgrounds (breaks the dark editorial theme)
- Avoid drop shadows or 3D effects
- Do not overlap thin text directly over bright or high-contrast areas of images
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Interior design portfolios、Luxury brand guidelines、Creative agency profiles。
