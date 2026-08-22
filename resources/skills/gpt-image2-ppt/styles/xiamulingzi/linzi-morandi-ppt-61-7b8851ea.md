# 优雅线条（61）---木七设计 · ppt模板 / linzi-morandi-ppt-61-7b8851ea

## 风格ID
linzi-morandi-ppt-61-7b8851ea

## 风格名称
优雅线条（61）---木七设计 · ppt模板 / linzi-morandi-ppt-61-7b8851ea

## 风格描述
A minimalist, Morandi-themed design system featuring muted pastel tones, fluid organic background shapes, and elegant botanical line-art accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds use warm light gray. Brand accents use a trio of sage green, taupe, and sand. Text relies on a low-contrast dark sage/gray.
- fonts: Clean sans-serif typography. Titles feature prominent sizing, often paired with smaller, lighter-weight subtitles.
- spacing: Generous negative space, especially around the perimeter. Content is typically contained within the central 70% of the slide.
- shape_language: A contrast between organic, fluid background vectors and structured, softly rounded foreground containers (cards, teardrops, pills).
- texture: Flat vector base with intricate, wireframe-like botanical textures drawn in thin intersecting lines.
- grid: Symmetrical column-based grids (often 3 or 4 columns) for enumerations, alongside 50/50 asymmetrical splits for mixed media.
- motion_or_depth: Predominantly flat layers with subtle overlaps. Occasional use of soft, diffuse drop shadows on specific image containers to establish a foreground layer.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（61）---木七设计 · ppt模板 / linzi-morandi-ppt-61-7b8851ea」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, Morandi-themed design system featuring muted pastel tones, fluid organic background shapes, and elegant botanical line-art accents.
- 推荐配色：#EBEBEA、#7A877B、#BBAFA5、#D6CDC4、#657065

【不可丢失的风格锚点】
- Muted 'Morandi' pastel color scheme
- Fluid, organic blob background framing elements
- Delicate, overlapping line-art botanical illustrations in corners
- Pill-shaped badges for section tagging
- Softly rounded rectangles for structural containers

【字体】
- Primary titles are centered on covers/transitions and top-aligned on content slides
- Titles consistently paired with a secondary, lighter subtitle
- Pill-tag shapes serve as pre-headers or structural signifiers
- Body text is low-contrast and block-aligned with ample line-height

【封面页构图】
- Centered dual-language titles with pill-tag author block, framed by organic corner blobs and botanical lines

【内容页构图】
- Four-column grid of teardrop/pin icon containers over discrete text blocks

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered dual-language titles with pill-tag author block, framed by organic corner blobs and botanical lines","zones":["Centered dual-language titles with pill-tag author block, framed by organic corner blobs and botanical lines"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["minimal","centered","botanical"],"avoid":["Data delivery","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation openings","Title slides"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered title and subtitle with a pill-tag section number below","zones":["Centered title and subtitle with a pill-tag section number below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["transition","section-break"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda markers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four-column grid of teardrop/pin icon containers over discrete text blocks","zones":["Four-column grid of teardrop/pin icon containers over discrete text blocks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["4-columns","icons","features"],"avoid":["Long-form paragraphs","Image-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Four-point summaries","Value propositions"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Four vertical rounded-rectangle cards connected by directional icon badges","zones":["Four vertical rounded-rectangle cards connected by directional icon badges"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["cards","process","timeline"],"avoid":["Unordered lists","High-density data","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Methodology","Sequential workflows"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Centered title and subtitle with a pill-tag section number below","zones":["Centered title and subtitle with a pill-tag section number below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["transition","section-break"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda markers"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Four-column grid of teardrop/pin icon containers over discrete text blocks","zones":["Four-column grid of teardrop/pin icon containers over discrete text blocks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["4-columns","icons","features"],"avoid":["Long-form paragraphs","Image-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Four-point summaries","Value propositions"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Oversized decorative quote mark on top left over an image, central text block, and right-side solid color sidebar with secondary points","zones":["Oversized decorative quote mark on top left over an image, central text block, and right-side solid color sidebar with secondary points"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["quote","sidebar","overlapping"],"avoid":["Data charts","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key statements","Mission/Vision slides"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"quote-image","purpose":"author or context image","bbox":[0.05,0.32,0.32,0.43],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered dual-language thank you message with pill-tag author block, framed by organic corner blobs and botanical lines","zones":["Centered dual-language thank you message with pill-tag author block, framed by organic corner blobs and botanical lines"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted 'Morandi' pastel color scheme","Fluid, organic blob background framing elements","Delicate, overlapping line-art botanical illustrations in corners"],"optional_variants":["closing","minimal","centered"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation closing","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images utilize standard aspect ratios or sharp rectangular crops
- Image grids use uniform padding between frames
- Large feature images occasionally feature soft drop shadows to lift them above intersecting text boxes

【图标与装饰】
- Monocolor (white) flat icons centered inside prominent geometric or teardrop-shaped containers
- Icons are minimalist, line or solid styles, strictly mapped to content concepts

【数据页构图】
- Centered title and subtitle with a pill-tag section number below

【图表风格】
- No traditional data charts present; structural data represented via progressive cards or sequential teardrop containers

【章节页构图】
- Centered title and subtitle with a pill-tag section number below

【收尾页构图】
- Centered dual-language thank you message with pill-tag author block, framed by organic corner blobs and botanical lines

【禁止】
- Harsh, highly saturated primary colors
- Sharp, aggressive geometric background graphics
- High-contrast true black (#000000) for text
- Cluttered or edge-to-edge text layouts destroying negative space
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency proposals、Lifestyle or wellness brand decks、Boutique corporate reviews、Design and architectural portfolios。
