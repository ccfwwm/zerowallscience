# 精选科技风14 · 模板 / linzi-tech-14-503ac808

## 风格ID
linzi-tech-14-503ac808

## 风格名称
精选科技风14 · 模板 / linzi-tech-14-503ac808

## 风格描述
Cyberpunk template featuring chromatic aberration text, vivid cyan/pink accents, and contrasting dark textured covers with clean geometric content layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cyan and hot pink serve as dual primary accents, applied to text shadows, shapes, and gradients against purely white or very dark backgrounds.
- fonts: Heavy, bold italic sans-serif for main titles to enhance the speed/glitch effect; standard clean sans-serif for body copy.
- spacing: Centered, dense clustering for title slides; wide, open margins with asymmetrical balancing on content slides.
- shape_language: Sharp horizontal rectangles for glitch accents; large perfect circles and diagonal intersections for content framing.
- texture: Static, distorted wave textures on dark backgrounds simulating CRT or digital interference.
- grid: Mix of center-aligned symmetry (covers) and aggressive diagonal/quadrant splits (content).
- motion_or_depth: Depth is created artificially through chromatic 3D-glasses-style layer offsets and soft drop shadows behind overlapping stark white elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风14 · 模板 / linzi-tech-14-503ac808」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Cyberpunk template featuring chromatic aberration text, vivid cyan/pink accents, and contrasting dark textured covers with clean geometric content layouts.
- 推荐配色：#00E5FF、#FF0055、#FFFFFF、#120D15、#222222

【不可丢失的风格锚点】
- Chromatic aberration text effects (cyan and pink horizontal offsets)
- Horizontal geometric slivers simulating digital glitches
- Heavy, forward-slanting italicized typography
- High contrast between dark distorted texture slides and bright white geometric slides

【字体】
- Use heavy italic sans-serif for all primary display text to convey motion.
- Never use the glitch text effect for body copy; keep body text highly legible in dark gray or white.
- Ensure high contrast: white text on dark textures, black/dark gray text on white backgrounds.

【封面页构图】
- Centered heavy typography over dark distorted texture with horizontal glitch accents

【内容页构图】
- Floating information cards with gradient buttons, dominant right circular framing, and bottom image collage

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered heavy typography over dark distorted texture with horizontal glitch accents","zones":["Centered heavy typography over dark distorted texture with horizontal glitch accents"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Chromatic aberration text effects (cyan and pink horizontal offsets)","Horizontal geometric slivers simulating digital glitches","Heavy, forward-slanting italicized typography"],"optional_variants":["glitch-cover","dark-theme","high-impact"],"avoid":["Complex subtitles","Detailed descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","High-impact opening statements"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered section title over dark wave texture with floating button element","zones":["Centered section title over dark wave texture with floating button element"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Chromatic aberration text effects (cyan and pink horizontal offsets)","Horizontal geometric slivers simulating digital glitches","Heavy, forward-slanting italicized typography"],"optional_variants":["section-break","glitch-transition","centered"],"avoid":["Bulleted lists","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Major topic shifts"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Floating information cards with gradient buttons, dominant right circular framing, and bottom image collage","zones":["Floating information cards with gradient buttons, dominant right circular framing, and bottom image collage"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Chromatic aberration text effects (cyan and pink horizontal offsets)","Horizontal geometric slivers simulating digital glitches","Heavy, forward-slanting italicized typography"],"optional_variants":["contact-cards","circular-frame","bottom-anchored-image"],"avoid":["Dense paragraphs","Full-screen charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Contact information","Team introductions","Multi-location data"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"bottom-collage","purpose":"Horizontal group photo or product lineup","bbox":[0.05,0.55,0.45,0.35],"priority":1}]},{"id":"content-comparison","composition":"Sharp diagonal split layout separating clean text area from full-bleed masked images","zones":["Sharp diagonal split layout separating clean text area from full-bleed masked images"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Chromatic aberration text effects (cyan and pink horizontal offsets)","Horizontal geometric slivers simulating digital glitches","Heavy, forward-slanting italicized typography"],"optional_variants":["diagonal-split","image-mask","dynamic-layout"],"avoid":["Data-heavy reports","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Company history","Visual storytelling"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"diagonal-top","purpose":"Top right diagonal image section","bbox":[0.2,0.0,0.6,0.6],"priority":1},{"id":"diagonal-bottom","purpose":"Bottom center diagonal image section","bbox":[0.4,0.5,0.5,0.5],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned device mockup with background gradient circle, paired with right-aligned large metrics","zones":["Left-aligned device mockup with background gradient circle, paired with right-aligned large metrics"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Chromatic aberration text effects (cyan and pink horizontal offsets)","Horizontal geometric slivers simulating digital glitches","Heavy, forward-slanting italicized typography"],"optional_variants":["device-mockup","metrics","split-layout"],"avoid":["Long form text","Complex tables","copying source assets, source text, or an exact source arrangement"],"best_for":["App showcases","Key performance indicators","Product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"device-screen","purpose":"Screen content for device mockup","bbox":[0.18,0.32,0.15,0.28],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered section title over dark wave texture with floating button element","zones":["Centered section title over dark wave texture with floating button element"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Chromatic aberration text effects (cyan and pink horizontal offsets)","Horizontal geometric slivers simulating digital glitches","Heavy, forward-slanting italicized typography"],"optional_variants":["section-break","glitch-transition","centered"],"avoid":["Bulleted lists","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Major topic shifts"],"evidence_pages":["page-01"],"external_image_slots":[]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Embed images into device mockups or specific geometric frames (diagonals, circles).
- Use grayscale photography to allow the cyan/pink UI elements to pop without visual clashing.
- Apply soft drop shadows to images floating on white backgrounds to separate them from the canvas.

【图标与装饰】
- Use minimal, flat, white line icons housed inside solid colored shapes (cyan or pink).
- Keep icons small and secondary to the typography and layout geometry.

【数据页构图】
- Left-aligned device mockup with background gradient circle, paired with right-aligned large metrics

【图表风格】
- Replace standard charts with large, bold typography and simplified geometric progress indicators (e.g., solid cyan/pink bars).
- Use color-coded quadrants or interlocking shapes (like the 'X' layout) for comparative data.

【章节页构图】
- Centered section title over dark wave texture with floating button element

【收尾页构图】
- Centered heavy typography over dark distorted texture with horizontal glitch accents

【禁止】
- Do not use manual text duplication for visual effects in production templates; it breaks data binding.
- Avoid placing complex text directly over high-contrast areas of the background textures without a dark overlay.
- Do not mix additional vivid colors (like bright green or yellow) into the strict cyan/pink/monochrome palette.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Technology, gaming, or esports pitch decks、Creative agency portfolios、Events or marketing campaigns targeting a modern, digital-native audience、High-energy event title sequences。
