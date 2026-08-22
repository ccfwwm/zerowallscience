# 16 · 3.07更新高级色25 / linzi-morandi-3-0725-16-972e72ce

## 风格ID
linzi-morandi-3-0725-16-972e72ce

## 风格名称
16 · 3.07更新高级色25 / linzi-morandi-3-0725-16-972e72ce

## 风格描述
A gentle, feminine presentation template featuring soft pastel tones, organic blob framing, delicate botanical line art, and elegant serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Stark white backgrounds heavily accented by muted mauve, dusty pink, and coral vectors. Text primarily uses dark plum.
- fonts: Classic serif typography for both headers and body text to enforce an elegant, poetic mood.
- spacing: Generous margins with a strong preference for central, airy whitespace on transition slides.
- shape_language: A mix of fluid, organic blobs for background framing and strict circles for image masks and icons.
- texture: Flat, unshadowed vector layers combined with thin-line illustrations.
- grid: Relaxed, asymmetrical outer framing containing mostly symmetrical, centered inner content blocks.
- motion_or_depth: Completely flat design relying on simple overlap of solid colors; no gradients or drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「16 · 3.07更新高级色25 / linzi-morandi-3-0725-16-972e72ce」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A gentle, feminine presentation template featuring soft pastel tones, organic blob framing, delicate botanical line art, and elegant serif typography.
- 推荐配色：#FFFFFF、#987A9A、#EAA098、#D8A5B2、#8A6080

【不可丢失的风格锚点】
- Asymmetrical organic 'blob' shapes anchored to corners
- Delicate, single-color botanical line art illustrations
- Muted, low-contrast pastel color palette
- Pill-shaped background badges for section numbering

【字体】
- Use elegant serif fonts for all text elements to maintain a traditional, soft aesthetic.
- Center-align titles and subtitles on cover and section slides.
- Use dark plum/mauve for primary text to ensure readability while matching the pastel theme.
- Enclose section numbers or labels in solid pill-shaped backgrounds.

【封面页构图】
- Central symmetric text cluster framed by asymmetrical corner blobs and line art.

【内容页构图】
- Split layout: tall rectangular image on left, text block top right, two columns bottom right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central symmetric text cluster framed by asymmetrical corner blobs and line art.","zones":["Central symmetric text cluster framed by asymmetrical corner blobs and line art."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["cover-center","organic-frame"],"avoid":["Detailed agendas or dense text.","copying source assets, source text, or an exact source arrangement"],"best_for":["Title and subtitle introduction."],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central symmetric text cluster with a pill-shaped badge, framed by asymmetrical corner blobs.","zones":["Central symmetric text cluster with a pill-shaped badge, framed by asymmetrical corner blobs."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["section-center","pill-badge"],"avoid":["Content delivery.","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions."],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout: tall rectangular image on left, text block top right, two columns bottom right.","zones":["Split layout: tall rectangular image on left, text block top right, two columns bottom right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["split-left-image","text-grid-right"],"avoid":["Large data sets.","copying source assets, source text, or an exact source arrangement"],"best_for":["Quote plus supporting details","Product feature with description"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left_vertical","purpose":"Visual anchor","bbox":[0.08,0.13,0.34,0.61],"priority":1}]},{"id":"content-comparison","composition":"Large left-aligned circular image with overlapping badge, paired with right-aligned 2x2 numbered grid.","zones":["Large left-aligned circular image with overlapping badge, paired with right-aligned 2x2 numbered grid."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["circle-image-left","2x2-list"],"avoid":["Long continuous paragraphs.","copying source assets, source text, or an exact source arrangement"],"best_for":["Four-point lists","Core values"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"circle_left","purpose":"Thematic illustration","bbox":[0.05,0.22,0.35,0.62],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Central symmetric text cluster with a pill-shaped badge, framed by asymmetrical corner blobs.","zones":["Central symmetric text cluster with a pill-shaped badge, framed by asymmetrical corner blobs."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["section-center","pill-badge"],"avoid":["Content delivery.","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions."],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split layout: tall rectangular image on left, text block top right, two columns bottom right.","zones":["Split layout: tall rectangular image on left, text block top right, two columns bottom right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["split-left-image","text-grid-right"],"avoid":["Large data sets.","copying source assets, source text, or an exact source arrangement"],"best_for":["Quote plus supporting details","Product feature with description"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left_vertical","purpose":"Visual anchor","bbox":[0.08,0.13,0.34,0.61],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Central symmetric text cluster framed by asymmetrical corner blobs and line art.","zones":["Central symmetric text cluster framed by asymmetrical corner blobs and line art."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical organic 'blob' shapes anchored to corners","Delicate, single-color botanical line art illustrations","Muted, low-contrast pastel color palette"],"optional_variants":["closing-center","organic-frame"],"avoid":["Summary bullet points.","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use warm, soft-focus photography (e.g., still lifes, botanicals) that matches the Morandi color palette.
- Apply strict geometric masks (circles, rectangles) without borders or drop shadows.
- Use wide landscape strips for top-heavy layouts (edge-to-edge within margins).

【图标与装饰】
- Use simple white outline icons.
- Center icons inside solid circular backgrounds using palette colors.
- Ensure icon line weight matches the delicate feel of the typography and botanical illustrations.

【数据页构图】
- Central symmetric text cluster with a pill-shaped badge, framed by asymmetrical corner blobs.

【图表风格】
- No charts present, but if added, use flat pastel fills without borders.
- Avoid harsh gridlines; use light, muted tones for axes.

【章节页构图】
- Central symmetric text cluster with a pill-shaped badge, framed by asymmetrical corner blobs.

【收尾页构图】
- Central symmetric text cluster framed by asymmetrical corner blobs and line art.

【禁止】
- Do not use sharp, aggressive geometric angles (triangles, sharp polygons).
- Avoid bright, highly saturated, or neon colors.
- Do not use heavy drop shadows, 3D effects, or gradients.
- Avoid thick, blocky sans-serif fonts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios or personal reflections.、Wellness, beauty, or lifestyle brand presentations.、HR or soft-skills training materials requiring a gentle tone.。
