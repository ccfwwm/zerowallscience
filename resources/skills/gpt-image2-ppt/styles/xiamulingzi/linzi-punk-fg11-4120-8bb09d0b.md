# 4120 · FG11【朋克酷风】 / linzi-punk-fg11-4120-8bb09d0b

## 风格ID
linzi-punk-fg11-4120-8bb09d0b

## 风格名称
4120 · FG11【朋克酷风】 / linzi-punk-fg11-4120-8bb09d0b

## 风格描述
Grunge cyberpunk editorial style featuring torn paper edge masking, masking tape accents, overlapping high-contrast photography, and bold outlined typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dominant deep black and stark white backgrounds, accented by vivid neon red and golden yellow.
- fonts: Bold geometric sans-serif for primary typography, mixing solid fills with stroke-only variants. Standard readable sans for body text.
- spacing: Editorial and chaotic; elements intentionally overlap boundaries and edges to create depth.
- shape_language: Contrast between sharp rectangular photographic frames and organic, jagged torn paper edges.
- texture: Physical scrapbooking textures (tape, ripped paper) superimposed over clean digital typography and flat dark layers.
- grid: Asymmetrical and unconstrained; uses staggered vertical and horizontal alignments rather than a strict column grid.
- motion_or_depth: High depth achieved through overlapping physical layers: background -> watermark text -> photo -> torn paper -> foreground text -> tape/stickers.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「4120 · FG11【朋克酷风】 / linzi-punk-fg11-4120-8bb09d0b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Grunge cyberpunk editorial style featuring torn paper edge masking, masking tape accents, overlapping high-contrast photography, and bold outlined typography.
- 推荐配色：#111111、#FFFFFF、#E51928、#EAB43B、#F2F2F2

【不可丢失的风格锚点】
- Torn paper edge shapes acting as masks and dividers
- Vector masking tape pieces acting as photo anchors
- Oversized stroke-only (outlined) typography used as background watermarks
- Delicate plus-sign (+) grid overlays
- Thin yellow wireframe elliptical scribbles

【字体】
- Mix solid text with identical stroke-only (outline) text to create echoing reflections.
- Utilize 90-degree rotated typography for margin framing and structural dividers.
- Stack bold, oversized headline text tightly, sometimes overlapping image boundaries.

【封面页构图】
- Centered typography with a mirrored stroke-only reflection below, flanked by vertical margin text.

【内容页构图】
- Full-canvas overlapping photo collage intersected by a large, central torn paper strip housing mixed-color typography.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography with a mirrored stroke-only reflection below, flanked by vertical margin text.","zones":["Centered typography with a mirrored stroke-only reflection below, flanked by vertical margin text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["minimal","typographic","light-mode"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Dark split layout with oversized left-aligned typography and a right-side image disrupted by torn edges and tape.","zones":["Dark split layout with oversized left-aligned typography and a right-side image disrupted by torn edges and tape."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["dark-mode","collage","badge"],"avoid":["Complex bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-hero","purpose":"Atmospheric high-contrast image","bbox":[0.55,0.0,0.45,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Full-canvas overlapping photo collage intersected by a large, central torn paper strip housing mixed-color typography.","zones":["Full-canvas overlapping photo collage intersected by a large, central torn paper strip housing mixed-color typography."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["collage","torn-paper","layered-text"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Impact statements","Core brand values"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"bg-collage-left","purpose":"Background texture left","bbox":[0.15,0.0,0.4,1.0],"priority":2},{"id":"bg-collage-right","purpose":"Background texture right","bbox":[0.55,0.0,0.45,1.0],"priority":2}]},{"id":"content-comparison","composition":"Split dark layout featuring a left-aligned torn image with intersecting typography, and right-aligned clean body copy.","zones":["Split dark layout featuring a left-aligned torn image with intersecting typography, and right-aligned clean body copy."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["dark-mode","split-layout","vertical-text"],"avoid":["Financial reporting","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Product descriptions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-vertical-image","purpose":"Feature image with torn edges","bbox":[0.2,0.1,0.35,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Dark split layout with oversized left-aligned typography and a right-side image disrupted by torn edges and tape.","zones":["Dark split layout with oversized left-aligned typography and a right-side image disrupted by torn edges and tape."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["dark-mode","collage","badge"],"avoid":["Complex bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-hero","purpose":"Atmospheric high-contrast image","bbox":[0.55,0.0,0.45,1.0],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Full-canvas overlapping photo collage intersected by a large, central torn paper strip housing mixed-color typography.","zones":["Full-canvas overlapping photo collage intersected by a large, central torn paper strip housing mixed-color typography."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["collage","torn-paper","layered-text"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Impact statements","Core brand values"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"bg-collage-left","purpose":"Background texture left","bbox":[0.15,0.0,0.4,1.0],"priority":2},{"id":"bg-collage-right","purpose":"Background texture right","bbox":[0.55,0.0,0.45,1.0],"priority":2}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed photographic background with a torn top edge, featuring a left-aligned device mockup and right-aligned social links.","zones":["Full-bleed photographic background with a torn top edge, featuring a left-aligned device mockup and right-aligned social links."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Torn paper edge shapes acting as masks and dividers","Vector masking tape pieces acting as photo anchors","Oversized stroke-only (outlined) typography used as background watermarks"],"optional_variants":["mockup","full-bleed","contact"],"avoid":["Text-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information","Digital product showcases"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"background-event","purpose":"Full slide atmospheric background","bbox":[0.0,0.1,1.0,0.9],"priority":2},{"id":"device-screen","purpose":"Laptop screen content replacement","bbox":[0.05,0.25,0.4,0.5],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use stark rectangular framing, but intentionally disrupt the edges with torn paper vectors or tape graphics.
- Apply high-contrast, vivid lighting (neon/duotone style) to source images to fit the dark aesthetic.
- Overlay delicate digital crosshairs or plus-sign grids directly onto dark areas of images.

【图标与装饰】
- Minimal use of traditional icons; relies instead on typographic badges (e.g., a bold 'X' inside a white circle with tape) and simple social media outlines.

【数据页构图】
- Dark split layout with oversized left-aligned typography and a right-side image disrupted by torn edges and tape.

【图表风格】
- No charts present, but data would likely use bold oversized numbers, harsh neon lines, and stark high-contrast bars over dark backgrounds.

【章节页构图】
- Dark split layout with oversized left-aligned typography and a right-side image disrupted by torn edges and tape.

【收尾页构图】
- Full-bleed photographic background with a torn top edge, featuring a left-aligned device mockup and right-aligned social links.

【禁止】
- Avoid standard neat corporate grids and isolated bounding boxes.
- Do not use drop shadows; rely on overlapping opaque shapes and textures for depth.
- Avoid low-contrast or pastel photography; images must have deep blacks and vivid highlights.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or streetwear pitch decks、Music festival or nightlife event proposals、Creative agency portfolios、Disruptive tech or youth-oriented brand guidelines。
