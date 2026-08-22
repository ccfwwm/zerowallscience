# 莫兰迪风格PPT (17) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-17-fd10f39c

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-17-fd10f39c

## 风格名称
莫兰迪风格PPT (17) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-17-fd10f39c

## 风格描述
A minimalist, editorial-style presentation utilizing stark typography, sharp geometric color blocks, and heavy reliance on premium fashion photography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Monochrome foundation (black/white) driven by high-contrast dark grey (#404040) structural blocks, allowing images to provide the primary color accents.
- fonts: Elegant serif for hero titles; clean geometric sans-serif for structured body copy, subtitles, and section headers.
- spacing: Wide, editorial margins with deliberate use of extreme negative space to balance heavy typographic elements.
- shape_language: Strictly orthogonal. Sharp rectangles, rigid grids, and hard edges with zero border radius.
- texture: Flat and matte for graphic elements, contrasting with the rich textures of the required photographic assets.
- grid: Modular editorial grid with frequent use of 50/50 splits, asymmetric columns, and overlapping bounding boxes.
- motion_or_depth: Completely flat. Depth is only suggested through the literal overlapping of graphic frames over photography.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (17) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-17-fd10f39c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, editorial-style presentation utilizing stark typography, sharp geometric color blocks, and heavy reliance on premium fashion photography.
- 推荐配色：#FFFFFF、#000000、#404040、#F5F5F5

【不可丢失的风格锚点】
- High-contrast minimalist typography mixing bold sans-serif with elegant serif
- Stark, floating dark grey rectangular color blocks as structural accents
- Editorial asymmetric layouts with abundant negative space
- Vertical typography acting as a graphical framing element

【字体】
- Use uppercase letters for titles and section headers to maintain rigid block alignments.
- Mix large serif display fonts with smaller sans-serif body text for editorial contrast.
- Employ 90-degree rotated text occasionally as a graphical watermarking element.

【封面页构图】
- Full-bleed background image with centered, high-contrast serif typography.

【内容页构图】
- Full-bleed monochromatic image with heavily overlaid left-aligned body text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with centered, high-contrast serif typography.","zones":["Full-bleed background image with centered, high-contrast serif typography."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["hero","centered","image-heavy"],"avoid":["Text-heavy content","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full bleed background establishing visual tone","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Minimalist section divider with oversized staggered text and floating rectangular blocks locking the layout corners.","zones":["Minimalist section divider with oversized staggered text and floating rectangular blocks locking the layout corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["staggered-text","corner-blocks","minimalist"],"avoid":["Body content","Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Big numbers","Quotes"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"top-right-accent","purpose":"Small corner mood image","bbox":[0.5,0.05,0.45,0.45],"priority":1}]}
- content: [{"id":"content-content","composition":"Full-bleed monochromatic image with heavily overlaid left-aligned body text.","zones":["Full-bleed monochromatic image with heavily overlaid left-aligned body text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["overlay","text-on-image","left-aligned"],"avoid":["Complex data","Detailed multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Manifestos"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bg-image","purpose":"Atmospheric background","bbox":[0,0,1,1],"priority":1}]},{"id":"content-comparison","composition":"Asymmetric layout with a thick vertical accent bar on one side and a horizontal strip of image crops in the center.","zones":["Asymmetric layout with a thick vertical accent bar on one side and a horizontal strip of image crops in the center."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["gallery-strip","asymmetric","edge-bar"],"avoid":["Large continuous text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Team features","Product highlights","Case study summaries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"strip-img-1","purpose":"Sequential gallery item","bbox":[0.05,0.3,0.25,0.3],"priority":1},{"id":"strip-img-2","purpose":"Sequential gallery item","bbox":[0.31,0.3,0.25,0.3],"priority":2},{"id":"strip-img-3","purpose":"Sequential gallery item","bbox":[0.57,0.3,0.25,0.3],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Split horizontal layout featuring a 2x2 grid of numbered items across a white top half and a dark grey bottom half.","zones":["Split horizontal layout featuring a 2x2 grid of numbered items across a white top half and a dark grey bottom half."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["numbered-list","split-horizontal","grid"],"avoid":["Dense paragraphs","Continuous narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Step-by-step processes","Four-point summaries"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"top-right-isolated","purpose":"Subject interacting with white space","bbox":[0.6,0.05,0.4,0.45],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Full-bleed monochromatic image with heavily overlaid left-aligned body text.","zones":["Full-bleed monochromatic image with heavily overlaid left-aligned body text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["overlay","text-on-image","left-aligned"],"avoid":["Complex data","Detailed multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Manifestos"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bg-image","purpose":"Atmospheric background","bbox":[0,0,1,1],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background image with massive, centered, heavy sans-serif typography overlay.","zones":["Full-bleed background image with massive, centered, heavy sans-serif typography overlay."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["High-contrast minimalist typography mixing bold sans-serif with elegant serif","Stark, floating dark grey rectangular color blocks as structural accents","Editorial asymmetric layouts with abundant negative space"],"optional_variants":["closing","hero-text","full-bleed"],"avoid":["Any secondary content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Big announcements"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Final impression full-bleed image","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images must be high-quality, editorial/fashion style with muted or monochromatic tones.
- Use full-bleed placements for covers, or strictly cropped rectangular shapes for grid layouts.
- Apply semi-transparent geometric overlays when text must cross complex photographic areas.

【图标与装饰】
- Minimalist. Use solid, single-color icons only when strictly necessary (e.g., social links, basic directional arrows).

【数据页构图】
- Split horizontal layout featuring a 2x2 grid of numbered items across a white top half and a dark grey bottom half.

【图表风格】
- No traditional charts observed. Data is presented via stark numbered typographic lists in grid formations.

【章节页构图】
- Minimalist section divider with oversized staggered text and floating rectangular blocks locking the layout corners.

【收尾页构图】
- Full-bleed background image with massive, centered, heavy sans-serif typography overlay.

【禁止】
- Avoid placing thin or light text directly over high-contrast areas of photographs without a protective overlay.
- Do not use rounded corners, bright primary colors, or drop shadows.
- Avoid cluttered layouts; if photography is missing, do not fill the space with unnecessary shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks、Fashion or lifestyle brand decks、Portfolio presentations、High-end minimalist proposals。
