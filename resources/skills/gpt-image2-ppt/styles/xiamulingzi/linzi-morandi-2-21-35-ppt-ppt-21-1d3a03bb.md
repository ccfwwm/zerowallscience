# 莫兰迪风格PPT (21) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-21-1d3a03bb

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-21-1d3a03bb

## 风格名称
莫兰迪风格PPT (21) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-21-1d3a03bb

## 风格描述
An elegant, editorial-style presentation utilizing a Morandi earth-tone palette, asymmetrical color blocking, and artistic overlapping typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Beige/light grey serves as the foundational canvas, with dark brown, olive, and rust acting as high-contrast structural blocks and typography.
- fonts: High-contrast elegant Serif for primary headings and oversized numbers; clean, legible Sans-serif for body copy and UI elements.
- spacing: Ample whitespace (beigespace) contrasted with tight overlapping clusters of text and imagery. Margins are wide and editorial.
- shape_language: Strictly orthogonal rectangles and squares, utilizing partial overlaps to create depth.
- texture: Flat vector geometry combined with semi-transparent tinted overlays on photography.
- grid: Complex asymmetrical 4-column or 6-column editorial grid, encouraging elements to break structural lines.
- motion_or_depth: Depth is achieved purely through 2.5D layering (text over image, image over color block) without the use of drop shadows, keeping it flat and modern.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (21) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-21-1d3a03bb」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style presentation utilizing a Morandi earth-tone palette, asymmetrical color blocking, and artistic overlapping typography.
- 推荐配色：#E6E7DD、#533422、#404A2A、#C87834、#AF5232

【不可丢失的风格锚点】
- Asymmetrical geometric color blocking
- 90-degree rotated uppercase typographic accents
- Giant overlay text breaking image boundaries
- Muted, earthy Morandi color palette
- Framed and partial-bleed image treatments

【字体】
- Use elegant serifs for main titles, often tracking-spaced.
- Employ rotated vertical text as a structural divider or artistic anchor on edges.
- Use dramatically oversized serif numbers/words overlapping photos for visual impact.
- Keep paragraph text in a small, highly legible sans-serif with generous line height.

【封面页构图】
- Full-bleed background image with a centered, dark semi-transparent rectangular overlay housing high-contrast typography.

【内容页构图】
- Complex layering featuring background color blocks, a subtle vector graphic, and a centrally framed image with a thick border, flanked by text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with a centered, dark semi-transparent rectangular overlay housing high-contrast typography.","zones":["Full-bleed background image with a centered, dark semi-transparent rectangular overlay housing high-contrast typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["hero","centered","overlay"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_bg","purpose":"Full bleed background texture or mood image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical split background with an overlapping central image and giant foreground typography spanning across both image and background.","zones":["Asymmetrical split background with an overlapping central image and giant foreground typography spanning across both image and background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["split-background","overlap","bold-typography"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key messaging"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right_feature","purpose":"Prominent editorial image","bbox":[0.42,0.29,0.52,0.61],"priority":1}]}
- content: [{"id":"content-content","composition":"Complex layering featuring background color blocks, a subtle vector graphic, and a centrally framed image with a thick border, flanked by text.","zones":["Complex layering featuring background color blocks, a subtle vector graphic, and a centrally framed image with a thick border, flanked by text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["framed-image","layered-blocks","editorial"],"avoid":["Full-screen charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Portfolio highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center_framed","purpose":"Focal square or slightly rectangular image","bbox":[0.45,0.19,0.38,0.64],"priority":1}]},{"id":"content-comparison","composition":"Horizontal split with solid color top and image bottom, anchored by a prominent 90-degree rotated text element on the far left edge.","zones":["Horizontal split with solid color top and image bottom, anchored by a prominent 90-degree rotated text element on the far left edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["horizontal-split","rotated-text","edge-anchored"],"avoid":["Complex data","Multiple bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Inspirational quotes","Bold statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"bottom_panorama","purpose":"Wide atmospheric bottom image","bbox":[0,0.46,1,0.54],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Large right-aligned background image partially obscured by large vertical rotated text, with data visualization (progress bars) and text on the solid-colored left side.","zones":["Large right-aligned background image partially obscured by large vertical rotated text, with data visualization (progress bars) and text on the solid-colored left side."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["progress-bars","vertical-text","image-anchor"],"avoid":["Dense tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Profile pages","Key metrics"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"right_background","purpose":"Large secondary background image","bbox":[0.23,0.08,0.72,0.84],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical split background with an overlapping central image and giant foreground typography spanning across both image and background.","zones":["Asymmetrical split background with an overlapping central image and giant foreground typography spanning across both image and background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["split-background","overlap","bold-typography"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key messaging"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right_feature","purpose":"Prominent editorial image","bbox":[0.42,0.29,0.52,0.61],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Horizontal split with solid color top and image bottom, anchored by a prominent 90-degree rotated text element on the far left edge.","zones":["Horizontal split with solid color top and image bottom, anchored by a prominent 90-degree rotated text element on the far left edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["horizontal-split","rotated-text","edge-anchored"],"avoid":["Complex data","Multiple bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Inspirational quotes","Bold statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"bottom_panorama","purpose":"Wide atmospheric bottom image","bbox":[0,0.46,1,0.54],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Bookend cover style: Full-bleed background image, large semi-transparent central overlay block, and centered serif typography.","zones":["Bookend cover style: Full-bleed background image, large semi-transparent central overlay block, and centered serif typography."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical geometric color blocking","90-degree rotated uppercase typographic accents","Giant overlay text breaking image boundaries"],"optional_variants":["closing","bookend","overlay"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_bg","purpose":"Full bleed closing mood image","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Apply dark, semi-transparent color washes for cover backgrounds.
- Use images that break out of their grid alignments, overlapping adjacent color blocks.
- Incorporate thick white borders for 'polaroid' style focal images.
- Select moody, low-contrast photography that complements the earthy palette.

【图标与装饰】
- Avoid standard vector icons; rely on typographic accents and subtle botanical silhouettes for decoration.
- Use minimalist geometric lines (e.g., thin vertical dividers) instead of traditional bullets or icons.

【数据页构图】
- Large right-aligned background image partially obscured by large vertical rotated text, with data visualization (progress bars) and text on the solid-colored left side.

【图表风格】
- Utilize minimalist radar/spider charts with flat, semi-transparent filled polygons.
- Remove heavy axes or gridlines, using delicate, thin strokes for structure.
- Employ flat, pill-shaped horizontal progress bars for simple percentage metrics.

【章节页构图】
- Asymmetrical split background with an overlapping central image and giant foreground typography spanning across both image and background.

【收尾页构图】
- Bookend cover style: Full-bleed background image, large semi-transparent central overlay block, and centered serif typography.

【禁止】
- Avoid bright, primary colors; stick to muted earth tones.
- Do not use heavy drop shadows or 3D effects on images or text.
- Avoid symmetrical, standard corporate layouts; maintain the asymmetrical editorial feel.
- Do not center-align body text; keep paragraphs crisp and left-aligned.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lookbook presentations、Creative agency portfolios、High-end lifestyle brand pitches、Editorial magazine-style reports。
