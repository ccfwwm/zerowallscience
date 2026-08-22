# 优雅线条（37）---木七设计 · ppt模板 / linzi-morandi-ppt-37-b4ef9b0c

## 风格ID
linzi-morandi-ppt-37-b4ef9b0c

## 风格名称
优雅线条（37）---木七设计 · ppt模板 / linzi-morandi-ppt-37-b4ef9b0c

## 风格描述
Minimalist presentation using a Morandi teal palette, subtle grid background, and overlapping translucent circular motifs for elegant structuring.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white base, dark teal for primary text/icons, medium and light teals for accents, shapes, and overlays.
- fonts: Clean, modern sans-serif typography. Bold weights for headings, regular for body text.
- spacing: Generous margins guided by the implicit background grid, creating a breathable layout.
- shape_language: Primarily circular for accents and image masks, contrasting with sharp rectangular content blocks.
- texture: Faint, technical graph-paper grid on the lowest background layer.
- grid: Implicit multi-column structure aligned with the visible background texture.
- motion_or_depth: Flat design where depth is achieved strictly through overlapping translucent elements and solid color blocking.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（37）---木七设计 · ppt模板 / linzi-morandi-ppt-37-b4ef9b0c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist presentation using a Morandi teal palette, subtle grid background, and overlapping translucent circular motifs for elegant structuring.
- 推荐配色：#F8FAFA、#EBEFEF、#5A7D7C、#81A3A1、#C8DCDA

【不可丢失的风格锚点】
- Subtle graph-paper grid pattern on base background
- Overlapping translucent and solid circular shapes in corners
- Horizontal pill-shaped text highlights behind major headings
- Muted Morandi teal color spectrum

【字体】
- Slide titles are typically top-left with a small circular accent mark.
- Major structural headings are centered and anchored by a light translucent pill-shaped highlight.
- Body text uses lighter font weights and adequate line height for readability.

【封面页构图】
- Centered typography with pill highlight, flanked by asymmetrical clustered circle motifs in opposite corners over a grid background.

【内容页构图】
- Large left-aligned circular image composition with a horizontal array of circular icon headers and body text on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography with pill highlight, flanked by asymmetrical clustered circle motifs in opposite corners over a grid background.","zones":["Centered typography with pill highlight, flanked by asymmetrical clustered circle motifs in opposite corners over a grid background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["cover-slide","centered-title","circle-motifs"],"avoid":["Detailed data","Heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Title presentation","Presentation openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered numeral inside a solid circle, above a title with pill highlight, framed by corner circle clusters.","zones":["Centered numeral inside a solid circle, above a title with pill highlight, framed by corner circle clusters."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["section-break","numbered","minimalist"],"avoid":["Content delivery","Images","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter markers","Section transitions"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Large left-aligned circular image composition with a horizontal array of circular icon headers and body text on the right.","zones":["Large left-aligned circular image composition with a horizontal array of circular icon headers and body text on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["circular-image","icon-list","split-layout"],"avoid":["Financial tables","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Abstract summaries","Concept introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-left","purpose":"Conceptual representation","bbox":[0.1,0.2,0.35,0.6],"priority":1}]},{"id":"content-comparison","composition":"Split layout with a rectangular image on the left and a stacked solid-color text/quote block on the right.","zones":["Split layout with a rectangular image on the left and a stacked solid-color text/quote block on the right."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["split-screen","image-and-block","quote-layout"],"avoid":["Process flows","Data heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Key takeaways","Mission statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-split","purpose":"Thematic visual","bbox":[0.05,0.25,0.45,0.5],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four-column horizontal flow featuring staggered text blocks above and below solid rectangular icon blocks connected by thin lines.","zones":["Four-column horizontal flow featuring staggered text blocks above and below solid rectangular icon blocks connected by thin lines."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["process-flow","timeline","icon-blocks"],"avoid":["Large images","Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Timelines","Feature lists"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large left-aligned circular image composition with a horizontal array of circular icon headers and body text on the right.","zones":["Large left-aligned circular image composition with a horizontal array of circular icon headers and body text on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["circular-image","icon-list","split-layout"],"avoid":["Financial tables","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Abstract summaries","Concept introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-left","purpose":"Conceptual representation","bbox":[0.1,0.2,0.35,0.6],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered typography with pill highlight, flanked by asymmetrical clustered circle motifs in opposite corners over a grid background.","zones":["Centered typography with pill highlight, flanked by asymmetrical clustered circle motifs in opposite corners over a grid background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Subtle graph-paper grid pattern on base background","Overlapping translucent and solid circular shapes in corners","Horizontal pill-shaped text highlights behind major headings"],"optional_variants":["closing-slide","bookend","centered-title"],"avoid":["New content introduction","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into perfect circles or displayed as sharp rectangles.
- Solid color blocks frequently overlap edges of rectangular images to create integrated compositions.
- Circular images may use thick white strokes when placed on colored backgrounds.

【图标与装饰】
- Minimalist, flat white icons.
- Icons are consistently housed within solid dark teal circular or rectangular containers.

【数据页构图】
- Four-column horizontal flow featuring staggered text blocks above and below solid rectangular icon blocks connected by thin lines.

【图表风格】
- Clean lines, flat colors utilizing the core Morandi teal palette.
- No 3D effects, shadows, or gradients; strictly 2D flat data visualization.

【章节页构图】
- Centered numeral inside a solid circle, above a title with pill highlight, framed by corner circle clusters.

【收尾页构图】
- Centered typography with pill highlight, flanked by asymmetrical clustered circle motifs in opposite corners over a grid background.

【禁止】
- Avoid vibrant, neon, or highly saturated colors.
- Do not use drop shadows, gradients, or 3D effects on shapes.
- Avoid decorative, serif, or overly stylized fonts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic defense and thesis presentations、Minimalist corporate reports、Elegant design or architecture portfolios、Calm, focused research summaries。
