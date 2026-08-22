# 优雅线条（33）---木七设计 · ppt模板 / linzi-morandi-ppt-33-477814b8

## 风格ID
linzi-morandi-ppt-33-477814b8

## 风格名称
优雅线条（33）---木七设计 · ppt模板 / linzi-morandi-ppt-33-477814b8

## 风格描述
Elegant template featuring a Morandi palette, fluid organic background shapes, and minimalist layouts. Emphasizes clean typography and flat, unshadowed geometry.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Terracotta and slate blue act as primary accents and structural elements; beige and cream form the background canvas.
- fonts: Bold, elegant serif for primary headings and prominent numerals; clean, light sans-serif for body copy and metadata.
- spacing: Generous margins with content frequently centered or distinctly partitioned into symmetrical blocks.
- shape_language: Contrast between organic, undulating curves for backgrounds and strict geometric rectangles/circles for foreground content containers.
- texture: Completely flat design with no gradients, drop shadows, or glossy effects. Matte finish implied by muted colors.
- grid: Flexible column structures (2-col, 4-col) heavily anchored by centralized visual elements.
- motion_or_depth: Depth is achieved through simple 2D overlapping of solid shapes and images, avoiding 3D rendering or blurring.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（33）---木七设计 · ppt模板 / linzi-morandi-ppt-33-477814b8」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant template featuring a Morandi palette, fluid organic background shapes, and minimalist layouts. Emphasizes clean typography and flat, unshadowed geometry.
- 推荐配色：#C9866F、#4B6064、#E7DAC8、#F2ECE7、#A8B1AE、#FFFFFF

【不可丢失的风格锚点】
- Fluid, overlapping organic background zones in muted tones
- Solid offset rectangular backdrops behind images to create flat depth
- Elegant serif display typography paired with delicate dashed line dividers
- Flat, minimalist layout structures with generous negative space

【字体】
- Primary titles utilize bold serif fonts, often in uppercase.
- Subtitles and body text use light or regular sans-serif fonts.
- Text is frequently center-aligned on covers and section breaks, but left-aligned for data and detailed lists.
- Dashed lines frequently separate headers from body text or sub-headers.

【封面页构图】
- Full-bleed abstract fluid color blocks intersecting behind centered typographic hierarchy.

【内容页构图】
- Central vertical image slot anchored by an offset solid rectangle, flanked by symmetrical text columns.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed abstract fluid color blocks intersecting behind centered typographic hierarchy.","zones":["Full-bleed abstract fluid color blocks intersecting behind centered typographic hierarchy."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, overlapping organic background zones in muted tones","Solid offset rectangular backdrops behind images to create flat depth","Elegant serif display typography paired with delicate dashed line dividers"],"optional_variants":["fluid-background","minimal-cover","centered-text"],"avoid":["Heavy data","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Elegant introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered typographic hierarchy featuring a prominent oversized numeral above the main heading, over a fluid background.","zones":["Centered typographic hierarchy featuring a prominent oversized numeral above the main heading, over a fluid background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, overlapping organic background zones in muted tones","Solid offset rectangular backdrops behind images to create flat depth","Elegant serif display typography paired with delicate dashed line dividers"],"optional_variants":["section-break","large-numeral","centered-layout"],"avoid":["Long form content","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda items"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Central vertical image slot anchored by an offset solid rectangle, flanked by symmetrical text columns.","zones":["Central vertical image slot anchored by an offset solid rectangle, flanked by symmetrical text columns."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, overlapping organic background zones in muted tones","Solid offset rectangular backdrops behind images to create flat depth","Elegant serif display typography paired with delicate dashed line dividers"],"optional_variants":["center-image","two-column","symmetrical"],"avoid":["Complex charts","More than two distinct text subjects","copying source assets, source text, or an exact source arrangement"],"best_for":["Visual storytelling","Comparing two concepts"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-vertical-image","purpose":"Provides visual context to surrounding text","bbox":[0.38,0.2,0.24,0.65],"priority":1}]},{"id":"content-comparison","composition":"Central vertical image bordered by a four-quadrant grid of colored text blocks with prominent icons.","zones":["Central vertical image bordered by a four-quadrant grid of colored text blocks with prominent icons."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, overlapping organic background zones in muted tones","Solid offset rectangular backdrops behind images to create flat depth","Elegant serif display typography paired with delicate dashed line dividers"],"optional_variants":["four-grid","icon-blocks","center-image"],"avoid":["Continuous narratives","Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Four-point summaries"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-vertical-image","purpose":"Anchor for surrounding grid layout","bbox":[0.3,0.22,0.4,0.65],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Two-column split with text on the left and an ultra-minimalist, large two-color pie chart on the right.","zones":["Two-column split with text on the left and an ultra-minimalist, large two-color pie chart on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, overlapping organic background zones in muted tones","Solid offset rectangular backdrops behind images to create flat depth","Elegant serif display typography paired with delicate dashed line dividers"],"optional_variants":["pie-chart","data-visualization","minimalist-data"],"avoid":["Complex multi-variable data","Dense tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metric highlights","Market share data"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered typographic hierarchy featuring a prominent oversized numeral above the main heading, over a fluid background.","zones":["Centered typographic hierarchy featuring a prominent oversized numeral above the main heading, over a fluid background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, overlapping organic background zones in muted tones","Solid offset rectangular backdrops behind images to create flat depth","Elegant serif display typography paired with delicate dashed line dividers"],"optional_variants":["section-break","large-numeral","centered-layout"],"avoid":["Long form content","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda items"],"evidence_pages":["page-01"],"external_image_slots":[]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into strict rectangles or perfect circles.
- Rectangular images are consistently offset by a solid, muted-color rectangular block layered directly underneath them.
- No borders, frames, or drop shadows are applied to images.

【图标与装饰】
- Two distinct sets: white solid glyphs inside flat colored circles, and simple monoline outlines in accent colors.
- Icons are used symmetrically to anchor text blocks or list items.

【数据页构图】
- Two-column split with text on the left and an ultra-minimalist, large two-color pie chart on the right.

【图表风格】
- Ultra-minimalist, flat pie charts using exactly two brand colors.
- No 3D effects, borders, or gridlines.
- Large, clean sans-serif percentage labels placed directly on the chart segments.

【章节页构图】
- Centered typographic hierarchy featuring a prominent oversized numeral above the main heading, over a fluid background.

【收尾页构图】
- Full-bleed abstract fluid color blocks intersecting behind centered typographic hierarchy.

【禁止】
- Heavy drop shadows or glowing effects.
- Bright neon or highly saturated primary colors.
- Complex 3D chart rendering.
- Cluttered or edge-to-edge text layouts without ample negative space.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
High-end corporate summaries、Art, design, or architecture portfolios、Minimalist marketing reports、Lifestyle brand decks。
