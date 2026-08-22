# 21 · 3.07更新高级色25 / linzi-morandi-3-0725-21-621d42e2

## 风格ID
linzi-morandi-3-0725-21-621d42e2

## 风格名称
21 · 3.07更新高级色25 / linzi-morandi-3-0725-21-621d42e2

## 风格描述
A soft, elegant presentation template featuring a muted Morandi palette, fluid organic shapes, and delicate serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominate, framed by solid vector blobs in beige, purple, and green. Text primarily uses a darker, low-contrast purple.
- fonts: Elegant serif fonts drive the primary headings to establish a refined mood. Body text utilizes clean serifs or legible sans-serifs.
- spacing: Generous margins defined by the negative space left by the border illustrations. Content areas are distinctly boxed or columnized.
- shape_language: Soft, rounded, and organic. Fluid curves dominate backgrounds, while pills and circles are used for badges, icons, and specific image masks.
- texture: Clean, flat vector graphics relying on color blocking rather than material textures.
- grid: Flexible central focal areas mixed with standard two-column and four-column content distributions.
- motion_or_depth: Strictly flat design. Overlapping shapes create a shallow 2D hierarchy without the use of drop shadows or 3D effects.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「21 · 3.07更新高级色25 / linzi-morandi-3-0725-21-621d42e2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A soft, elegant presentation template featuring a muted Morandi palette, fluid organic shapes, and delicate serif typography.
- 推荐配色：#EFCB8C、#936B8D、#9FB89A、#7B5775、#FFFFFF

【不可丢失的风格锚点】
- Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)
- Organic, fluid background blobs framing the presentation canvas
- Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses
- Elegant, delicate serif typography for headings

【字体】
- Center text alignment is preferred for major title and transition slides.
- Use pill-shaped backgrounds to highlight subtitles or presenter metadata.
- Maintain low-contrast text colors matching the primary palette (avoid pure black).

【封面页构图】
- Centered typography stack framed by organic corner blobs

【内容页构图】
- Left image pane with right-aligned vertical list using circular markers

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography stack framed by organic corner blobs","zones":["Centered typography stack framed by organic corner blobs"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["title-slide","centered","blob-frame"],"avoid":["Detailed content","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Opening remarks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered section title below a large circular number badge","zones":["Centered section title below a large circular number badge"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["section-divider","number-badge","centered"],"avoid":["Data delivery","Complex narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Major topic shifts"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left image pane with right-aligned vertical list using circular markers","zones":["Left image pane with right-aligned vertical list using circular markers"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["image-left","list-right","circle-bullets"],"avoid":["Dense paragraphs","Full-screen imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Sequential steps","Itemized descriptions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-image-02","purpose":"Supporting visual context","bbox":[0.05,0.15,0.3,0.7],"priority":1}]},{"id":"content-comparison","composition":"Segmented vertical pill image mask paired with a 2x2 text grid","zones":["Segmented vertical pill image mask paired with a 2x2 text grid"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["pill-mask","grid-layout","image-left"],"avoid":["Long sequential lists","Financial data","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Quadrant analysis","Creative showcases"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"segmented-hero-04","purpose":"Creative masked hero image","bbox":[0.05,0.2,0.4,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Centered section title below a large circular number badge","zones":["Centered section title below a large circular number badge"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["section-divider","number-badge","centered"],"avoid":["Data delivery","Complex narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Major topic shifts"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left image pane with right-aligned vertical list using circular markers","zones":["Left image pane with right-aligned vertical list using circular markers"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["image-left","list-right","circle-bullets"],"avoid":["Dense paragraphs","Full-screen imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Sequential steps","Itemized descriptions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-image-02","purpose":"Supporting visual context","bbox":[0.05,0.15,0.3,0.7],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered typography stack framed by organic corner blobs, mirroring the cover","zones":["Centered typography stack framed by organic corner blobs, mirroring the cover"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation Morandi color palette (warm beige, dusty purple, soft green)","Organic, fluid background blobs framing the presentation canvas","Hand-drawn aesthetic accents including wavy lines, scattered dots, and small crosses"],"optional_variants":["closing-slide","centered","blob-frame"],"avoid":["New content","Summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images can be placed in clean, unbordered rectangles.
- Use segmented vertical pill masks for creative multi-slice image presentations.
- Overlap large images with solid color text blocks to create editorial-style layouts.

【图标与装饰】
- Icons should be simple, outlined, and colored white.
- Place icons inside solid circular backgrounds matching the secondary palette colors.
- Use icons as junction points between image boundaries and text columns.

【数据页构图】
- Centered section title below a large circular number badge

【图表风格】
- Charts should utilize the muted beige, purple, and green palette.
- Keep data visualization strictly flat, avoiding gradients, 3D extrusions, or heavy grid lines.

【章节页构图】
- Centered section title below a large circular number badge

【收尾页构图】
- Centered typography stack framed by organic corner blobs, mirroring the cover

【禁止】
- Vibrant, neon, or highly saturated colors.
- Sharp, angular geometric background decorations.
- Heavy drop shadows, bevels, or realistic textures.
- Ultra-bold or aggressive sans-serif heading fonts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Arts, humanities, or lifestyle presentations、Fashion or beauty branding pitches、Academic defenses requiring a gentle, non-corporate aesthetic、Creative portfolios。
