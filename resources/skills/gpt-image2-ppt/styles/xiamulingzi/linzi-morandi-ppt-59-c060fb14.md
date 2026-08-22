# 优雅线条（59）---木七设计 · ppt模板 / linzi-morandi-ppt-59-c060fb14

## 风格ID
linzi-morandi-ppt-59-c060fb14

## 风格名称
优雅线条（59）---木七设计 · ppt模板 / linzi-morandi-ppt-59-c060fb14

## 风格描述
An elegant, minimalist presentation template utilizing a muted Morandi color palette, organic fluid shapes, and structured grid layouts for a sophisticated look.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background as canvas; muted teal and sage green for primary shapes and blocks; dark brown-olive for high-contrast text and buttons.
- fonts: Serif font for primary titles and headers to convey elegance; sans-serif font for body text for readability.
- spacing: Generous outer margins with centralized focal points on transitional slides; distinct horizontal banding and modular columns on content slides.
- shape_language: A mix of organic fluidity (corner blobs) and rigid structure (straight-edged image placeholders and rectangular content bands).
- texture: Completely flat design with no gradients or drop shadows; visual depth is achieved exclusively through overlapping flat vectors.
- grid: Symmetrical central axis for covers/sections; rigid 2-column, 3-column, or 4-column splits for content slides.
- motion_or_depth: Depth is implied by thin contour lines floating slightly offset over solid fluid background shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（59）---木七设计 · ppt模板 / linzi-morandi-ppt-59-c060fb14」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template utilizing a muted Morandi color palette, organic fluid shapes, and structured grid layouts for a sophisticated look.
- 推荐配色：#F9F8F5、#4A7471、#A1B59C、#524C40

【不可丢失的风格锚点】
- Organic, fluid blob shapes anchoring the corners
- Thin, intersecting wireframe lines overlapping solid shapes
- Pill-shaped (fully rounded) buttons and accent labels
- Elegant serif typography for primary headings centered on the page
- Muted, low-saturation 'Morandi' color blocking

【字体】
- Titles use a prominent serif font, center-aligned, with generous letter spacing.
- Body text uses a highly legible sans-serif, often justified or center-aligned depending on the container.
- Subtitle and meta-text contrast in scale rather than weight, keeping a light, airy feel.

【封面页构图】
- Centralized serif title with pill-shaped badge below, framed by organic blob shapes in opposite corners

【内容页构图】
- Full-width horizontal band split into 1/3 solid color block and 2/3 dual-image slots

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centralized serif title with pill-shaped badge below, framed by organic blob shapes in opposite corners","zones":["Centralized serif title with pill-shaped badge below, framed by organic blob shapes in opposite corners"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["minimal","centered","organic-frame"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Keynote intros"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Identical structure to cover slide, purposed as a section divider with a pill-shaped numeral indicator","zones":["Identical structure to cover slide, purposed as a section divider with a pill-shaped numeral indicator"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["divider","consistent-frame"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Full-width horizontal band split into 1/3 solid color block and 2/3 dual-image slots","zones":["Full-width horizontal band split into 1/3 solid color block and 2/3 dual-image slots"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["horizontal-split","image-grid","color-block"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Dual case studies"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-1","purpose":"left context image","bbox":[0.33,0.34,0.33,0.45],"priority":1},{"id":"img-2","purpose":"right context image","bbox":[0.66,0.34,0.33,0.45],"priority":2}]},{"id":"content-comparison","composition":"Split layout with a 1/3 width tall image on the left and a 2/3 width solid colored block housing an icon list on the right","zones":["Split layout with a 1/3 width tall image on the left and a 2/3 width solid colored block housing an icon list on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["icon-list","vertical-split","side-image"],"avoid":["Financial data","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Key takeaways"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"side-img","purpose":"tall feature image","bbox":[0.05,0.27,0.35,0.57],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four horizontally distributed thick donut charts over aligned text blocks","zones":["Four horizontally distributed thick donut charts over aligned text blocks"],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["four-column","donut-charts","data-row"],"avoid":["Complex time-series data","copying source assets, source text, or an exact source arrangement"],"best_for":["Metric highlights","Percentage comparisons","Progress indicators"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Identical structure to cover slide, purposed as a section divider with a pill-shaped numeral indicator","zones":["Identical structure to cover slide, purposed as a section divider with a pill-shaped numeral indicator"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["divider","consistent-frame"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Split layout with a large 2/3 left image and a 1/3 right solid block containing an oversized quote icon","zones":["Split layout with a large 2/3 left image and a 1/3 right solid block containing an oversized quote icon"],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["quote-block","hero-image","asymmetric-split"],"avoid":["Multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Highlight quotes","Core messages"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"hero-img","purpose":"large descriptive image","bbox":[0.05,0.26,0.55,0.58],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Mirrors the cover slide completely, substituting conclusion text","zones":["Mirrors the cover slide completely, substituting conclusion text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, fluid blob shapes anchoring the corners","Thin, intersecting wireframe lines overlapping solid shapes","Pill-shaped (fully rounded) buttons and accent labels"],"optional_variants":["bookend","minimal","closing"],"avoid":["Summaries requiring lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Final slide","Q&A intro"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in rigid, straight-edged rectangular frames, contrasting with the organic decorative shapes.
- Images are used in strictly defined modular blocks (1/3 or 2/3 horizontal splits).

【图标与装饰】
- Icons are solid white, enclosed in circular or pill-shaped containers.
- Oversized minimalist icons (like quote marks) are used as decorative watermarks in text blocks.

【数据页构图】
- Four horizontally distributed thick donut charts over aligned text blocks

【图表风格】
- Charts use thick-ringed donuts.
- Data visualization strictly adheres to the deck's muted 3-color palette (teal, sage, brown) with no additional semantic colors.

【章节页构图】
- Identical structure to cover slide, purposed as a section divider with a pill-shaped numeral indicator

【收尾页构图】
- Mirrors the cover slide completely, substituting conclusion text

【禁止】
- Avoid bright, saturated, or neon colors that break the Morandi aesthetic.
- Avoid drop shadows, 3D effects, or gradients; stick to flat vector layers.
- Do not mix organic shapes into the rigid content zones (keep blobs strictly as corner framing).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Lifestyle or wellness brand pitches、Corporate summaries requiring a calm, refined aesthetic、Minimalist lookbooks。
