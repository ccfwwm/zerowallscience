# 优雅线条（05）---木七设计 · ppt模板 / linzi-morandi-ppt-05-4021eacf

## 风格ID
linzi-morandi-ppt-05-4021eacf

## 风格名称
优雅线条（05）---木七设计 · ppt模板 / linzi-morandi-ppt-05-4021eacf

## 风格描述
An elegant, contemporary template featuring a muted Morandi earth-tone palette, fluid organic background shapes, and floating content cards.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background base; Burnt Orange, Olive Green, and Mustard Yellow for accents and shapes; Dark Charcoal for primary text.
- fonts: Clean geometric sans-serif for main titles and numbers; classic serif for body copy and subtle subtitles.
- spacing: Generous external padding around the central floating card; symmetrical internal grid padding within the card.
- shape_language: Organic/fluid blobs for backgrounds; strict rectangles for content blocks; circles/dots for decorative markers.
- texture: Flat vector color blocks paired with soft, diffuse drop shadows to create a layered 'paper cutout' or card effect.
- grid: Primarily symmetrical multi-column splits (2, 3, 4) contained within a central bounding box.
- motion_or_depth: Consistent 2.5D depth established by shadowing the white content card against the background pattern.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（05）---木七设计 · ppt模板 / linzi-morandi-ppt-05-4021eacf」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, contemporary template featuring a muted Morandi earth-tone palette, fluid organic background shapes, and floating content cards.
- 推荐配色：#EFEBE5、#C06135、#60623A、#CE9B2B、#111111

【不可丢失的风格锚点】
- Fluid, organic amoeba-like background vectors in earthy tones.
- Elevated white rectangular content cards with subtle drop shadows.
- Symmetrical double-dot accents flanking section titles.
- Contrast between strict geometric content containers and loose organic background framing.

【字体】
- Headings use uppercase geometric sans-serif, often colored in burnt orange inside the content card.
- Body paragraphs use a serif font in dark charcoal, aligned left or centered depending on the column structure.
- Large numerals are used as background or structural elements in sans-serif.

【封面页构图】
- Massive centered title flanked by large organic shapes in the corners.

【内容页构图】
- Symmetrical 2-column layout with top images and bottom text inside a floating card.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Massive centered title flanked by large organic shapes in the corners.","zones":["Massive centered title flanked by large organic shapes in the corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["minimal","bold-typography","organic-frame"],"avoid":["Data presentation","Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Floating white card containing a 2x2 grid of text blocks with faint background icons.","zones":["Floating white card containing a 2x2 grid of text blocks with faint background icons."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["four-columns","floating-card","symmetrical"],"avoid":["Complex charts","Full screen images","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Feature highlights","Team principles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Symmetrical 2-column layout with top images and bottom text inside a floating card.","zones":["Symmetrical 2-column layout with top images and bottom text inside a floating card."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["two-column","image-text-pairing","symmetrical"],"avoid":["Single narrative flows","Data-heavy charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Product comparisons","Case studies","Before/After highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img-left","purpose":"Left column subject","bbox":[0.12,0.24,0.35,0.38],"priority":1},{"id":"img-right","purpose":"Right column subject","bbox":[0.51,0.24,0.35,0.38],"priority":2}]},{"id":"content-comparison","composition":"Three horizontal, overlapping geometric chevron arrows above text blocks.","zones":["Three horizontal, overlapping geometric chevron arrows above text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["three-column","process-flow","chevrons"],"avoid":["Non-linear information","Image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Linear processes","Methodologies","Three-step strategies"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Vertical dashed timeline alternating text and solid square blocks.","zones":["Vertical dashed timeline alternating text and solid square blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["timeline","vertical-flow","alternating"],"avoid":["Dense paragraphs","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Historical milestones","Process steps","Roadmaps"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Floating white card containing a 2x2 grid of text blocks with faint background icons.","zones":["Floating white card containing a 2x2 grid of text blocks with faint background icons."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["four-columns","floating-card","symmetrical"],"avoid":["Complex charts","Full screen images","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Feature highlights","Team principles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Massive centered title flanked by large organic shapes in the corners.","zones":["Massive centered title flanked by large organic shapes in the corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, organic amoeba-like background vectors in earthy tones.","Elevated white rectangular content cards with subtle drop shadows.","Symmetrical double-dot accents flanking section titles."],"optional_variants":["minimal","bold-typography","organic-frame"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are strictly confined to rectangular containers with sharp corners.
- No borders around images; they sit flat within the white card or flush against layout edges in full-bleed scenarios.

【图标与装饰】
- Minimalist linear icons used as faint background watermarks in text grids.
- Solid circles used as timeline nodes and title flanking decor.

【数据页构图】
- Vertical dashed timeline alternating text and solid square blocks.

【图表风格】
- Process flows utilize stylized geometric chevron arrows spanning horizontally.
- Timelines use vertical dashed lines intersecting with alternating square and circle nodes.

【章节页构图】
- Floating white card containing a 2x2 grid of text blocks with faint background icons.

【收尾页构图】
- Massive centered title flanked by large organic shapes in the corners.

【禁止】
- Using bright neon or highly saturated primary colors that break the Morandi palette.
- Removing the drop shadow from the white content card, which destroys the defining depth hierarchy.
- Applying rounded corners to image placeholders (must remain sharp rectangles).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion presentations.、Creative agency portfolios.、Boutique brand proposals.、Lifestyle or wellness product pitch decks.。
