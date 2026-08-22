# 精选科技风8 · 模板 / linzi-tech-8-be5440d6

## 风格ID
linzi-tech-8-be5440d6

## 风格名称
精选科技风8 · 模板 / linzi-tech-8-be5440d6

## 风格描述
Modern technology and creative deck featuring fluid holographic gradients, soft floating UI cards, and geometric image masks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Vivid cyan-to-magenta gradients serve as primary branding, paired with pristine white surfaces and deep black high-contrast backgrounds.
- fonts: Clean geometric sans-serif; headers often utilize gradient fills, while body text uses dark gray or stark white for legibility.
- spacing: Generous margins with intentional overlapping of elements (cards over images, text over shapes) to create depth.
- shape_language: Soft and rounded; heavy reliance on pill shapes, archways, perfect circles, and rounded rectangles.
- texture: Smooth and glassy; prominent use of soft, diffuse drop shadows and fluid gradient color washes.
- grid: Asymmetrical and dynamic, favoring staggered arrangements and overlapping modular blocks.
- motion_or_depth: High depth achieved through distinct Z-layers: soft blurry backgrounds, masked mid-ground images, and shadowed foreground floating cards.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风8 · 模板 / linzi-tech-8-be5440d6」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Modern technology and creative deck featuring fluid holographic gradients, soft floating UI cards, and geometric image masks.
- 推荐配色：#E267ED、#507DF6

【不可丢失的风格锚点】
- Fluid holographic gradient backgrounds
- Floating white cards with soft drop shadows
- Archway and circular image masks
- Overlapping layered elements breaking strict grids

【字体】
- Headers use bold weights, often colored with the primary gradient.
- Subtitles and body copy use medium/regular weights in highly legible contrasting colors (dark gray on white, white on dark).
- Large stylized quotation marks used as graphic typographic elements.

【封面页构图】
- Centered 3D abstract object over a fluid gradient background with minimal peripheral text.

【内容页构图】
- Diagonal split balance with archway masked images and a large gradient header.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered 3D abstract object over a fluid gradient background with minimal peripheral text.","zones":["Centered 3D abstract object over a fluid gradient background with minimal peripheral text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["3d-centerpiece","holographic-background","minimal-text"],"avoid":["Data heavy content","Detailed agendas","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","High-impact visual introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Floating shadowed text cards combined with a large circular image mask overlapping the edge.","zones":["Floating shadowed text cards combined with a large circular image mask overlapping the edge."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["floating-cards","circle-mask","oversized-quotes"],"avoid":["Timelines","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Core value propositions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"large-circle-right","purpose":"Subject or textural imagery","bbox":[0.65,0.3,0.35,0.7],"priority":1}]}
- content: [{"id":"content-content","composition":"Diagonal split balance with archway masked images and a large gradient header.","zones":["Diagonal split balance with archway masked images and a large gradient header."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["arch-masks","gradient-text","split-layout"],"avoid":["Complex data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-top-center","purpose":"Atmospheric or architectural image","bbox":[0.35,0.0,0.3,0.4],"priority":1},{"id":"image-bottom-right","purpose":"Secondary atmospheric image","bbox":[0.6,0.6,0.3,0.4],"priority":2}]},{"id":"content-comparison","composition":"Horizontal gallery of framed portraits with a gradient overlay and centralized text layout.","zones":["Horizontal gallery of framed portraits with a gradient overlay and centralized text layout."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["gallery-row","team-slide","overlay-text"],"avoid":["Text-heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product galleries"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"gallery-background","purpose":"Array of portraits or background texture","bbox":[0.05,0.15,0.9,0.35],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Symmetrical 2x4 grid of white shadowed cards containing thin-line icons on a fluid background.","zones":["Symmetrical 2x4 grid of white shadowed cards containing thin-line icons on a fluid background."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["card-grid","iconography","symmetrical"],"avoid":["Narrative storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Service lists","Feature highlights","Icon grids"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Diagonal split balance with archway masked images and a large gradient header.","zones":["Diagonal split balance with archway masked images and a large gradient header."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["arch-masks","gradient-text","split-layout"],"avoid":["Complex data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-top-center","purpose":"Atmospheric or architectural image","bbox":[0.35,0.0,0.3,0.4],"priority":1},{"id":"image-bottom-right","purpose":"Secondary atmospheric image","bbox":[0.6,0.6,0.3,0.4],"priority":2}]}]
- quote: {"id":"quote-primary","composition":"Half-bleed image with overlay quotes on the left, paired with a dark content section and gradient speech bubble on the right.","zones":["Half-bleed image with overlay quotes on the left, paired with a dark content section and gradient speech bubble on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["split-screen","testimonial","speech-bubble"],"avoid":["Financial reporting","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Founder messages","Mission statements"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"left-full-bleed","purpose":"Inspiring background imagery","bbox":[0.0,0.0,0.5,1.0],"priority":1},{"id":"avatar-small","purpose":"Speaker profile picture","bbox":[0.52,0.8,0.1,0.1],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Central layered graphic (textured globe + cutout element) on a strong holographic background with prominent closing text.","zones":["Central layered graphic (textured globe + cutout element) on a strong holographic background with prominent closing text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid holographic gradient backgrounds","Floating white cards with soft drop shadows","Archway and circular image masks"],"optional_variants":["holographic-background","layered-graphic","closing-contact"],"avoid":["Any heavy text content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are rarely standard rectangles; they are masked into arches, circles, or modular grid frames.
- Large background images use heavy gradient or dark overlays to preserve text readability.

【图标与装饰】
- Thin-line minimalist icons.
- Icons are frequently colored using the deck's primary gradient.

【数据页构图】
- Symmetrical 2x4 grid of white shadowed cards containing thin-line icons on a fluid background.

【图表风格】
- Abstract and stylized; curved intersecting line charts.
- Node-based hexagonal networks with interconnected colored dots and thin lines.

【章节页构图】
- Floating shadowed text cards combined with a large circular image mask overlapping the edge.

【收尾页构图】
- Central layered graphic (textured globe + cutout element) on a strong holographic background with prominent closing text.

【禁止】
- Avoid sharp right angles on primary layout cards.
- Do not use flat, muted, or earth-tone colors; stick to the vibrant neon/vaporwave spectrum.
- Avoid placing unshadowed elements directly on complex gradient backgrounds.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Tech startup pitch decks、Creative agency portfolios、Modern product launches、Web3 or AI conceptual presentations。
