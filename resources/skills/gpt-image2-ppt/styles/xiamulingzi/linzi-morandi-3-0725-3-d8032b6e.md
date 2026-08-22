# 3 · 3.07更新高级色25 / linzi-morandi-3-0725-3-d8032b6e

## 风格ID
linzi-morandi-3-0725-3-d8032b6e

## 风格名称
3 · 3.07更新高级色25 / linzi-morandi-3-0725-3-d8032b6e

## 风格描述
Elegant presentation featuring a muted Morandi color palette, organic brushstroke accents, and a mix of soft geometric layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background as base. Dusty rose, soft beige, and mauve used as accent colors for shapes, charts, and brush textures. Dark grey strictly for all text and icons.
- fonts: Elegant Serif for primary titles; clean, readable Sans-serif for body text and data labels.
- spacing: Generous margins. Content blocks are well-separated, often utilizing split-screen layouts to enforce breathing room.
- shape_language: A mix of organic (brush strokes) and soft geometric (circles, rounded-top rectangles, soft puzzle pieces).
- texture: Prominent use of watercolor brush textures on title slides and as corner accents.
- grid: Primarily relies on 2-column vertical splits (50/50 or 1/3-2/3) and horizontal 4-column arrays.
- motion_or_depth: Depth is created through overlapping elements, such as circles bridging two background color zones or interlocking puzzle shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「3 · 3.07更新高级色25 / linzi-morandi-3-0725-3-d8032b6e」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant presentation featuring a muted Morandi color palette, organic brushstroke accents, and a mix of soft geometric layouts.
- 推荐配色：#C88681、#DDC0AB、#9D8B96、#F7F5F0、#7D7D7D

【不可丢失的风格锚点】
- Muted, low-saturation color palette
- Diagonal watercolor brushstroke framing elements
- Soft geometry: circles and rectangles with rounded top corners
- Monochrome grey typography for all text elements

【字体】
- Titles use a Serif font to convey elegance and formality.
- Body text uses Sans-serif for readability at smaller sizes.
- All text is unified by a single medium-dark grey color, avoiding stark black.

【封面页构图】
- Diagonal organic textures framing a central-right typography cluster.

【内容页构图】
- Horizontal array of vertical cards with rounded top corners, anchored by a bottom axis line.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Diagonal organic textures framing a central-right typography cluster.","zones":["Diagonal organic textures framing a central-right typography cluster."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["brush-frame","minimal-text","asymmetrical"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Major section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Horizontal split background with a central overlapping circular focal point and large decorative framing marks.","zones":["Horizontal split background with a central overlapping circular focal point and large decorative framing marks."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["horizontal-split","overlap","oversized-quotes"],"avoid":["Complex lists or data","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Highlighting a core philosophy","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"central-circle","purpose":"Focal point image","bbox":[0.4,0.12,0.2,0.35],"priority":1}]}
- content: [{"id":"content-content","composition":"Horizontal array of vertical cards with rounded top corners, anchored by a bottom axis line.","zones":["Horizontal array of vertical cards with rounded top corners, anchored by a bottom axis line."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["four-column","cards","timeline-axis"],"avoid":["Dense paragraphs of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Step-by-step processes","Sequential lists","Timelines"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Horizontal sequence of overlapping circular nodes with staggered top/bottom text blocks.","zones":["Horizontal sequence of overlapping circular nodes with staggered top/bottom text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["overlapping-circles","staggered-text","horizontal-flow"],"avoid":["Unrelated lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Continuous processes","Flow diagrams","Iterative cycles"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Two-column layout: stacked line charts on the left, typography and minimalist progress bars on the right.","zones":["Two-column layout: stacked line charts on the left, typography and minimalist progress bars on the right."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["line-charts","progress-bars","two-column-split"],"avoid":["High-level executive summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend analysis","Comparing metrics over time","Detailed data reports"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Horizontal split background with a central overlapping circular focal point and large decorative framing marks.","zones":["Horizontal split background with a central overlapping circular focal point and large decorative framing marks."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["horizontal-split","overlap","oversized-quotes"],"avoid":["Complex lists or data","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Highlighting a core philosophy","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"central-circle","purpose":"Focal point image","bbox":[0.4,0.12,0.2,0.35],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Horizontal split background with a central overlapping circular focal point and large decorative framing marks.","zones":["Horizontal split background with a central overlapping circular focal point and large decorative framing marks."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["horizontal-split","overlap","oversized-quotes"],"avoid":["Complex lists or data","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Highlighting a core philosophy","Section introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"central-circle","purpose":"Focal point image","bbox":[0.4,0.12,0.2,0.35],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Diagonal organic textures framing a central-right typography cluster, echoing the cover.","zones":["Diagonal organic textures framing a central-right typography cluster, echoing the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation color palette","Diagonal watercolor brushstroke framing elements","Soft geometry: circles and rectangles with rounded top corners"],"optional_variants":["brush-frame","bookend","minimal-text"],"avoid":["Summary content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are contained within strict geometric boundaries (circles or rectangles).
- Photographs are used sparingly, often subordinated to the colored graphic elements.

【图标与装饰】
- Icons are flat, solid white when placed inside colored shapes, or solid grey when on the light background.

【数据页构图】
- Two-column layout: stacked line charts on the left, typography and minimalist progress bars on the right.

【图表风格】
- Charts are minimalist, stripping away grid lines and borders.
- Data series rely on the template's muted color palette.
- Simple horizontal progress bars are frequently used for percentages.

【章节页构图】
- Horizontal split background with a central overlapping circular focal point and large decorative framing marks.

【收尾页构图】
- Diagonal organic textures framing a central-right typography cluster, echoing the cover.

【禁止】
- Avoid high-saturation or neon colors that break the Morandi aesthetic.
- Do not use stark black text; stick to dark greys.
- Avoid sharp, rigid borders on content boxes; favor soft or rounded edges.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic or creative portfolios、Elegant corporate summaries、Lifestyle brand presentations、HR or company culture decks。
