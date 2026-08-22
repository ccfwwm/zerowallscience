# 4104 · FG11【朋克酷风】 / linzi-punk-fg11-4104-f46db665

## 风格ID
linzi-punk-fg11-4104-f46db665

## 风格名称
4104 · FG11【朋克酷风】 / linzi-punk-fg11-4104-f46db665

## 风格描述
A bold, brutalist-inspired presentation featuring extreme typographic scale, high-contrast monochrome layouts, and asymmetrical image placements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: High-contrast binary system: pitch black versus cool off-white, acting as alternating split backgrounds or solid canvases.
- fonts: Ultra-bold, wide geometric sans-serif for display headings; clean, legible sans-serif for body copy. Extreme contrast in weights.
- spacing: Unconventional pacing: tight clusters of body text mixed with vast negative space, with massive elements intentionally bleeding off edges.
- shape_language: Strictly orthogonal. Sharp rectangles, stark solid color blocking, and predominantly right angles.
- texture: Flat, matte solid color blocks contrasting with moody, high-texture or gritty photography.
- grid: Intentionally broken or overlapping grid system. Elements intersect boundaries, and text frequently crosses image borders.
- motion_or_depth: Flat layering. Depth is created purely through the brutalist overlapping of massive text over images and color blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「4104 · FG11【朋克酷风】 / linzi-punk-fg11-4104-f46db665」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A bold, brutalist-inspired presentation featuring extreme typographic scale, high-contrast monochrome layouts, and asymmetrical image placements.
- 推荐配色：#181818、#F0F2F2、#FFFFFF

【不可丢失的风格锚点】
- Extreme typographic scale with oversized, overlapping background letters.
- Brutalist intersection of large text, stark color blocks, and imagery.
- Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white).
- Asymmetric, off-axis layout structures that intentionally break standard grids.

【字体】
- Use oversized, ultra-bold sans-serif as structural graphic elements or background textures.
- Allow headings to break across multiple lines, overlap with images, or intersect contrasting color fields.
- Keep body copy relatively small and tightly clustered to maximize contrast with massive headings.
- Employ rotated vertical text as striking margin elements.

【封面页构图】
- Oversized repeating typography spanning the full width, intersected centrally by a vertical hero image.

