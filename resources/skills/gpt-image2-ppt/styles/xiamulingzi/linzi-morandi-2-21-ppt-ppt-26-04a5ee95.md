# 26 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-26-04a5ee95

## 风格ID
linzi-morandi-2-21-ppt-ppt-26-04a5ee95

## 风格名称
26 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-26-04a5ee95

## 风格描述
A minimalist, Zen-inspired presentation template featuring a Morandi color palette, elegant typography, and ample whitespace.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted olive green and cool mid-grey serve as primary structural and accent colors. Off-white/white is used generously for backgrounds. Dark olive/grey is used for high-contrast text.
- fonts: Clean geometric sans-serif for primary text, paired with widely tracked serif or elegant sans-serif caps for headings.
- spacing: Extremely generous padding. Wide gutters between columns. Text blocks are airy with high line-height.
- shape_language: Strictly geometric. Perfect circles for numbers/icons, sharp right-angled rectangles for color blocks and image containers.
- texture: Predominantly flat and matte. Occasional use of abstract natural textures (e.g., raked sand) as atmospheric backgrounds.
- grid: Strong vertical column systems (2-col, 3-col, 4-col). Consistent top-alignments for titles and navigation.
- motion_or_depth: Completely flat design. No drop shadows or gradients. Visual hierarchy is established entirely through color blocking and scale.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「26 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-26-04a5ee95」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, Zen-inspired presentation template featuring a Morandi color palette, elegant typography, and ample whitespace.
- 推荐配色：#6b6856、#a4a5a5、#ffffff、#4a483e、#f8f8f8

【不可丢失的风格锚点】
- Muted olive and cool grey color combination.
- Prominent use of perfect circles (solid and outlined) as primary graphical devices.
- Horizontal split-screen layouts.
- Persistent minimalist top navigation bar on content slides.

【字体】
- Headings use uppercase with generous letter spacing.
- Body text is muted, small, and employs generous line height for a clean look.
- Numbers are oversized and often paired with circular enclosures to serve as structural anchors.

【封面页构图】
- Horizontal split layout with textured lower half and central circular title plate.

【内容页构图】
- Three-column text layout with top-aligned minimalist navigation menu.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Horizontal split layout with textured lower half and central circular title plate.","zones":["Horizontal split layout with textured lower half and central circular title plate."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["cover","split-background","centered-circle"],"avoid":["Heavy text introduction","Data display","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","Minimalist event intro"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"background-texture","purpose":"Atmospheric background texture or image","bbox":[0.0,0.5,1.0,0.5],"priority":2}]}
- section: {"id":"section-primary","composition":"Horizontal split layout (white top, solid color bottom) with central numbered circle enclosed in a lower arc.","zones":["Horizontal split layout (white top, solid color bottom) with central numbered circle enclosed in a lower arc."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["section-divider","split-background","numbered-marker"],"avoid":["Content-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three-column text layout with top-aligned minimalist navigation menu.","zones":["Three-column text layout with top-aligned minimalist navigation menu."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["3-column","top-nav","numbered-list"],"avoid":["Long continuous paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key value propositions","Three-step processes","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Asymmetrical two-column layout: 2x2 text grid on the left, vertical rectangular image slot on the right.","zones":["Asymmetrical two-column layout: 2x2 text grid on the left, vertical rectangular image slot on the right."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["image-right","2x2-text-grid","top-nav"],"avoid":["Full-screen text","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Product details alongside imagery"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"content-image-right","purpose":"Vertical feature image supporting the text","bbox":[0.63,0.24,0.28,0.64],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Horizontal split layout (white top, solid color bottom) with central numbered circle enclosed in a lower arc.","zones":["Horizontal split layout (white top, solid color bottom) with central numbered circle enclosed in a lower arc."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["section-divider","split-background","numbered-marker"],"avoid":["Content-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-column text layout with top-aligned minimalist navigation menu.","zones":["Three-column text layout with top-aligned minimalist navigation menu."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["3-column","top-nav","numbered-list"],"avoid":["Long continuous paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key value propositions","Three-step processes","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Solid background with a thin textured bottom border and a large central circular text plate.","zones":["Solid background with a thin textured bottom border and a large central circular text plate."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted olive and cool grey color combination.","Prominent use of perfect circles (solid and outlined) as primary graphical devices.","Horizontal split-screen layouts."],"optional_variants":["closing","centered-circle","textured-footer"],"avoid":["Summaries","Data","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Contact information","Q&A prompt"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"footer-texture","purpose":"Atmospheric border/footer texture","bbox":[0.0,0.85,1.0,0.15],"priority":3}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used sparingly, filling strict rectangular containers that align perfectly with the grid.
- Images should ideally match the muted, low-contrast tonal qualities of the deck's palette.

【图标与装饰】
- Literal icons are avoided. Instead, typographic numbers enclosed in circles or overlapping geometric shapes are used as bullet points and markers.

【数据页构图】
- Horizontal split layout (white top, solid color bottom) with central numbered circle enclosed in a lower arc.

【图表风格】
- No charts present, but implied style would be flat, minimalist, borderless, using the olive/grey color blocks.

【章节页构图】
- Horizontal split layout (white top, solid color bottom) with central numbered circle enclosed in a lower arc.

【收尾页构图】
- Solid background with a thin textured bottom border and a large central circular text plate.

【禁止】
- Drop shadows and 3D effects.
- Bright, saturated, or neon colors.
- Cluttered or edge-to-edge text.
- Rounded corners on rectangular bounding boxes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Corporate profiles、Design or architecture portfolio presentations、High-end lifestyle or boutique brand proposals、Minimalist concept pitches。
