# 莫兰迪风格PPT (10) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-10-f0e2c8d9

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-10-f0e2c8d9

## 风格名称
莫兰迪风格PPT (10) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-10-f0e2c8d9

## 风格描述
Editorial collage presentation with a muted Morandi palette, fluid organic shapes, and overlapping layered elements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominated by large color blocks of coral, mustard, and teal. Black used strictly for text and thin stroke accents.
- fonts: Bold, impactful sans-serif for display headers (often overlapping other elements). Clean, legible sans-serif for body copy.
- spacing: Loose and asymmetrical. Elements intentionally overlap and break container bounds.
- shape_language: Contrast between perfectly round circles with rigid thin offset strokes and highly organic, freeform background blobs.
- texture: Flat vector shapes mixed with rich photographic textures.
- grid: Freeform collage style. Disregards traditional symmetric grids in favor of overlapping asymmetrical clusters and vertical column splits.
- motion_or_depth: High depth achieved through multiple intersecting layers (background blob -> image -> giant text -> foreground cutout -> stroke overlay).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (10) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-10-f0e2c8d9」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial collage presentation with a muted Morandi palette, fluid organic shapes, and overlapping layered elements.
- 推荐配色：#FFFFFF、#F28D80、#F2B735、#327391、#000000

【不可丢失的风格锚点】
- Offset thin black circular strokes decorating solid colored circles
- Large fluid organic background blobs acting as corner anchors
- Vertical color-blocked layout divisions
- Intersecting giant typography layered behind and in front of image subjects

【字体】
- Use giant, heavy sans-serif headers that intersect with background shapes and images.
- Employ vertical text alignment for decorative sub-headings along the slide perimeters.
- Keep body copy small, left-aligned, and structured within specific color blocks.

【封面页构图】
- Central overlapping collage with organic corner shapes and giant intersecting background text

【内容页构图】
- Complex multi-column layout with vertical typography and overlapping edge elements

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central overlapping collage with organic corner shapes and giant intersecting background text","zones":["Central overlapping collage with organic corner shapes and giant intersecting background text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["hero-collage","intersecting-typography","editorial-cover"],"avoid":["Text-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact title slides","Visual mood setting"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-cutout","purpose":"Main focal subject, ideally with background removed","bbox":[0.3,0.05,0.4,0.8],"priority":1},{"id":"secondary-circle","purpose":"Supporting image in circular mask","bbox":[0.45,0.5,0.25,0.4],"priority":2}]}
- section: {"id":"section-primary","composition":"Vertical three-column split with a solid color center and edge-bleeding outer images","zones":["Vertical three-column split with a solid color center and edge-bleeding outer images"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["vertical-split","tri-pane","color-block"],"avoid":["Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Dual-image showcases with central context"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-bleed","purpose":"Tall left-aligned contextual image","bbox":[0.0,0.0,0.33,0.65],"priority":1},{"id":"right-bleed","purpose":"Tall right-aligned contextual image","bbox":[0.66,0.0,0.34,0.65],"priority":2}]}
- content: [{"id":"content-content","composition":"Complex multi-column layout with vertical typography and overlapping edge elements","zones":["Complex multi-column layout with vertical typography and overlapping edge elements"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["multi-column","vertical-text","dense-layout"],"avoid":["Glanceable executive summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Detailed product features","Multi-faceted text descriptions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-left-image","purpose":"Secondary supporting visual","bbox":[0.0,0.0,0.25,0.5],"priority":2},{"id":"bottom-right-image","purpose":"Primary overlapping lifestyle image","bbox":[0.55,0.5,0.25,0.5],"priority":1}]},{"id":"content-comparison","composition":"Asymmetrical quadrant split with large left media and stacked text/image components on the right","zones":["Asymmetrical quadrant split with large left media and stacked text/image components on the right"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["asymmetrical-split","quadrant","media-focus"],"avoid":["Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Product spotlights"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"left-main-image","purpose":"Primary subject showcase","bbox":[0.0,0.05,0.45,0.9],"priority":1},{"id":"top-right-image","purpose":"Secondary detailed shot","bbox":[0.5,0.05,0.25,0.4],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Four-item horizontal array featuring abstract colored circles with offset stroke outlines as bullet alternatives","zones":["Four-item horizontal array featuring abstract colored circles with offset stroke outlines as bullet alternatives"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["horizontal-list","abstract-icons","minimal"],"avoid":["Detailed paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Feature highlights","Simple timelines"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Vertical three-column split with a solid color center and edge-bleeding outer images","zones":["Vertical three-column split with a solid color center and edge-bleeding outer images"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["vertical-split","tri-pane","color-block"],"avoid":["Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Dual-image showcases with central context"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-bleed","purpose":"Tall left-aligned contextual image","bbox":[0.0,0.0,0.33,0.65],"priority":1},{"id":"right-bleed","purpose":"Tall right-aligned contextual image","bbox":[0.66,0.0,0.34,0.65],"priority":2}]}]
- quote: {"id":"quote-primary","composition":"Split pane with an image underlay on the left supporting a large quote box, and a numbered list on a solid block on the right","zones":["Split pane with an image underlay on the left supporting a large quote box, and a numbered list on a solid block on the right"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["quote-overlay","numbered-list","split-background"],"avoid":["Large image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key takeaways alongside a structured process"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"background-underlay","purpose":"Textural or contextual background beneath quote","bbox":[0.0,0.25,0.6,0.75],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Identical layout to cover page but acting as a bookend with closing text","zones":["Identical layout to cover page but acting as a bookend with closing text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Offset thin black circular strokes decorating solid colored circles","Large fluid organic background blobs acting as corner anchors","Vertical color-blocked layout divisions"],"optional_variants":["closing-collage","bookend","intersecting-typography"],"avoid":["Summary data","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you pages","Final contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero-cutout-closing","purpose":"Main focal subject, ideally with background removed","bbox":[0.3,0.05,0.4,0.8],"priority":1},{"id":"secondary-circle-closing","purpose":"Supporting image in circular mask","bbox":[0.45,0.5,0.25,0.4],"priority":2}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use subject cut-outs for high-impact hero slides.
- Group rectangular and circular cropped photos into overlapping asymmetrical clusters.
- Allow images to bleed off the edges of the canvas.

【图标与装饰】
- Replace literal icons with abstract solid-colored circles accompanied by offset, thin black ring outlines.

【数据页构图】
- Four-item horizontal array featuring abstract colored circles with offset stroke outlines as bullet alternatives

【图表风格】
- Data points are represented minimally, using thin horizontal progress bars or abstract circular markers.

【章节页构图】
- Vertical three-column split with a solid color center and edge-bleeding outer images

【收尾页构图】
- Identical layout to cover page but acting as a bookend with closing text

【禁止】
- Do not use rigid, symmetric grids for image galleries.
- Avoid literal or corporate clip-art icons.
- Do not constrain images entirely within standard placeholders; allow overlap.
- Avoid standard bulleted lists.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle editorial pitch、Creative portfolio showcase、Trendy brand guidelines。
