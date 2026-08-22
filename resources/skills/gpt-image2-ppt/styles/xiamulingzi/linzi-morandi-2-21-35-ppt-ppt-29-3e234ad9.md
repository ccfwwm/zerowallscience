# 莫兰迪风格PPT (29) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-29-3e234ad9

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-29-3e234ad9

## 风格名称
莫兰迪风格PPT (29) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-29-3e234ad9

## 风格描述
Modern minimalist presentation template utilizing pastel color blocking, generous whitespace, and sharp geometric accents for editorial-style layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Pastel blue acts as the primary structural accent and highlight. Dark charcoal (#333333) used for primary typography for high contrast. Light gray backgrounds for depth.
- fonts: Clean, highly legible sans-serif used uniformly across headings and body text to maintain a modern, neutral mood. Fallbacks: Helvetica, Arial.
- spacing: Generous outer margins. High internal padding within colored text blocks.
- shape_language: Strictly rectangular. Sharp 90-degree corners with no rounding.
- texture: Flat, matte finish. Zero use of drop shadows, gradients, or 3D beveling.
- grid: Asymmetric multi-column underlying grids, frequently splitting 30/70 or 50/50 with overlapping center elements.
- motion_or_depth: Depth is created entirely through 2D planar overlap (e.g., text elements overlapping image edges or color bands).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (29) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-29-3e234ad9」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Modern minimalist presentation template utilizing pastel color blocking, generous whitespace, and sharp geometric accents for editorial-style layouts.
- 推荐配色：#BCE6FF、#333333、#FFFFFF、#F2F2F2、#8B8B8B

【不可丢失的风格锚点】
- Pastel blue vertical dividing bands
- 3x3 geometric square grid accents
- Large vertical faded watermark text on slide edges
- Asymmetrical overlapping text blocks

【字体】
- Headings use sentence case with high contrast in scale compared to body copy.
- Large, rotated, ultra-light watermark text is used decoratively on the left or right bleeds.
- Body copy is kept sparse, utilizing medium line height for readability.

【封面页构图】
- Left-aligned wide image intersecting a central vertical highlight band, paired with large right-aligned overlapping title.

【内容页构图】
- Three-column layout with split typography flanking a central tall portrait image, anchored by a bottom-left 3x3 grid accent.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned wide image intersecting a central vertical highlight band, paired with large right-aligned overlapping title.","zones":["Left-aligned wide image intersecting a central vertical highlight band, paired with large right-aligned overlapping title."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["hero-image","minimalist-cover","asymmetric-split"],"avoid":["Data presentation","Dense lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Main cover image","bbox":[0.0,0.13,0.56,0.74],"priority":1}]}
- section: {"id":"section-primary","composition":"Diagonal composition featuring two staggered image blocks, each heavily overlapped by a contrasting solid-color text card.","zones":["Diagonal composition featuring two staggered image blocks, each heavily overlapped by a contrasting solid-color text card."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["staggered-cards","team-layout","overlapping-blocks"],"avoid":["Data charts","Single-focus narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Dual case studies","Comparisons"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"profile-1","purpose":"Portrait for the first profile/item","bbox":[0.04,0.33,0.22,0.6],"priority":1},{"id":"profile-2","purpose":"Portrait for the second profile/item","bbox":[0.73,0.05,0.23,0.61],"priority":2}]}
- content: [{"id":"content-content","composition":"Three-column layout with split typography flanking a central tall portrait image, anchored by a bottom-left 3x3 grid accent.","zones":["Three-column layout with split typography flanking a central tall portrait image, anchored by a bottom-left 3x3 grid accent."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["center-image","text-split","editorial-layout"],"avoid":["Large tables","Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-pillar","purpose":"Portrait lifestyle or product image","bbox":[0.31,0.0,0.23,0.72],"priority":1}]},{"id":"content-comparison","composition":"Split-background 50/50 layout with title/intro on the left and a stacked list with square-backed icons on the right.","zones":["Split-background 50/50 layout with title/intro on the left and a stacked list with square-backed icons on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["split-background","icon-list","vertical-stack"],"avoid":["Full-screen imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Agendas","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Large solid color block holding the heading on the left, counterbalanced by three large staggered statistical figures on the right.","zones":["Large solid color block holding the heading on the left, counterbalanced by three large staggered statistical figures on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["large-numbers","stats-highlight","color-block"],"avoid":["Complex data visualizations","Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","KPI highlights","Impact statements"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-column layout with split typography flanking a central tall portrait image, anchored by a bottom-left 3x3 grid accent.","zones":["Three-column layout with split typography flanking a central tall portrait image, anchored by a bottom-left 3x3 grid accent."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["center-image","text-split","editorial-layout"],"avoid":["Large tables","Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-pillar","purpose":"Portrait lifestyle or product image","bbox":[0.31,0.0,0.23,0.72],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Mirrors the cover slide structural motif: Large left-aligned image, central vertical dividing band, and overlapping right-aligned typography.","zones":["Mirrors the cover slide structural motif: Large left-aligned image, central vertical dividing band, and overlapping right-aligned typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Pastel blue vertical dividing bands","3x3 geometric square grid accents","Large vertical faded watermark text on slide edges"],"optional_variants":["closing","bookend","asymmetric-split"],"avoid":["Body content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-image","purpose":"Final reinforcing brand image","bbox":[0.02,0.19,0.55,0.59],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into sharp rectangles.
- Frequently positioned to bleed off one edge of the slide or overlap a solid color block.

【图标与装饰】
- Minimalist thin-line icons placed centrally inside solid-colored square backgrounds.
- Icon background colors rotate through the core palette (gray, blue, dark gray).

【数据页构图】
- Large solid color block holding the heading on the left, counterbalanced by three large staggered statistical figures on the right.

【图表风格】
- Flat, 2D clustered bar charts.
- No vertical grid lines; subtle horizontal y-axis lines only.
- Chart colors directly map to the template palette (black, pastel blue, medium gray).

【章节页构图】
- Diagonal composition featuring two staggered image blocks, each heavily overlapped by a contrasting solid-color text card.

【收尾页构图】
- Mirrors the cover slide structural motif: Large left-aligned image, central vertical dividing band, and overlapping right-aligned typography.

【禁止】
- Avoid rounded corners, gradients, or drop shadows on any elements.
- Do not center-align primary body text; keep strong left-alignment for structural integrity.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Modern corporate overviews、Minimalist product pitches、Editorial style guides。
