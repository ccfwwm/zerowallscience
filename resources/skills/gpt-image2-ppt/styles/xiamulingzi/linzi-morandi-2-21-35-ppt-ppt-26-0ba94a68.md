# 莫兰迪风格PPT (26) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-26-0ba94a68

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-26-0ba94a68

## 风格名称
莫兰迪风格PPT (26) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-26-0ba94a68

## 风格描述
An editorial, minimalist presentation style featuring striking high-contrast typography, asymmetrical grids, floating content cards, and muted camel-tan accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominate, with dark charcoal (#383838) for text/heavy blocks, and camel (#C1976C) used strictly for accents, active states, and highlights.
- fonts: Primary headers use a heavy, brutalist sans-serif (often lowercase for styling); body text uses a highly legible, clean neo-grotesque sans-serif.
- spacing: Generous outer margins with a dedicated left-rail for structural branding; tight grouping within elevated cards.
- shape_language: Strictly orthogonal. Sharp corners on all rectangles, no rounded edges.
- texture: Flat color fields contrasted with high-elevation elements via diffuse, wide-spread drop shadows.
- grid: Asymmetrical multi-column grids that intentionally cross or break central axes to create editorial tension.
- motion_or_depth: Depth is selectively applied using soft drop shadows to pop active/featured content panels off flat backgrounds.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (26) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-26-0ba94a68」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial, minimalist presentation style featuring striking high-contrast typography, asymmetrical grids, floating content cards, and muted camel-tan accents.
- 推荐配色：#FFFFFF、#383838、#C1976C、#F4F4F4、#1A1A1A

【不可丢失的风格锚点】
- Consistent left-edge rotated marginalia
- Floating white cards with large, soft drop shadows
- Split-color typography treatments in headers
- Strict rectangular shapes and stark block contrasts

【字体】
- Headers are often styled in bold lowercase.
- Titles frequently utilize a split-color effect where parts of a word take the accent color.
- High contrast between massive header weights and light/regular body text.

【封面页构图】
- Split layout with a massive right-side hero image, layered bottom footer strip, and striking oversized lowercase typography.

【内容页构图】
- Top-edge image bleed with a 2x2 icon grid where one quadrant is inverted/highlighted using an accent background and drop shadow.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Split layout with a massive right-side hero image, layered bottom footer strip, and striking oversized lowercase typography.","zones":["Split layout with a massive right-side hero image, layered bottom footer strip, and striking oversized lowercase typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["split-screen","bold-typography","editorial-cover"],"avoid":["Heavy data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Dominant right-side editorial image","bbox":[0.4,0.0,0.6,0.89],"priority":1}]}
- section: {"id":"section-primary","composition":"Three-column vertical portrait layout where a dark horizontal band grounds the lower third, containing text.","zones":["Three-column vertical portrait layout where a dark horizontal band grounds the lower third, containing text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["team-grid","base-band","portrait-columns"],"avoid":["Detailed biographies","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product line-ups"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"team-left","purpose":"Left portrait","bbox":[0.12,0.27,0.22,0.53],"priority":1},{"id":"team-center","purpose":"Center portrait","bbox":[0.4,0.27,0.22,0.53],"priority":1},{"id":"team-right","purpose":"Right portrait","bbox":[0.67,0.27,0.22,0.53],"priority":1}]}
- content: [{"id":"content-content","composition":"Top-edge image bleed with a 2x2 icon grid where one quadrant is inverted/highlighted using an accent background and drop shadow.","zones":["Top-edge image bleed with a 2x2 icon grid where one quadrant is inverted/highlighted using an accent background and drop shadow."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["grid-highlight","top-image","icon-list"],"avoid":["Sequential steps","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Four-point summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"header-decoration","purpose":"Top cropped decorative image","bbox":[0.2,0.0,0.8,0.28],"priority":2}]},{"id":"content-comparison","composition":"Asymmetrical layout featuring a 1x3 horizontal feature list where the center item is elevated as a floating card with a top-border accent.","zones":["Asymmetrical layout featuring a 1x3 horizontal feature list where the center item is elevated as a floating card with a top-border accent."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["center-highlight","horizontal-list","floating-card"],"avoid":["Dense text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Service pillars","Key differentiators"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-decor","purpose":"Abstract or thematic top-right anchor","bbox":[0.4,0.0,0.6,0.28],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Full-width background graphic (map) with accent-colored regions and a prominent floating summary card overlapping the bottom right.","zones":["Full-width background graphic (map) with accent-colored regions and a prominent floating summary card overlapping the bottom right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["map-graphic","floating-legend","data-highlight"],"avoid":["Text-heavy data analysis","copying source assets, source text, or an exact source arrangement"],"best_for":["Geographic data","Large diagrams"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top-edge image bleed with a 2x2 icon grid where one quadrant is inverted/highlighted using an accent background and drop shadow.","zones":["Top-edge image bleed with a 2x2 icon grid where one quadrant is inverted/highlighted using an accent background and drop shadow."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["grid-highlight","top-image","icon-list"],"avoid":["Sequential steps","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Four-point summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"header-decoration","purpose":"Top cropped decorative image","bbox":[0.2,0.0,0.8,0.28],"priority":2}]}]
- closing: {"id":"closing-primary","composition":"Dark background with an oversized typography focal point in the bottom right, balanced by a subtle quote block in the mid-left.","zones":["Dark background with an oversized typography focal point in the bottom right, balanced by a subtle quote block in the mid-left."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Consistent left-edge rotated marginalia","Floating white cards with large, soft drop shadows","Split-color typography treatments in headers"],"optional_variants":["inverted-colors","oversized-type","minimal-closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing statements","Contact slides","Section transitions"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into strict rectangles, often bleeding to the edge of the canvas.
- Images frequently overlap with floating text blocks or color fields to build depth.
- Desaturated or moody photography pairs best with the stark palette.

【图标与装饰】
- Line icons with consistent, medium stroke weights.
- Icons are rendered in dark charcoal or black, avoiding multi-color complexity.

【数据页构图】
- Full-width background graphic (map) with accent-colored regions and a prominent floating summary card overlapping the bottom right.

【图表风格】
- Data visuals prioritize minimal lines, using the accent color for key data points or highlighted regions.
- Legends and context are often placed in floating overlapping cards rather than side-by-side.

【章节页构图】
- Three-column vertical portrait layout where a dark horizontal band grounds the lower third, containing text.

【收尾页构图】
- Dark background with an oversized typography focal point in the bottom right, balanced by a subtle quote block in the mid-left.

【禁止】
- Do not use rounded corners on shapes or images.
- Avoid bright, highly saturated primary colors.
- Do not center-align body text; maintain strict left-alignment.
- Avoid placing text directly over complex areas of images without a protective shape layer.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or editorial lookbooks、High-end minimalist corporate profiles、Boutique agency pitch decks、Architecture or design portfolios。
