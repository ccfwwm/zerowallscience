# 优雅线条（62）---木七设计 · ppt模板 / linzi-morandi-ppt-62-201cccdd

## 风格ID
linzi-morandi-ppt-62-201cccdd

## 风格名称
优雅线条（62）---木七设计 · ppt模板 / linzi-morandi-ppt-62-201cccdd

## 风格描述
An elegant, minimalist Morandi-style presentation featuring abstract organic background shapes, thin line art, and balanced symmetric typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Terracotta base for section backgrounds, pure white for content backgrounds and contrast elements, dark taupe for text on light backgrounds.
- fonts: High-contrast serif for display titles and numbers, elegant readable sans-serif or transitional serif for body copy.
- spacing: Generous center-weighted spacing on covers; structured, evenly distributed multi-column grids with ample horizontal padding on content slides.
- shape_language: Contrast between fluid organic background elements and structured geometric foregrounds (rounded rectangles, circular nodes, sharp chevrons).
- texture: Flat, matte finish with completely solid colors, minimal use of shadows except for subtle glows around images.
- grid: Symmetrical horizontal banding and centered axes for titles, switching to strict 3-column and 4-column block layouts for data.
- motion_or_depth: Primarily flat graphic design. Depth is faintly suggested by overlapping abstract blobs, wavy lines, and floating circular nodes that bridge background and foreground elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（62）---木七设计 · ppt模板 / linzi-morandi-ppt-62-201cccdd」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist Morandi-style presentation featuring abstract organic background shapes, thin line art, and balanced symmetric typography.
- 推荐配色：#CD9B8E、#E2BCAE、#FFFFFF、#7A7371、#B07E71

【不可丢失的风格锚点】
- Muted terracotta/dusty rose monochromatic palette
- Amorphous organic background blobs
- Flowing, intersecting thin white bezier curves
- Centered, high-contrast serif typography on dividers
- Use of pill-shaped badges and circular numeric nodes

【字体】
- Use large, all-caps serif typography for main cover/closing titles to evoke editorial elegance.
- Maintain strict center alignment for all cover and section break slides.
- Use a contrasting dark grey/taupe color for body text when placed on pure white backgrounds for readability.
- Pair elegant serif headers with simpler, legible body fonts to maintain hierarchy without clutter.

【封面页构图】
- Centered typography over solid background flanked by corner abstract blobs and wavy lines

【内容页构图】
- Four-column grid of vertical rounded rectangles on a white background with overlapping circular nodes at the bottom edge

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography over solid background flanked by corner abstract blobs and wavy lines","zones":["Centered typography over solid background flanked by corner abstract blobs and wavy lines"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["centered","abstract-bg","minimal"],"avoid":["Bullet points","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Welcome message"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered section title with pill-shaped numeric badge below, framed by organic corner blobs","zones":["Centered section title with pill-shaped numeric badge below, framed by organic corner blobs"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["divider","pill-badge","symmetrical"],"avoid":["Heavy text","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda markers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four-column grid of vertical rounded rectangles on a white background with overlapping circular nodes at the bottom edge","zones":["Four-column grid of vertical rounded rectangles on a white background with overlapping circular nodes at the bottom edge"],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["4-column","cards","icon-grid"],"avoid":["Long sequential timelines","Large image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Core values","Service pillars"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Horizontal timeline using connected chevron bands with alternating vertical nodes and text blocks","zones":["Horizontal timeline using connected chevron bands with alternating vertical nodes and text blocks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["timeline","chevron","alternating"],"avoid":["Unrelated items","Deep paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","Roadmaps","Historical timelines"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Centered section title with pill-shaped numeric badge below, framed by organic corner blobs","zones":["Centered section title with pill-shaped numeric badge below, framed by organic corner blobs"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["divider","pill-badge","symmetrical"],"avoid":["Heavy text","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda markers"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Four-column grid of vertical rounded rectangles on a white background with overlapping circular nodes at the bottom edge","zones":["Four-column grid of vertical rounded rectangles on a white background with overlapping circular nodes at the bottom edge"],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["4-column","cards","icon-grid"],"avoid":["Long sequential timelines","Large image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Core values","Service pillars"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered typography over solid background flanked by corner abstract blobs and wavy lines","zones":["Centered typography over solid background flanked by corner abstract blobs and wavy lines"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted terracotta/dusty rose monochromatic palette","Amorphous organic background blobs","Flowing, intersecting thin white bezier curves"],"optional_variants":["bookend","centered","minimal"],"avoid":["New information","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Crop images into strict circles.
- Apply subtle white strokes or soft glowing drop shadows to separate images from dark or colored background bands.
- Maintain identical sizing and horizontal alignment for image galleries.

【图标与装饰】
- Use flat, minimalist white icons (both solid and outline variants) centered within layout blocks.
- Scale icons uniformly to act as visual anchors above text blocks.

【数据页构图】
- Centered section title with pill-shaped numeric badge below, framed by organic corner blobs

【图表风格】
- Represent timelines using connected chevrons or continuous zigzag arrows.
- Use circular numbered nodes overlapping structural shapes to denote sequence.
- Alternate text placement above and below timeline axes to maximize space.

【章节页构图】
- Centered section title with pill-shaped numeric badge below, framed by organic corner blobs

【收尾页构图】
- Centered typography over solid background flanked by corner abstract blobs and wavy lines

【禁止】
- Avoid harsh primary colors or high-saturation neon tones; strictly maintain the muted aesthetic.
- Do not use heavy drop shadows on text or harsh rectangular image borders.
- Avoid left-aligning major section titles; maintain the established centered elegance.
- Do not clutter background zones; keep organic shapes to corners and perimeters.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Event planning and wedding proposals、Fashion or lifestyle brand decks、Elegant portfolio presentations、Minimalist creative agency pitches。
