# 精选科技风2 · 模板 / linzi-tech-2-a910e7f1

## 风格ID
linzi-tech-2-a910e7f1

## 风格名称
精选科技风2 · 模板 / linzi-tech-2-a910e7f1

## 风格描述
A dark-mode, tech-and-space themed template featuring high-contrast lime accents, geometric diagrams, and device mockups.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark space grey/black background, bright lime green for primary accents and highlights, stark white for primary text, mid-grey for secondary text.
- fonts: Clean, modern sans-serif (e.g., Arial or Helvetica). Title case for main headers, sentence case for body.
- spacing: Generous negative space, particularly on the left side of section/cover slides to balance heavy right-side graphics.
- shape_language: Strictly geometric: sharp rectangles, thin circles, and fine dashed lines. No rounded corners on primary accents.
- texture: Granular/starry background noise contrasting with smooth flat graphic elements.
- grid: Primarily asymmetric two-column layouts, often utilizing a 40/60 or 30/70 split.
- motion_or_depth: Depth achieved through overlapping cutout elements (e.g., devices, planets) over the deep space background.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风2 · 模板 / linzi-tech-2-a910e7f1」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A dark-mode, tech-and-space themed template featuring high-contrast lime accents, geometric diagrams, and device mockups.
- 推荐配色：#0B0E14、#B5D333、#FFFFFF、#999999、#333333

【不可丢失的风格锚点】
- Deep space starry background textures
- High-contrast lime green geometric accents (squares, lines)
- Fine dashed leader lines and concentric orbital rings
- High-contrast minimalist typography

【字体】
- Primary titles are bold, uppercase, and left-aligned.
- Section markers use a distinct accent color for the first word or numeral.
- Body text is low-density, medium weight, and heavily leaded (line-height).

【封面页构图】
- Left-aligned title block with top accent bar, large right-aligned floating cutout graphic.

【内容页构图】
- Left-aligned device mockup, right-aligned text block with vertical accent bar.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned title block with top accent bar, large right-aligned floating cutout graphic.","zones":["Left-aligned title block with top accent bar, large right-aligned floating cutout graphic."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["hero-right","minimal-text","dark-cover"],"avoid":["Detailed agendas","Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","Keynote opening"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-graphic","purpose":"Dominant thematic visual","bbox":[0.5,0.1,0.5,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Left-aligned prominent section number with square accent, large illustrative graphic bleeding off the top right.","zones":["Left-aligned prominent section number with square accent, large illustrative graphic bleeding off the top right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["section-divider","heavy-graphic","left-text"],"avoid":["Complex lists","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"background-graphic","purpose":"Section thematic illustration","bbox":[0.4,-0.1,0.7,1.1],"priority":1}]}
- content: [{"id":"content-content","composition":"Left-aligned device mockup, right-aligned text block with vertical accent bar.","zones":["Left-aligned device mockup, right-aligned text block with vertical accent bar."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["device-left","product-showcase","split-layout"],"avoid":["Broad conceptual text","Large tables","copying source assets, source text, or an exact source arrangement"],"best_for":["App showcases","Product feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"device-screen","purpose":"App or mobile interface display","bbox":[0.05,0.2,0.35,0.8],"priority":1}]},{"id":"content-comparison","composition":"Left side graphic anchor, right side features three vertically staggered portrait cards with dark bottom overlays.","zones":["Left side graphic anchor, right side features three vertically staggered portrait cards with dark bottom overlays."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["team-profiles","staggered-cards","image-overlay"],"avoid":["Process steps","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Speaker profiles"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"profile-1","purpose":"Team member headshot","bbox":[0.46,0.26,0.14,0.5],"priority":1},{"id":"profile-2","purpose":"Team member headshot","bbox":[0.62,0.35,0.14,0.5],"priority":1},{"id":"profile-3","purpose":"Team member headshot","bbox":[0.78,0.2,0.14,0.5],"priority":1},{"id":"left-graphic","purpose":"Thematic visual anchor","bbox":[-0.1,0.3,0.4,0.7],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned large graphic cutout, right-aligned text block above a custom horizontal bar chart with gradients.","zones":["Left-aligned large graphic cutout, right-aligned text block above a custom horizontal bar chart with gradients."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["bar-chart","gradient-data","split-layout"],"avoid":["Complex datasets requiring precise axes","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparative metrics","Progress indicators"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-graphic","purpose":"Thematic visual anchor","bbox":[-0.1,0.1,0.4,0.9],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned prominent section number with square accent, large illustrative graphic bleeding off the top right.","zones":["Left-aligned prominent section number with square accent, large illustrative graphic bleeding off the top right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["section-divider","heavy-graphic","left-text"],"avoid":["Complex lists","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"background-graphic","purpose":"Section thematic illustration","bbox":[0.4,-0.1,0.7,1.1],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered heavy typography over a massive, screen-filling background illustration.","zones":["Centered heavy typography over a massive, screen-filling background illustration."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Deep space starry background textures","High-contrast lime green geometric accents (squares, lines)","Fine dashed leader lines and concentric orbital rings"],"optional_variants":["closing-slide","centered-text","hero-background"],"avoid":["Any content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A slides","Contact information","Final thank you"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"full-background","purpose":"Dominant closing visual","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Hero images are typically isolated cutouts placed directly onto the dark background.
- Team/portrait photos use a dark translucent gradient overlay at the bottom to ensure text readability.
- Screens/devices are presented as realistic mockups, sometimes tilted for dynamic effect.

【图标与装饰】
- Minimal use of traditional icons; relies instead on dashed lines and geometric nodes.

【数据页构图】
- Left-aligned large graphic cutout, right-aligned text block above a custom horizontal bar chart with gradients.

【图表风格】
- Bar charts utilize horizontal bars with a gradient fading to transparent.
- Data points are connected with fine dashed lines.
- Donut charts use thin, semi-transparent white/grey segments.

【章节页构图】
- Left-aligned prominent section number with square accent, large illustrative graphic bleeding off the top right.

【收尾页构图】
- Centered heavy typography over a massive, screen-filling background illustration.

【禁止】
- Avoid mixing vector illustrations with realistic photography in the same composition.
- Do not use complex backgrounds that interfere with text legibility.
- Avoid rotating text blocks at severe angles that hinder readability.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Technology sector company profiles、Future-oriented strategic planning、High-impact, low-text keynotes。