【内容页构图】
- Two stacked wide image slices dominating the left, bordered by crossing text, with a minimalist text column on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Oversized repeating typography spanning the full width, intersected centrally by a vertical hero image.","zones":["Oversized repeating typography spanning the full width, intersected centrally by a vertical hero image."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["brutalist-cover","typographic-texture"],"avoid":["Detailed descriptions","Subtitles requiring high legibility","copying source assets, source text, or an exact source arrangement"],"best_for":["Title introductions","Hero imagery display"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Central focal image","bbox":[0.35,0.1,0.3,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetric split layout featuring a horizontal image slice bisected by ultra-bold text, with a supporting dark text block.","zones":["Asymmetric split layout featuring a horizontal image slice bisected by ultra-bold text, with a supporting dark text block."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["split-layout","intersecting-text"],"avoid":["Data presentation","Long lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Speaker or team member introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"horizontal-slice","purpose":"Atmospheric texture or portrait slice","bbox":[0.45,0.25,0.4,0.4],"priority":1}]}
- content: [{"id":"content-content","composition":"Two stacked wide image slices dominating the left, bordered by crossing text, with a minimalist text column on the right.","zones":["Two stacked wide image slices dominating the left, bordered by crossing text, with a minimalist text column on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["stacked-images","boundary-text"],"avoid":["Text-heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Dual image showcase","Concept comparisons"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-image","purpose":"Primary upper visual","bbox":[0.0,0.0,0.65,0.5],"priority":1},{"id":"bottom-image","purpose":"Secondary lower visual","bbox":[0.0,0.5,0.65,0.5],"priority":2}]},{"id":"content-comparison","composition":"Wide panoramic image header with large overlaid text, supported by a heavy typographic block on the bottom left and minimalist directional arrows.","zones":["Wide panoramic image header with large overlaid text, supported by a heavy typographic block on the bottom left and minimalist directional arrows."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["panoramic-hero","typographic-block"],"avoid":["Complex data points","Financial charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Manifesto statements","Core values","Big ideas"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"panorama","purpose":"Wide hero visual","bbox":[0.1,0.15,0.8,0.4],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"A rigid 3x3 grid layout containing alternating square image tiles, solid dark blocks with text, and negative space, balanced by massive left-aligned typography.","zones":["A rigid 3x3 grid layout containing alternating square image tiles, solid dark blocks with text, and negative space, balanced by massive left-aligned typography."],"content_capacity":{"density":"high","max_items":9},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["square-grid","checkerboard"],"avoid":["Long-form text","Singular hero statements","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member pages","Product galleries","Portfolio thumbnails"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"grid-1","purpose":"Gallery thumbnail","bbox":[0.42,0.05,0.16,0.28],"priority":1},{"id":"grid-2","purpose":"Gallery thumbnail","bbox":[0.78,0.05,0.16,0.28],"priority":2},{"id":"grid-3","purpose":"Gallery thumbnail","bbox":[0.6,0.36,0.16,0.28],"priority":3},{"id":"grid-4","purpose":"Gallery thumbnail","bbox":[0.42,0.67,0.16,0.28],"priority":4},{"id":"grid-5","purpose":"Gallery thumbnail","bbox":[0.78,0.67,0.16,0.28],"priority":5}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Dark background with horizontal rule lines structuring text, a massive overlapping title, and a wide image slice anchoring the bottom right.","zones":["Dark background with horizontal rule lines structuring text, a massive overlapping title, and a wide image slice anchoring the bottom right."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["dark-agenda","horizontal-rules"],"avoid":["Paragraph heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda","Process steps","Timelines"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"bottom-banner","purpose":"Footer visual anchor","bbox":[0.35,0.65,0.6,0.35],"priority":1}]}]
- agenda: {"id":"agenda-primary","composition":"Dark background with horizontal rule lines structuring text, a massive overlapping title, and a wide image slice anchoring the bottom right.","zones":["Dark background with horizontal rule lines structuring text, a massive overlapping title, and a wide image slice anchoring the bottom right."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["dark-agenda","horizontal-rules"],"avoid":["Paragraph heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda","Process steps","Timelines"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"bottom-banner","purpose":"Footer visual anchor","bbox":[0.35,0.65,0.6,0.35],"priority":1}]}
- quote: {"id":"quote-primary","composition":"Minimalist dark slide with a heavily cropped horizontal image slice at the top, followed by extremely large, raw file-name style typography.","zones":["Minimalist dark slide with a heavily cropped horizontal image slice at the top, followed by extremely large, raw file-name style typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["dark-mode","minimalist-slice"],"avoid":["Detailed content","Multi-point arguments","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Dramatic pauses","Bold statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"top-slice","purpose":"Abstract texture or tight detail crop","bbox":[0.25,0.25,0.35,0.15],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Vertical background color split with vertical text on the left, a central framed image crossing the split, and social icons on the right.","zones":["Vertical background color split with vertical text on the left, a central framed image crossing the split, and social icons on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Extreme typographic scale with oversized, overlapping background letters.","Brutalist intersection of large text, stark color blocks, and imagery.","Strict high-contrast monochromatic backgrounds (pitch black vs. cool off-white)."],"optional_variants":["vertical-text","social-contact"],"avoid":["Content-heavy slides","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Contact pages","Social media call-to-actions","Closing statements"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"mockup","purpose":"Central feature or mockup","bbox":[0.08,0.2,0.45,0.6],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use stark, geometric cropping (sharp rectangles, wide panoramic slices, rigid squares).
- Allow images to deliberately intersect with background color splits and large typography.
- Layer images asymmetrically, sometimes pushing them to the extreme edges of the slide.

【图标与装饰】
- Minimalist, sharp geometric icons (e.g., thin stroke arrows, crosses, chevrons).
- Avoid illustrative or rounded icons; rely entirely on functional, sharp wayfinding symbols.

【数据页构图】
- A rigid 3x3 grid layout containing alternating square image tiles, solid dark blocks with text, and negative space, balanced by massive left-aligned typography.

【图表风格】
- No native charts present; adapt the style by using stark black/white solid fills, thick borders, and massive bold numerical callouts instead of traditional axes.

【章节页构图】
- Asymmetric split layout featuring a horizontal image slice bisected by ultra-bold text, with a supporting dark text block.

【收尾页构图】
- Vertical background color split with vertical text on the left, a central framed image crossing the split, and social icons on the right.

【禁止】
- Avoid soft drop shadows, gradients, or glowing effects.
- Do not use rounded corners or organic, fluid shapes (with rare, deliberate exceptions).
- Avoid safe, centered, symmetrical alignments; embrace asymmetry.
- Do not clutter with generic clip art or highly colorful complex charts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios and moodboards.、Fashion, streetwear, or architectural lookbooks.、Avant-garde product launches or bold manifesto decks.。
