# 2004 · FG11【朋克酷风】 / linzi-punk-fg11-2004-be327c8b

## 风格ID
linzi-punk-fg11-2004-be327c8b

## 风格名称
2004 · FG11【朋克酷风】 / linzi-punk-fg11-2004-be327c8b

## 风格描述
A brutalist, cyberpunk-inspired presentation template featuring extreme typography scale contrast, aggressive layering, dark backgrounds, and neon-lit aesthetics.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Pure black as the infinite canvas. Crisp white for primary typography. Punchy red and neon yellow for stark, localized accents.
- fonts: Bold, brutalist grotesque sans-serif for display headlines. Clean, highly legible sans-serif for body copy. (Fallback: Helvetica, Arial).
- spacing: Intentional typographic tension. Tight leading on massive headers, wide tracking on small uppercase labels. Generous negative space between major asymmetric clusters.
- shape_language: Harsh rectangles, thin crisp divider lines, and solid geometric squares acting as anchors.
- texture: Flat, void-like black contrasted heavily with the granular, highly saturated texture of neon/gel-lit photography.
- grid: Broken, fragmented, and asymmetrical. Elements intentionally disregard alignment to create an edgy, editorial look.
- motion_or_depth: High depth achieved via aggressive typographic layering—text overlapping images, images overlapping text, and transparent stroke-text sitting behind both.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「2004 · FG11【朋克酷风】 / linzi-punk-fg11-2004-be327c8b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A brutalist, cyberpunk-inspired presentation template featuring extreme typography scale contrast, aggressive layering, dark backgrounds, and neon-lit aesthetics.
- 推荐配色：#000000、#FFFFFF、#FF0000、#FFC000

【不可丢失的风格锚点】
- Persistent vertical text navigation/borders along edges
- Oversized, broken typography aggressively overlapping imagery
- Hollow stroke-only text acting as background texture
- High-contrast solid geometric accent blocks (red, white)

【字体】
- Use extreme scale contrast: massive, screen-filling headers against tiny, rigidly columned body text.
- Force word breaks mid-word in large titles to create brutalist typographic blocks.
- Incorporate 90-degree rotated text elements to frame the slide or act as persistent navigation.
- Use hollow, outlined text for atmospheric background branding without adding weight.

【封面页构图】
- Dark atmospheric background with repeating outline text, anchored by a stark, solid-colored title block on the lower left.

【内容页构图】
- Left-heavy square image overlapping vertical text, accompanied by a rigid vertical menu of icons on the right edge.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Dark atmospheric background with repeating outline text, anchored by a stark, solid-colored title block on the lower left.","zones":["Dark atmospheric background with repeating outline text, anchored by a stark, solid-colored title block on the lower left."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["hero-image","solid-block-title","outline-texture"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","High-impact openings"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"background-hero","purpose":"Moody, dark background image to set the tone","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical split with two contrasting image blocks and massive typography breaking across the negative space.","zones":["Asymmetrical split with two contrasting image blocks and massive typography breaking across the negative space."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["diagonal-tension","broken-typography","dual-image"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Mood boards"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bottom-left-img","purpose":"Landscape or architectural texture","bbox":[0.05,0.48,0.45,0.38],"priority":2},{"id":"top-right-img","purpose":"Portrait or human subject","bbox":[0.5,0.0,0.33,0.69],"priority":1}]}
- content: [{"id":"content-content","composition":"Left-heavy square image overlapping vertical text, accompanied by a rigid vertical menu of icons on the right edge.","zones":["Left-heavy square image overlapping vertical text, accompanied by a rigid vertical menu of icons on the right edge."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["icon-menu","image-overlap","text-columns"],"avoid":["Full-screen galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Service breakdowns"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-square-img","purpose":"Strong focal portrait or object","bbox":[0.08,0.05,0.42,0.73],"priority":1}]},{"id":"content-comparison","composition":"Staggered dual portrait images with a stark solid geometric block anchoring the bottom text.","zones":["Staggered dual portrait images with a stark solid geometric block anchoring the bottom text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["staggered-images","geometric-anchor","dual-portrait"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product comparisons"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"left-portrait","purpose":"Secondary subject or texture","bbox":[0.09,0.18,0.28,0.82],"priority":2},{"id":"center-portrait","purpose":"Primary subject","bbox":[0.39,0.12,0.33,0.52],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Asymmetrical split with two contrasting image blocks and massive typography breaking across the negative space.","zones":["Asymmetrical split with two contrasting image blocks and massive typography breaking across the negative space."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["diagonal-tension","broken-typography","dual-image"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Mood boards"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bottom-left-img","purpose":"Landscape or architectural texture","bbox":[0.05,0.48,0.45,0.38],"priority":2},{"id":"top-right-img","purpose":"Portrait or human subject","bbox":[0.5,0.0,0.33,0.69],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Full-bleed dark image overlayed with striking, colored display typography in the center, framed by vertical text.","zones":["Full-bleed dark image overlayed with striking, colored display typography in the center, framed by vertical text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["full-bleed","color-accent-text","vertical-framing"],"avoid":["Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Core messages","Quotations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"full-background","purpose":"Dark, moody focal image","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Full-bleed dark image overlayed with striking, colored display typography in the center, framed by vertical text.","zones":["Full-bleed dark image overlayed with striking, colored display typography in the center, framed by vertical text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["full-bleed","color-accent-text","vertical-framing"],"avoid":["Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Core messages","Quotations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"full-background","purpose":"Dark, moody focal image","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Pure black canvas with a dense, central typographic cluster built from rotated and interlocking text.","zones":["Pure black canvas with a dense, central typographic cluster built from rotated and interlocking text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Persistent vertical text navigation/borders along edges","Oversized, broken typography aggressively overlapping imagery","Hollow stroke-only text acting as background texture"],"optional_variants":["text-only","typographic-cluster","stark-minimalism"],"avoid":["Information delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Dramatic pauses","Section dividers"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Source images should feature high-contrast, moody lighting, preferably with neon color gels (magenta, cyan, red).
- Mix full-bleed background images with strictly cropped, floating rectangular image blocks.
- Never use soft fades or drop shadows on images; edges must be sharp.

【图标与装饰】
- Minimalist, flat white icons.
- Often placed inside rigid, thin-line boxes or connected via thin-line network nodes.

【数据页构图】
- Asymmetrical split with two contrasting image blocks and massive typography breaking across the negative space.

【图表风格】
- Data visualization is typographic. Treat numbers as massive display elements rather than using traditional bar/pie charts.

【章节页构图】
- Asymmetrical split with two contrasting image blocks and massive typography breaking across the negative space.

【收尾页构图】
- Pure black canvas with a dense, central typographic cluster built from rotated and interlocking text.

【禁止】
- Avoid light/white backgrounds; they destroy the dark-mode aesthetic.
- Avoid soft curves, rounded corners, drop shadows, or friendly serif fonts.
- Do not restrict text to empty spaces; it must interact with or overlap other elements.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Music festival or event pitches、Streetwear brand decks、Edgy creative agency credentials。
