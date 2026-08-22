# 5801-Urbanic · FG11【朋克酷风】 / linzi-punk-fg11-5801-urbanic-aad33e25

## 风格ID
linzi-punk-fg11-5801-urbanic-aad33e25

## 风格名称
5801-Urbanic · FG11【朋克酷风】 / linzi-punk-fg11-5801-urbanic-aad33e25

## 风格描述
Edgy, cyberpunk-inspired brutalist presentation featuring neon color blocking, glitched typography, and asymmetrical overlapping layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Solid black base (#000000) with highly saturated neon accents. White is reserved exclusively for high-contrast typography.
- fonts: Ultra-bold, extended sans-serif for display and primary headings. Clean, geometric sans-serif for body copy.
- spacing: Tight, intersecting layouts. Margins are intentionally violated with elements bleeding off the canvas.
- shape_language: Strictly orthogonal. Sharp rectangles, rigid L-shapes, and right-angled geometric intersections.
- texture: Flat, unshaded vector shapes layered starkly over high-contrast, moody/grainy photographic textures.
- grid: Broken, brutalist layout. Elements are stacked asymmetrically with purposeful Z-index overlaps.
- motion_or_depth: Zero drop shadows. Depth is achieved purely through stark foreground/background color contrast and physical occlusion of elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「5801-Urbanic · FG11【朋克酷风】 / linzi-punk-fg11-5801-urbanic-aad33e25」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Edgy, cyberpunk-inspired brutalist presentation featuring neon color blocking, glitched typography, and asymmetrical overlapping layouts.
- 推荐配色：#000000、#FF2211、#3333FF、#FFE600、#FFFFFF

【不可丢失的风格锚点】
- Horizontally sliced/glitched ultra-bold typography
- Asymmetrical neon color blocking (red, blue, yellow) against solid black
- Extensive use of rotated/vertical typography anchored to layout edges
- Circular repeating text stamps and barcode graphic accents
- Diagonal hazard-stripe motif overlays

【字体】
- Headlines must be ultra-bold, uppercase, and often styled with a horizontal glitch/slice offset.
- Use vertical rotation (90 or -90 degrees) for structural section titles and edge decoration.
- Body copy should be small, left-aligned, and strictly bounded within narrow columns to contrast with oversized headers.
- Employ repeating typography patterns (e.g., repeating the same word 3 times vertically or as a background texture).

【封面页构图】
- Full-bleed atmospheric hero image with central glitched typography and edge-aligned vertical text.

【内容页构图】
- Split asymmetric layout with black text zone on the left and a framed inset image on the right, punctuated by a vertical color block.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed atmospheric hero image with central glitched typography and edge-aligned vertical text.","zones":["Full-bleed atmospheric hero image with central glitched typography and edge-aligned vertical text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["cover-dark","hero-glitch","minimal-text"],"avoid":["Detailed content","Corporate standard decks","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","Event opening slide"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full-bleed background, requires dark or neon theme","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Complex collage of interlocking text blocks, L-shaped color fields, and multiple overlapping image crops.","zones":["Complex collage of interlocking text blocks, L-shaped color fields, and multiple overlapping image crops."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["collage","multi-image","asymmetrical-overlap"],"avoid":["Sequential reading","List formats","copying source assets, source text, or an exact source arrangement"],"best_for":["About us collage","Dynamic section break","Visual storytelling"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"collage-top-right","purpose":"Atmospheric accent photo","bbox":[0.5,0,0.5,0.4],"priority":2},{"id":"collage-bottom-center","purpose":"Primary subject photo","bbox":[0.32,0.38,0.45,0.62],"priority":1},{"id":"collage-bottom-right","purpose":"Textured background photo","bbox":[0.55,0.6,0.45,0.4],"priority":3}]}
- content: [{"id":"content-content","composition":"Split asymmetric layout with black text zone on the left and a framed inset image on the right, punctuated by a vertical color block.","zones":["Split asymmetric layout with black text zone on the left and a framed inset image on the right, punctuated by a vertical color block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["split-layout","image-right","vertical-accent"],"avoid":["Data-heavy slides","Multiple discrete points","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction","Historical overview","Mission statement"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-image-right","purpose":"Inset structural photo","bbox":[0.56,0.05,0.34,0.9],"priority":1}]},{"id":"content-comparison","composition":"Dark mode list layout with vertical dividers, rotated section headers, and framed monoline icons.","zones":["Dark mode list layout with vertical dividers, rotated section headers, and framed monoline icons."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["icon-list","vertical-divider","highlight-block"],"avoid":["Visual portfolios","Complex data structures","copying source assets, source text, or an exact source arrangement"],"best_for":["Services list","Key features","Agenda items"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Split asymmetric layout with black text zone on the left and a framed inset image on the right, punctuated by a vertical color block.","zones":["Split asymmetric layout with black text zone on the left and a framed inset image on the right, punctuated by a vertical color block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["split-layout","image-right","vertical-accent"],"avoid":["Data-heavy slides","Multiple discrete points","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction","Historical overview","Mission statement"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-image-right","purpose":"Inset structural photo","bbox":[0.56,0.05,0.34,0.9],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Complex collage of interlocking text blocks, L-shaped color fields, and multiple overlapping image crops.","zones":["Complex collage of interlocking text blocks, L-shaped color fields, and multiple overlapping image crops."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["collage","multi-image","asymmetrical-overlap"],"avoid":["Sequential reading","List formats","copying source assets, source text, or an exact source arrangement"],"best_for":["About us collage","Dynamic section break","Visual storytelling"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"collage-top-right","purpose":"Atmospheric accent photo","bbox":[0.5,0,0.5,0.4],"priority":2},{"id":"collage-bottom-center","purpose":"Primary subject photo","bbox":[0.32,0.38,0.45,0.62],"priority":1},{"id":"collage-bottom-right","purpose":"Textured background photo","bbox":[0.55,0.6,0.45,0.4],"priority":3}]}]
- quote: {"id":"quote-primary","composition":"Dual-column layout emphasizing contrasting geometric shapes, hazard stripes, and central vertical typography spanning a gap.","zones":["Dual-column layout emphasizing contrasting geometric shapes, hazard stripes, and central vertical typography spanning a gap."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["geometric-blocks","hazard-stripes","split-column"],"avoid":["Long textual reports","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboard presentation","Core value statement","Highlighted quote"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"moodboard-image","purpose":"Feature image with architectural or geometric elements","bbox":[0.55,0.15,0.35,0.7],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Symmetrical, perspective-driven full-bleed background featuring massive central glitched text and a central barcode anchor.","zones":["Symmetrical, perspective-driven full-bleed background featuring massive central glitched text and a central barcode anchor."],"content_capacity":{"density":"very low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Horizontally sliced/glitched ultra-bold typography","Asymmetrical neon color blocking (red, blue, yellow) against solid black","Extensive use of rotated/vertical typography anchored to layout edges"],"optional_variants":["closing","symmetrical-perspective","glitch-finale"],"avoid":["Contact info lists","Summary bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Thank you page","Final call to action"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Background with central perspective or leading lines","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be high-contrast, ideally with low-key lighting and neon highlights.
- Use inset rectangular crops that interact with adjacent color blocks rather than floating freely.
- Full-bleed backgrounds should be darkened to ensure overlapping white text remains legible.

【图标与装饰】
- Icons are minimal, monoline, and strictly geometric.
- Icons are framed within thin, brightly colored square borders.
- Placed within dedicated solid-color rectangular zones.

【数据页构图】
- Split asymmetric layout with black text zone on the left and a framed inset image on the right, punctuated by a vertical color block.

【图表风格】
- No charts are present, but if added, they should utilize harsh right angles, no curves, and strictly use the neon red/blue/yellow palette against a black base.
- Gridlines should be minimal or styled as hazard stripes.

【章节页构图】
- Complex collage of interlocking text blocks, L-shaped color fields, and multiple overlapping image crops.

【收尾页构图】
- Symmetrical, perspective-driven full-bleed background featuring massive central glitched text and a central barcode anchor.

【禁止】
- Drop shadows, glows, or any soft gradients.
- White or light-colored background bases.
- Rounded corners on images or shapes.
- Centered, symmetrical, or traditional corporate layouts.
- Serif fonts or delicate/thin typography for headings.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Music festival pitches or DJ portfolios.、Streetwear or urban fashion brand decks.、Cybersecurity, gaming, or tech startup presentations.、Creative agency moodboards.。
