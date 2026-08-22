# 优雅线条（56）---木七设计 · ppt模板 / linzi-morandi-ppt-56-e229304d

## 风格ID
linzi-morandi-ppt-56-e229304d

## 风格名称
优雅线条（56）---木七设计 · ppt模板 / linzi-morandi-ppt-56-e229304d

## 风格描述
An elegant, minimalist template featuring a Morandi color palette, organic fluid background shapes, and clean white content overlay cards.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Beige/cream background base with olive green, ochre, taupe, and muted terracotta accents used for shapes, text, and icons.
- fonts: Elegant serif for primary titles and section numbers; clean sans-serif for dense body copy.
- spacing: Generous outer padding around the central white content card (approx 5-10% of slide width); moderate internal padding within the card.
- shape_language: Contrast between soft, fluid background blobs and sharp, straight-edged rectangular content cards and image frames.
- texture: Completely flat vector design with no gradients, bevels, or drop shadows.
- grid: Center-aligned axis for covers/dividers; rigid 2-column or 3-column internal grids within the white content cards.
- motion_or_depth: Flat 2.5D depth established strictly by the white content card occluding the continuous fluid background pattern.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（56）---木七设计 · ppt模板 / linzi-morandi-ppt-56-e229304d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist template featuring a Morandi color palette, organic fluid background shapes, and clean white content overlay cards.
- 推荐配色：#F0EAE0、#9BA180、#E8BB7D、#A79273、#8F6A5B

【不可丢失的风格锚点】
- Low-saturation 'Morandi' earthy color palette
- Large, intersecting organic fluid shapes (blobs) in the background
- Thin, sweeping bezier curve lines serving as delicate accents
- Strict use of a crisp white overlay card for inner content slides to frame information

【字体】
- Titles on covers and section breaks are centered and strictly use the serif font in olive or taupe.
- Subtitle and meta-information are flanked by delicate horizontal lines.
- Body text inside content cards is predominantly left-aligned, sans-serif, and uses dark gray/brown for legibility.

【封面页构图】
- Full-bleed organic background with a strictly centered title block.

【内容页构图】
- White rectangular overlay card housing a 3-column asymmetric layout with a central image stack.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed organic background with a strictly centered title block.","zones":["Full-bleed organic background with a strictly centered title block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["minimal-cover","centered-text","fluid-background"],"avoid":["Detailed agendas","Heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Speaker introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Full-bleed organic background with centered section numbering and title.","zones":["Full-bleed organic background with centered section numbering and title."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["section-divider","centered-hierarchy"],"avoid":["Data visualization","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"White rectangular overlay card housing a 3-column asymmetric layout with a central image stack.","zones":["White rectangular overlay card housing a 3-column asymmetric layout with a central image stack."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["white-card","three-column","image-stack"],"avoid":["Single large charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Service overviews","Mixed media layouts"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-top","purpose":"Vertical lifestyle/product shot","bbox":[0.33,0.05,0.33,0.45],"priority":1},{"id":"center-bottom","purpose":"Vertical lifestyle/product shot","bbox":[0.33,0.5,0.33,0.45],"priority":2}]},{"id":"content-comparison","composition":"White overlay card featuring a serpentine, continuous-line timeline graphic.","zones":["White overlay card featuring a serpentine, continuous-line timeline graphic."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["serpentine-timeline","process-flow","white-card"],"avoid":["Dense paragraphs","Large photography","copying source assets, source text, or an exact source arrangement"],"best_for":["Processes","Timelines","Step-by-step guides"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"White overlay card balancing left-aligned text/stats with hanging graphical elements on the right.","zones":["White overlay card balancing left-aligned text/stats with hanging graphical elements on the right."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["stat-highlight","hanging-graphics","split-layout"],"avoid":["Heavy text essays","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Infographics","Ideation summaries"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Full-bleed organic background with centered section numbering and title.","zones":["Full-bleed organic background with centered section numbering and title."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["section-divider","centered-hierarchy"],"avoid":["Data visualization","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Full-bleed organic background with a centered closing message.","zones":["Full-bleed organic background with a centered closing message."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Low-saturation 'Morandi' earthy color palette","Large, intersecting organic fluid shapes (blobs) in the background","Thin, sweeping bezier curve lines serving as delicate accents"],"optional_variants":["closing-slide","centered-text","bookend"],"avoid":["Summaries","Data","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are embedded as sharp, straight-edged rectangles.
- No borders, strokes, or drop shadows are applied to images.
- Images lock cleanly into grid columns alongside text blocks.

【图标与装饰】
- Icons are flat, solid-color vectors.
- They strictly adhere to the Morandi accent colors (olive, ochre, terracotta).
- Used systematically to anchor lists or top-align columns.

【数据页构图】
- White overlay card balancing left-aligned text/stats with hanging graphical elements on the right.

【图表风格】
- Infographic elements (like timelines or hanging shapes) use alternating colors from the core palette.
- Lines are thick and solid, terminating in simple geometric shapes (arrows, targets).

【章节页构图】
- Full-bleed organic background with centered section numbering and title.

【收尾页构图】
- Full-bleed organic background with a centered closing message.

【禁止】
- Bright, highly saturated, or neon colors.
- Drop shadows, glows, or 3D effects on shapes or text.
- Rounded corners on photographs or the main white content card.
- Placing dense body text directly over the organic background blobs without the white card.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Boutique brand proposals、Lifestyle or wellness presentations、Elegant corporate summaries。
