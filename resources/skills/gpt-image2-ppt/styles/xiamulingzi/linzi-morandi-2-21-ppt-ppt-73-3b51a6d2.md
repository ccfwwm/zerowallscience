# 73 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-73-3b51a6d2

## 风格ID
linzi-morandi-2-21-ppt-ppt-73-3b51a6d2

## 风格名称
73 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-73-3b51a6d2

## 风格描述
Minimalist, photo-driven presentation template with ample whitespace, light blue accent blocks, and simple typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominant, black text for high contrast, light blue (#AEE1FA) used for background blocks and edge highlights.
- fonts: Clean, geometric sans-serif for both headers and body text. Headers use tracking/letter-spacing.
- spacing: Generous margins, particularly on the left side of text blocks. High negative space overall.
- shape_language: Primarily orthogonal geometric shapes (rectangles, squares) combined with perfect circles for portraits and data.
- texture: Flat color blocks contrasted with rich photographic textures.
- grid: Typically based on a 50/50 vertical split or 3-column modular grid for content.
- motion_or_depth: Strictly flat design with no shadows. Overlapping occurs only with images and flat color blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「73 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-73-3b51a6d2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist, photo-driven presentation template with ample whitespace, light blue accent blocks, and simple typography.
- 推荐配色：#FFFFFF、#000000、#AEE1FA

【不可丢失的风格锚点】
- Extensive use of whitespace
- Light blue rectangular accent blocks and vertical margin bars
- Thin, squiggly line decorations
- Strict sans-serif typography

【字体】
- Headers are uppercase, sans-serif, left-aligned, and often use tracking.
- Body text is small, sans-serif, left-aligned with ample line height.
- Tiny, rotated margin text is used as a consistent decorative element on the far left edge.

【封面页构图】
- Asymmetric split with text left, large hero image right, and a smaller overlapping inset image in the center.

【内容页构图】
- Left-aligned full height image with a prominent, overlapping solid accent color block containing text on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetric split with text left, large hero image right, and a smaller overlapping inset image in the center.","zones":["Asymmetric split with text left, large hero image right, and a smaller overlapping inset image in the center."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["split-layout","inset-image"],"avoid":["Data-heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Main background image covering right half","bbox":[0.4,0.0,0.6,1.0],"priority":1},{"id":"inset-image","purpose":"Small focal image in center","bbox":[0.45,0.36,0.15,0.28],"priority":2}]}
- section: {"id":"section-primary","composition":"Horizontal process timeline with four nodes and descriptive text below, anchored by title at top left.","zones":["Horizontal process timeline with four nodes and descriptive text below, anchored by title at top left."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["timeline","process"],"avoid":["Large images","Unrelated bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flow","Timelines","Sequential steps"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left-aligned full height image with a prominent, overlapping solid accent color block containing text on the right.","zones":["Left-aligned full height image with a prominent, overlapping solid accent color block containing text on the right."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["color-block","text-on-accent"],"avoid":["Multiple charts","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-image","purpose":"Full height image on left side","bbox":[0.0,0.0,0.5,1.0],"priority":1}]},{"id":"content-comparison","composition":"2x4 grid of circular portraits with name and role text below, anchored by left edge vertical bar.","zones":["2x4 grid of circular portraits with name and role text below, anchored by left edge vertical bar."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["team-grid","portraits"],"avoid":["Detailed bios","Landscape imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Client logos (if adapted)"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"portrait-grid","purpose":"8 slots for circular team portraits","bbox":[0.15,0.1,0.75,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three centered radial progress charts with vertical accent bar on the left edge.","zones":["Three centered radial progress charts with vertical accent bar on the left edge."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["metrics","radial-charts"],"avoid":["Long text descriptions","Complex data trends","copying source assets, source text, or an exact source arrangement"],"best_for":["Key performance indicators","Highlighting 3 key stats"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned full height image with a prominent, overlapping solid accent color block containing text on the right.","zones":["Left-aligned full height image with a prominent, overlapping solid accent color block containing text on the right."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["color-block","text-on-accent"],"avoid":["Multiple charts","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-image","purpose":"Full height image on left side","bbox":[0.0,0.0,0.5,1.0],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"50/50 vertical split: full-height image left, solid accent background right containing centered quote text over a large, faint background numeral.","zones":["50/50 vertical split: full-height image left, solid accent background right containing centered quote text over a large, faint background numeral."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Extensive use of whitespace","Light blue rectangular accent blocks and vertical margin bars","Thin, squiggly line decorations"],"optional_variants":["split-screen","large-numeral"],"avoid":["Detailed lists","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Key takeaways","Chapter numbers"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-image","purpose":"Full height decorative image","bbox":[0.0,0.0,0.5,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used full-bleed on halves of slides, or inset with sharp rectangular masks.
- Portrait images are masked into perfect circles.
- Collage layouts use varied rectangular aspect ratios.

【图标与装饰】
- Icons are minimalist, thin-line style, enclosed in faint circular borders or freestanding.

【数据页构图】
- Three centered radial progress charts with vertical accent bar on the left edge.

【图表风格】
- Data visualization is limited to simple radial progress rings with centered percentage text.

【章节页构图】
- Horizontal process timeline with four nodes and descriptive text below, anchored by title at top left.

【收尾页构图】
- Asymmetric split with text left, large hero image right, and a smaller overlapping inset image in the center.

【禁止】
- Avoid using highly saturated or complex background patterns.
- Do not use drop shadows or 3D effects.
- Avoid changing the accent color to a dark or highly vibrant shade, as it breaks the airy aesthetic.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion presentations、Design agency portfolios、Minimalist lifestyle brand decks。
