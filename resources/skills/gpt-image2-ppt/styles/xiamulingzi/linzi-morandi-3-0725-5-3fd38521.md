# 5 · 3.07更新高级色25 / linzi-morandi-3-0725-5-3fd38521

## 风格ID
linzi-morandi-3-0725-5-3fd38521

## 风格名称
5 · 3.07更新高级色25 / linzi-morandi-3-0725-5-3fd38521

## 风格描述
Elegant, artistic template featuring muted Morandi colors, watercolor brushstroke corners, and serif typography. Ideal for academic or creative presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background with muted slate, coral, mustard, and lilac accents. Text uses deep charcoal for contrast.
- fonts: Elegant serif headers establish academic/artistic tone; clean sans-serif body text ensures readability.
- spacing: Airy and centralized. Generous outer margins (especially at corners to accommodate painted assets) with comfortable 1.5x line height in text blocks.
- shape_language: Soft and organic. Primarily uses perfect circles for nodes, thin dotted lines, and rounded shapes or organic brush textures.
- texture: Matte paper feel, punctuated by acrylic/watercolor painted edge textures.
- grid: Often centered or symmetrically divided. Balanced horizontal arrays and vertical timelines.
- motion_or_depth: Strictly flat. Zero drop shadows or 3D effects; relies entirely on color variation and structural hierarchy.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「5 · 3.07更新高级色25 / linzi-morandi-3-0725-5-3fd38521」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, artistic template featuring muted Morandi colors, watercolor brushstroke corners, and serif typography. Ideal for academic or creative presentations.
- 推荐配色：#FDFBF7、#798897、#E39B8F、#DEB26A、#807796、#4A4A4A

【不可丢失的风格锚点】
- Organic watercolor brushstrokes framing the corners
- Muted, dusty pastel color palette (Morandi style)
- Minimalist colored dot nodes and dotted connecting lines
- Centralized layouts with generous negative space

【字体】
- Use elegant serif fonts for primary titles and section numbers to anchor the academic feel.
- Body text should be sans-serif with a minimum 1.5x line spacing for legibility.
- Subtitles or minor labels should use muted accent colors rather than heavy bolding.

【封面页构图】
- Centered title and subtitle suspended above a row of alternating colored dots, framed by organic corner textures

【内容页构图】
- Sweeping horizontal curved arrow acting as a timeline, with alternating text blocks and a right-anchored portrait image

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle suspended above a row of alternating colored dots, framed by organic corner textures","zones":["Centered title and subtitle suspended above a row of alternating colored dots, framed by organic corner textures"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["minimal","centered","artistic"],"avoid":["Heavy data","Detailed agendas","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Presentation opening"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Offset section title on the left with a centralized, vertically connected dotted list on the right","zones":["Offset section title on the left with a centralized, vertically connected dotted list on the right"],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["timeline","list","vertical"],"avoid":["Long paragraph text","Images","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Table of contents","High-level outlines"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Sweeping horizontal curved arrow acting as a timeline, with alternating text blocks and a right-anchored portrait image","zones":["Sweeping horizontal curved arrow acting as a timeline, with alternating text blocks and a right-anchored portrait image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["timeline","flow","curved"],"avoid":["Comparative data","Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process overviews","Historical timelines","Step-by-step methodologies"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-portrait","purpose":"contextual photography","bbox":[0.68,0.12,0.2,0.49],"priority":1}]},{"id":"content-comparison","composition":"Split top zone with an image and three icon-headed text columns, grounded by a wide, top-and-bottom bordered text row","zones":["Split top zone with an image and three icon-headed text columns, grounded by a wide, top-and-bottom bordered text row"],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["split-layout","columns","summary"],"avoid":["Simple singular messages","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Multi-faceted concepts","Combining media with detailed notes"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"top-left-rounded","purpose":"supporting visual","bbox":[0.13,0.28,0.24,0.28],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Symmetrical 2x3 matrix of outlined cards featuring corner-anchored icons","zones":["Symmetrical 2x3 matrix of outlined cards featuring corner-anchored icons"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["grid","cards","matrix"],"avoid":["Large images","Continuous narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Categorized text blocks","Methodology details"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Offset section title on the left with a centralized, vertically connected dotted list on the right","zones":["Offset section title on the left with a centralized, vertically connected dotted list on the right"],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["timeline","list","vertical"],"avoid":["Long paragraph text","Images","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Table of contents","High-level outlines"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing statement with a multi-colored dotted underline and painted corner accents","zones":["Centered closing statement with a multi-colored dotted underline and painted corner accents"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic watercolor brushstrokes framing the corners","Muted, dusty pastel color palette (Morandi style)","Minimalist colored dot nodes and dotted connecting lines"],"optional_variants":["minimal","closing","centered"],"avoid":["New information","Data summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be unbordered with slight rounded corners or run full-bleed within constrained horizontal bands.
- Use photography that matches the muted, low-contrast aesthetic of the template.

【图标与装饰】
- Use minimalist, monochrome line icons.
- Place icons inside softly colored boundary shapes (circles or pills) to unify them with the palette.

【数据页构图】
- Symmetrical 2x3 matrix of outlined cards featuring corner-anchored icons

【图表风格】
- Avoid complex axes-based charts; favor qualitative infographics, timelines, and discrete feature boxes.
- Use thin dotted lines to connect data points or timeline nodes.

【章节页构图】
- Offset section title on the left with a centralized, vertically connected dotted list on the right

【收尾页构图】
- Centered closing statement with a multi-colored dotted underline and painted corner accents

【禁止】
- Avoid harsh, saturated primary colors (neon reds, bright blues) that break the muted Morandi palette.
- Do not use heavy drop shadows, bevels, or 3D gradients.
- Avoid dense blocks of text that eliminate the generous negative space.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic thesis defenses、Artistic portfolios or creative pitches、Literature reviews、Humanities and soft-science lectures。
