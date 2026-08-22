# 41 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-41-a8098b46

## 风格ID
linzi-morandi-2-21-ppt-ppt-41-a8098b46

## 风格名称
41 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-41-a8098b46

## 风格描述
A minimalist, editorial presentation template featuring muted Morandi colors, fluid background shapes, and asymmetrical layouts for lifestyle contexts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds are predominantly warm light gray; accents, shapes, and headings utilize slate blue, terracotta, and sand in a balanced rotation.
- fonts: Clean, geometric sans-serif for headings (heavy/bold weights) and highly legible standard sans-serif for body copy; outlined numerals used decoratively.
- spacing: Generous, asymmetrical margins with tight structural grouping within individual content blocks.
- shape_language: A strict dichotomy: background elements are exclusively fluid and organic, while content containers (photos/cards) are strictly sharp-edged rectangles.
- texture: Flat, vector-based color blocking with subtle layering; no drop shadows or gradients.
- grid: Unconventional modular grid; elements often span multiple columns asymmetrically, anchored by strong horizontal and vertical alignments.
- motion_or_depth: Depth is achieved purely through 2.5D overlapping of translucent and opaque vector shapes over or under photographic elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「41 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-41-a8098b46」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, editorial presentation template featuring muted Morandi colors, fluid background shapes, and asymmetrical layouts for lifestyle contexts.
- 推荐配色：#DFDCDA、#697A81、#C57641、#E2CCA6、#AFAFB5

【不可丢失的风格锚点】
- Muted, earthy Morandi color palette
- Fluid, organic 'blob' background shapes
- Rigid, unrounded rectangular image crops
- Peripheral vertical text and outlined overlapping corner numerals
- Asymmetrical, editorial-style negative space

【字体】
- Primary headings use bold, geometric sans-serif, often adopting an accent color (terracotta or slate).
- Body copy is dark gray, medium/regular weight sans-serif with comfortable line height.
- Small metadata or labels are uppercase, heavily tracked (letter-spaced), and rotated vertically along slide edges.
- Large decorative numbers use a stroke-only (outline) style and are pushed to the corners.

【封面页构图】
- Central title lockup layered over a cluster of organic background shapes, framed by peripheral vertical text.

【内容页构图】
- Two-column text layout with a bold staggered heading on the left and balanced paragraphs on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central title lockup layered over a cluster of organic background shapes, framed by peripheral vertical text.","zones":["Central title lockup layered over a cluster of organic background shapes, framed by peripheral vertical text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["centered","organic-shapes","minimal"],"avoid":["Data-heavy content","Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Asymmetrical split screen with a large vertical hero image on the left and stacked content (image + text) on the right.","zones":["Asymmetrical split screen with a large vertical hero image on the left and stacked content (image + text) on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["split-layout","hero-image","asymmetrical"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Chapter introductions","Promotional offers"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"hero-left","purpose":"Primary visual anchor","bbox":[0.25,0.0,0.3,1.0],"priority":1},{"id":"secondary-right","purpose":"Contextual supporting image","bbox":[0.57,0.0,0.28,0.5],"priority":2}]}
- content: [{"id":"content-content","composition":"Two-column text layout with a bold staggered heading on the left and balanced paragraphs on the right.","zones":["Two-column text layout with a bold staggered heading on the left and balanced paragraphs on the right."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["text-heavy","two-column","staggered-heading"],"avoid":["Visual-heavy galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive summaries","Detailed descriptions"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Left-anchored vertical image balanced by a right-side composition of staggered text blocks and supporting images.","zones":["Left-anchored vertical image balanced by a right-side composition of staggered text blocks and supporting images."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["editorial-grid","multi-image","text-adjacent"],"avoid":["Data charts","Minimalist quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend overviews","Multi-product features","Editorial articles"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"left-column","purpose":"Primary mood image","bbox":[0.03,0.05,0.36,0.85],"priority":1},{"id":"bottom-center","purpose":"Secondary detail image","bbox":[0.43,0.45,0.28,0.55],"priority":2},{"id":"bottom-right","purpose":"Tertiary detail image","bbox":[0.74,0.62,0.24,0.38],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Two-column text layout with a bold staggered heading on the left and balanced paragraphs on the right.","zones":["Two-column text layout with a bold staggered heading on the left and balanced paragraphs on the right."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["text-heavy","two-column","staggered-heading"],"avoid":["Visual-heavy galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive summaries","Detailed descriptions"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central solid color block containing a prominent quotation, overlapping subtle background fluid shapes.","zones":["Central solid color block containing a prominent quotation, overlapping subtle background fluid shapes."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["quote","card-layout","centered"],"avoid":["Complex data","Multi-image displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Testimonials","Pull quotes"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Central solid color block containing a prominent quotation, overlapping subtle background fluid shapes.","zones":["Central solid color block containing a prominent quotation, overlapping subtle background fluid shapes."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["quote","card-layout","centered"],"avoid":["Complex data","Multi-image displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Testimonials","Pull quotes"],"evidence_pages":["page-02"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"A purely decorative pattern of scattered, overlapping fluid shapes centrally clustered on a light background.","zones":["A purely decorative pattern of scattered, overlapping fluid shapes centrally clustered on a light background."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy Morandi color palette","Fluid, organic 'blob' background shapes","Rigid, unrounded rectangular image crops"],"optional_variants":["pattern","abstract-art","divider"],"avoid":["Any content presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Transitions","Section breaks","Closing slides"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into sharp squares or rectangles with no border radius.
- Images frequently overlap background shapes or are overlapped by text.
- Full-bleed or edge-to-edge placement is used selectively to anchor split layouts.

【图标与装饰】
- Extremely minimal icon usage; relies primarily on oversized typography (e.g., large quotation marks) instead of traditional icons.

【数据页构图】
- Two-column text layout with a bold staggered heading on the left and balanced paragraphs on the right.

【图表风格】
- No charts are present; relies on lists, numbered steps, and typographic callouts for data visualization.

【章节页构图】
- Asymmetrical split screen with a large vertical hero image on the left and stacked content (image + text) on the right.

【收尾页构图】
- A purely decorative pattern of scattered, overlapping fluid shapes centrally clustered on a light background.

【禁止】
- Avoid rounded corners on images or content boxes.
- Do not use drop shadows, gradients, or 3D effects on shapes.
- Avoid vibrant, highly saturated primary colors that break the muted Morandi theme.
- Do not center-align body text; keep paragraphs left-aligned for editorial neatness.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks and portfolio presentations.、Lifestyle brand guidelines.、Creative agency credentials.、Product showcases requiring an elegant, modern aesthetic.。
