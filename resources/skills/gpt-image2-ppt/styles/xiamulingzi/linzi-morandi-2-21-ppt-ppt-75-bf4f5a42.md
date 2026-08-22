# 75 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-75-bf4f5a42

## 风格ID
linzi-morandi-2-21-ppt-ppt-75-bf4f5a42

## 风格名称
75 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-75-bf4f5a42

## 风格描述
A sophisticated, minimalist presentation system featuring earthy Morandi tones, elegant asymmetric layouts, subtle marble textures, and high-end editorial typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Beige/tan (#CBAF8D) as primary accent and background block color; warm grays for text; soft off-white/marble for large structural backgrounds.
- fonts: Primary: Clean, modern sans-serif. Secondary/Accent: Thin, stylized script or handwriting font for delicate subheadings.
- spacing: Generous margins, macro-whitespace dominant. Asymmetric but mathematically balanced padding around clustered text.
- shape_language: Strictly geometric. Perfect circles (often cropped by canvas edges) and sharp-edged rectangles.
- texture: Subtle, low-contrast marble/stone texture applied to secondary structural background panels.
- grid: Modular asymmetric grid. Frequent use of 1/4 or 1/5 screen-width vertical anchoring columns.
- motion_or_depth: Shallow depth created by 2-3 overlapping flat layers (e.g., textured background -> geometric shape -> framed photo -> text).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「75 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-75-bf4f5a42」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, minimalist presentation system featuring earthy Morandi tones, elegant asymmetric layouts, subtle marble textures, and high-end editorial typography.
- 推荐配色：#CBAF8D、#F4F4F4、#7D7D7D、#333333

【不可丢失的风格锚点】
- Vertical edge-spanning structural panels (often textured).
- Large, off-canvas geometric primitives (circles) used as background depth elements.
- Extreme tracking (letter-spacing) on primary uppercase headings.
- Framed imagery overlapping distinct background color zones.

【字体】
- Headings must be uppercase with extremely high letter tracking.
- Subheadings optionally use a thin script font for elegant contrast.
- Body text should use a highly legible sans-serif in medium-to-light weight with generous line height (1.4+).
- Vertical text alignments along extreme left/right margins are used for structural framing.

【封面页构图】
- Asymmetric split with a narrow vertical panel on the left edge. A large off-canvas circular element dominates the top right. Large typographic focal point centered in the remaining whitespace.

【内容页构图】
- Three uniform vertical rectangular cards evenly distributed. Images occupy the top half of each card; text occupies the bottom. Central card uses an inverted/accent background color for the text zone.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetric split with a narrow vertical panel on the left edge. A large off-canvas circular element dominates the top right. Large typographic focal point centered in the remaining whitespace.","zones":["Asymmetric split with a narrow vertical panel on the left edge. A large off-canvas circular element dominates the top right. Large typographic focal point centered in the remaining whitespace."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["minimal-cover","asymmetric-title","geometric-accent"],"avoid":["Data presentation","Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Narrow left-hand vertical text panel. Large edge-to-edge landscape image occupying the right 75% of the slide. A solid opaque color band overlays the bottom edge of the image containing title text.","zones":["Narrow left-hand vertical text panel. Large edge-to-edge landscape image occupying the right 75% of the slide. A solid opaque color band overlays the bottom edge of the image containing title text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["hero-image","lower-third-overlay","section-break"],"avoid":["Multi-point arguments","Detailed charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter dividers","Event announcements","Major milestones"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"hero-landscape","purpose":"Immersive section background","bbox":[0.27,0.1,0.69,0.8],"priority":1}]}
- content: [{"id":"content-content","composition":"Three uniform vertical rectangular cards evenly distributed. Images occupy the top half of each card; text occupies the bottom. Central card uses an inverted/accent background color for the text zone.","zones":["Three uniform vertical rectangular cards evenly distributed. Images occupy the top half of each card; text occupies the bottom. Central card uses an inverted/accent background color for the text zone."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["3-column-cards","alternating-colors","image-grid"],"avoid":["Single-focus narratives","Dense paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Service features","Product categories","Core values"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"card-img-1","purpose":"Category or feature representation","bbox":[0.08,0.26,0.24,0.35],"priority":1},{"id":"card-img-2","purpose":"Category or feature representation","bbox":[0.38,0.26,0.24,0.35],"priority":2},{"id":"card-img-3","purpose":"Category or feature representation","bbox":[0.68,0.26,0.24,0.35],"priority":3}]},{"id":"content-comparison","composition":"Left-heavy text block paired with a large, framed square image on the right. The image overlaps a distinct vertical background panel on the far right edge.","zones":["Left-heavy text block paired with a large, framed square image on the right. The image overlaps a distinct vertical background panel on the far right edge."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["split-layout","framed-photo","asymmetric-balance"],"avoid":["Multi-item lists","Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Founder profiles","Case study introductions","Featured product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-framed","purpose":"Main focal image","bbox":[0.48,0.15,0.34,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three uniform vertical rectangular cards evenly distributed. Images occupy the top half of each card; text occupies the bottom. Central card uses an inverted/accent background color for the text zone.","zones":["Three uniform vertical rectangular cards evenly distributed. Images occupy the top half of each card; text occupies the bottom. Central card uses an inverted/accent background color for the text zone."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["3-column-cards","alternating-colors","image-grid"],"avoid":["Single-focus narratives","Dense paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Service features","Product categories","Core values"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"card-img-1","purpose":"Category or feature representation","bbox":[0.08,0.26,0.24,0.35],"priority":1},{"id":"card-img-2","purpose":"Category or feature representation","bbox":[0.38,0.26,0.24,0.35],"priority":2},{"id":"card-img-3","purpose":"Category or feature representation","bbox":[0.68,0.26,0.24,0.35],"priority":3}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-heavy text block paired with a large, framed square image on the right. The image overlaps a distinct vertical background panel on the far right edge.","zones":["Left-heavy text block paired with a large, framed square image on the right. The image overlaps a distinct vertical background panel on the far right edge."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["split-layout","framed-photo","asymmetric-balance"],"avoid":["Multi-item lists","Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Founder profiles","Case study introductions","Featured product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-framed","purpose":"Main focal image","bbox":[0.48,0.15,0.34,0.7],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Large off-canvas circular shape on the left edge. A framed rectangular image overlaps this circle. Right side features a massive quotation mark graphic and a block of text.","zones":["Large off-canvas circular shape on the left edge. A framed rectangular image overlaps this circle. Right side features a massive quotation mark graphic and a block of text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["quote-layout","geometric-overlap","editorial-style"],"avoid":["Data-heavy comparisons","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Mission statements","Editorial highlights"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"quote-image","purpose":"Contextual imagery for quote","bbox":[0.07,0.28,0.41,0.43],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Nearly identical to the cover structure. Left vertical panel, top right off-canvas circle, central large typography. Rotated text on the far right.","zones":["Nearly identical to the cover structure. Left vertical panel, top right off-canvas circle, central large typography. Rotated text on the far right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Vertical edge-spanning structural panels (often textured).","Large, off-canvas geometric primitives (circles) used as background depth elements.","Extreme tracking (letter-spacing) on primary uppercase headings."],"optional_variants":["closing-slide","bookend-design","minimal-thanks"],"avoid":["Content summaries","Appendices","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing statements","Contact information","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images often feature a thick, even white border (polaroid style).
- Use of soft, diffuse drop shadows behind framed images to separate them from the background.
- Circular crops are used specifically for human profiles.
- Photography tone should be desaturated, warm, or vintage to match the earthy palette.

【图标与装饰】
- Icons are flat, solid, and uniformly colored in the primary accent tone (beige).
- Icons are typically unboxed, relying on white space for emphasis, or placed inside small circular containers.

【数据页构图】
- Three uniform vertical rectangular cards evenly distributed. Images occupy the top half of each card; text occupies the bottom. Central card uses an inverted/accent background color for the text zone.

【图表风格】
- No complex data charts present. Minimalist timelines use thin, bare horizontal lines and solid, single-color icons.

【章节页构图】
- Narrow left-hand vertical text panel. Large edge-to-edge landscape image occupying the right 75% of the slide. A solid opaque color band overlays the bottom edge of the image containing title text.

【收尾页构图】
- Nearly identical to the cover structure. Left vertical panel, top right off-canvas circle, central large typography. Rotated text on the far right.

【禁止】
- Avoid high-saturation or neon colors.
- Avoid heavy 3D bevels, gradients, or complex multi-layer shadows.
- Do not overcrowd slides; strict adherence to macro-whitespace is required.
- Avoid mixed image aspect ratios within a single comparative layout (e.g., card arrays).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
High-end fashion, interior design, or architectural portfolios.、Boutique agency capabilities decks.、Lifestyle brand guidelines or lookbooks.、Minimalist corporate overviews requiring a sophisticated touch.。
