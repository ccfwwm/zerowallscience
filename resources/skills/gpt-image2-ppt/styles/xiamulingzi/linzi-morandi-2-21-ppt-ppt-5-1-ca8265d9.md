# 5-1 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-5-1-ca8265d9

## 风格ID
linzi-morandi-2-21-ppt-ppt-5-1-ca8265d9

## 风格名称
5-1 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-5-1-ca8265d9

## 风格描述
An elegant, editorial-style template featuring muted earthy tones, high-contrast serif typography, and asymmetrical overlapping blocks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark brown and tan serve as alternating background bases, with stark white for high-contrast text and graphic accents.
- fonts: Elegant, high-contrast Serif for primary headers to establish an editorial mood; clean, light Sans-serif for body copy.
- spacing: Dynamic spacing with generous margins, utilizing overlapping zones rather than strict gutters.
- shape_language: Primarily sharp orthogonal rectangles contrasting with fluid, multi-stroke wavy lines.
- texture: Flat, matte color blocks relying entirely on placeholder photography for material texture.
- grid: Asymmetrical, fractured grid based on vertical and horizontal color splits rather than standard columns.
- motion_or_depth: Depth is consistently achieved by layering text over color blocks and images over contrasting backgrounds.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「5-1 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-5-1-ca8265d9」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style template featuring muted earthy tones, high-contrast serif typography, and asymmetrical overlapping blocks.
- 推荐配色：#625D4F、#A89073、#FFFFFF

【不可丢失的风格锚点】
- Muted earthy color palette (browns and tans)
- Oversized, high-contrast serif typography
- Asymmetrical color blocking and overlapping elements
- Wavy line graphic accents
- Rotated framing text

【字体】
- Use oversized serif fonts for primary titles, often overlapping structural boundaries.
- Employ rotated (90-degree) text along edges as structural framing devices.
- Keep body text small, light, and sans-serif to contrast with dramatic headers.

【封面页构图】
- Split background with central overlapping image block and oversized text.

【内容页构图】
- Offset central image over dark block with diagonal wavy lines overlay.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Split background with central overlapping image block and oversized text.","zones":["Split background with central overlapping image block and oversized text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["cover","split-background","editorial"],"avoid":["Data-heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section headers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_image","purpose":"Central thematic image","bbox":[0.08,0.18,0.84,0.64],"priority":1}]}
- section: {"id":"section-primary","composition":"Three-column structure with left text, center image, and right vertical framing text.","zones":["Three-column structure with left text, center image, and right vertical framing text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["content-image-center","vertical-text"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction slides","Key concepts"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center_feature","purpose":"Illustrative photo","bbox":[0.5,0.18,0.35,0.64],"priority":1}]}
- content: [{"id":"content-content","composition":"Offset central image over dark block with diagonal wavy lines overlay.","zones":["Offset central image over dark block with diagonal wavy lines overlay."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["numbered-content","image-overlay"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Numbered points","Featured quotes with images"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right_feature","purpose":"Atmospheric or thematic image","bbox":[0.38,0.18,0.6,0.64],"priority":1}]},{"id":"content-comparison","composition":"Split background with right-aligned image and left-aligned floating text.","zones":["Split background with right-aligned image and left-aligned floating text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["split-layout","minimal-text"],"avoid":["Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Statements","Brief overviews"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"right_column_image","purpose":"Supporting lifestyle image","bbox":[0.56,0.0,0.29,0.71],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Diagonal timeline utilizing connected hexagonal nodes with icons.","zones":["Diagonal timeline utilizing connected hexagonal nodes with icons."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["timeline","process-diagram","hexagons"],"avoid":["Photographic portfolios","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","Timelines","Step-by-step guides"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-column structure with left text, center image, and right vertical framing text.","zones":["Three-column structure with left text, center image, and right vertical framing text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["content-image-center","vertical-text"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction slides","Key concepts"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center_feature","purpose":"Illustrative photo","bbox":[0.5,0.18,0.35,0.64],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Full-bleed background image largely obscured by a prominent framed text panel.","zones":["Full-bleed background image largely obscured by a prominent framed text panel."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["framed-text","image-background"],"avoid":["Standard lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Strong quotes","Manifesto statements"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"background_ambient","purpose":"Atmospheric background texture","bbox":[0.0,0.0,1.0,1.0],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Central image spanning a split background with large overlapping closing text.","zones":["Central image spanning a split background with large overlapping closing text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earthy color palette (browns and tans)","Oversized, high-contrast serif typography","Asymmetrical color blocking and overlapping elements"],"optional_variants":["closing","text-overlay"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"closing_background","purpose":"Final brand image","bbox":[0.15,0.18,0.7,0.64],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be full-bleed or unbordered rectangular crops.
- Position images to overlap at least one background color transition or graphic element.
- Device mockups (e.g., phones) use flat, minimalist silhouettes.

【图标与装饰】
- Use solid white, universally recognizable glyphs.
- Keep icons flat without shadows or gradients.
- Enclose icons in geometric shapes (like hexagons) for process steps.

【数据页构图】
- Diagonal timeline utilizing connected hexagonal nodes with icons.

【图表风格】
- Process flows utilize geometric shapes (hexagons) connected by simple lines.
- Avoid standard pie/bar charts in favor of minimal, typographic, or icon-driven diagrams.

【章节页构图】
- Three-column structure with left text, center image, and right vertical framing text.

【收尾页构图】
- Central image spanning a split background with large overlapping closing text.

【禁止】
- Do not use bright, saturated colors or gradients.
- Avoid heavy drop shadows or 3D effects on images and text.
- Do not constrain images to standard centered placeholders without overlapping elements.
- Avoid thick borders around images.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle lookbooks、Creative agency portfolios、Editorial-style brand presentations、High-end product pitches。
