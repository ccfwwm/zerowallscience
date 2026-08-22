# 莫兰迪风尚 (18) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-18-dab5f352

## 风格ID
linzi-morandi-2-21-40ppt-ppt-18-dab5f352

## 风格名称
莫兰迪风尚 (18) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-18-dab5f352

## 风格描述
A sophisticated, fashion-forward template utilizing muted earthy tones (Morandi palette), sharp rectangular color blocking, and overlapping spatial arrangements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Olive green as the primary structural background, terracotta for secondary intersecting blocks, dark red for thin accents and highlights, white for typography.
- fonts: Clean, geometric sans-serif for all text, conveying a modern and minimal aesthetic.
- spacing: Asymmetric layouts with tight margins on intersecting blocks, allowing images and color planes to frame whitespace dynamically.
- shape_language: Exclusively sharp rectangles and straight lines. Zero rounded corners.
- texture: Mostly flat, matte color blocks, with occasional use of subtle organic shadow overlays (e.g., leaves) on primary title slides to add depth without gradients.
- grid: Modular, asymmetric grid based on intersecting vertical and horizontal planes rather than standard columns.
- motion_or_depth: Depth is achieved through the physical overlap of opaque rectangular image frames and solid color blocks, creating a layered paper or collage effect.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (18) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-18-dab5f352」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, fashion-forward template utilizing muted earthy tones (Morandi palette), sharp rectangular color blocking, and overlapping spatial arrangements.
- 推荐配色：#52583D、#9C6A56、#8A3437、#FFFFFF

【不可丢失的风格锚点】
- Muted earthy color palette (olive, terracotta, dark red)
- Strictly rectangular overlapping layout blocks
- Persistent vertical rotated text on the right edge
- Vertical red accent lines used for section headers

【字体】
- Titles are large, bold, and exclusively white to contrast with dark backgrounds.
- Body text is small, sans-serif, and consistently left-aligned.
- Rotated text (90 degrees) is used structurally as a framing device on slide edges.

【封面页构图】
- Left-aligned vertical accent bar, overlapping hero image, subtle background texture, rotated framing text

【内容页构图】
- Flush-right hero image, intersecting lower-center color block, left-aligned text

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned vertical accent bar, overlapping hero image, subtle background texture, rotated framing text","zones":["Left-aligned vertical accent bar, overlapping hero image, subtle background texture, rotated framing text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["hero-image","shadow-texture","rotated-text"],"avoid":["Data-heavy content","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","High-impact visual introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Main introductory image","bbox":[0.1,0.13,0.24,0.73],"priority":1}]}
- section: {"id":"section-primary","composition":"Thin vertical accent line left, large typography left, offset overlapping image right","zones":["Thin vertical accent line left, large typography left, offset overlapping image right"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["section-header","offset-shadow","vertical-line"],"avoid":["Dense body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-image","purpose":"Thematic image for the section","bbox":[0.58,0.14,0.3,0.71],"priority":1}]}
- content: [{"id":"content-content","composition":"Flush-right hero image, intersecting lower-center color block, left-aligned text","zones":["Flush-right hero image, intersecting lower-center color block, left-aligned text"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["intersecting-blocks","flush-image"],"avoid":["Multi-chart layouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statement with supporting image","Product feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-hero","purpose":"Supporting visual context","bbox":[0.62,0.25,0.26,0.57],"priority":1}]},{"id":"content-comparison","composition":"Quadrant color blocking, small centered bottom image, mixed text zones","zones":["Quadrant color blocking, small centered bottom image, mixed text zones"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["color-blocking","small-image","multi-text"],"avoid":["High-impact single visual slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Multi-point explanations","Agenda or summary slides"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"small-support-image","purpose":"Minor supporting visual","bbox":[0.44,0.62,0.1,0.27],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Thin vertical accent line left, large typography left, offset overlapping image right","zones":["Thin vertical accent line left, large typography left, offset overlapping image right"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["section-header","offset-shadow","vertical-line"],"avoid":["Dense body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-image","purpose":"Thematic image for the section","bbox":[0.58,0.14,0.3,0.71],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Flush-right hero image, intersecting lower-center color block, left-aligned text","zones":["Flush-right hero image, intersecting lower-center color block, left-aligned text"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["intersecting-blocks","flush-image"],"avoid":["Multi-chart layouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statement with supporting image","Product feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-hero","purpose":"Supporting visual context","bbox":[0.62,0.25,0.26,0.57],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Left-aligned vertical accent bar, overlapping hero image, subtle background texture, rotated framing text","zones":["Left-aligned vertical accent bar, overlapping hero image, subtle background texture, rotated framing text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earthy color palette (olive, terracotta, dark red)","Strictly rectangular overlapping layout blocks","Persistent vertical rotated text on the right edge"],"optional_variants":["closing","hero-image","shadow-texture"],"avoid":["Information delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A markers"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-hero","purpose":"Final brand image","bbox":[0.1,0.13,0.24,0.73],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in sharp rectangular containers.
- Images frequently overlap or intersect with solid color blocks.
- Images are often paired with a slightly offset background rectangle of a contrasting color to create a faux shadow or matting effect.

【图标与装饰】
- Minimal iconography; navigation is hinted at using simple, small outlined and filled circles.

【数据页构图】
- Thin vertical accent line left, large typography left, offset overlapping image right

【图表风格】
- No charts present; data should likely follow the blocky, high-contrast, flat-color aesthetic if introduced.

【章节页构图】
- Thin vertical accent line left, large typography left, offset overlapping image right

【收尾页构图】
- Left-aligned vertical accent bar, overlapping hero image, subtle background texture, rotated framing text

【禁止】
- No rounded corners on images or shapes.
- No gradients or 3D bevel effects.
- Avoid bright, saturated, or neon colors; stick strictly to muted, desaturated earth tones.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion brand lookbooks or pitches、Art and design portfolios、Boutique agency credentials、Editorial-style corporate presentations。
