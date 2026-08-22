# 20 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-20-b03ea643

## 风格ID
linzi-morandi-2-21-ppt-ppt-20-b03ea643

## 风格名称
20 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-20-b03ea643

## 风格描述
Editorial lookbook presentation featuring asymmetrical layouts, overlapping sharp rectangles, and deep green accents for a sophisticated, modern aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary dark green for framing and accents, stark white for backgrounds and text on dark fills, light gray for subtle structural backgrounds.
- fonts: Clean, modern neo-grotesque sans-serif. High contrast between thin/regular body copy and medium/bold oversized headings.
- spacing: Generous negative space, intentional staggered offsets, and bleeding edges.
- shape_language: Strictly sharp-edged rectangles and straight lines; zero rounded corners.
- texture: Flat, matte solid colors contrasting with rich photographic textures.
- grid: Complex modular grid allowing for varied column widths, multi-image masonry, and staggered horizontal alignment.
- motion_or_depth: Depth achieved through layered overlapping of solid color blocks, images, and text boxes. Subtle drop shadows reserved strictly for realistic device mockups.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「20 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-20-b03ea643」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial lookbook presentation featuring asymmetrical layouts, overlapping sharp rectangles, and deep green accents for a sophisticated, modern aesthetic.
- 推荐配色：#38574B、#FFFFFF、#F4F4F4

【不可丢失的风格锚点】
- Sharp, orthogonal geometric blocks overlapping images and text
- Asymmetrical, modular grid structures
- High-contrast typographic scale with massive numerals
- Muted, dark green solid color blocks used for grounding and framing

【字体】
- Titles use large sans-serif typography, sometimes breaking grid boundaries.
- Massive numerals act as graphic elements and focal points.
- Rotated (vertical) text is used as structural graphic dividers.
- Occasional deliberate overlapping of large display text behind body paragraphs for a watermark effect.

【封面页构图】
- Full-bleed background image with large, centered white display text.

【内容页构图】
- Masonry-style asymmetrical grid with multiple rectangular image slots and a dedicated upper-right text zone.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with large, centered white display text.","zones":["Full-bleed background image with large, centered white display text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["hero-image","minimal","centered"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-bg","purpose":"Atmospheric full-bleed background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Diagonal/polygonal mask splitting the slide: solid color block with text on one side, and a full-bleed image on the other.","zones":["Diagonal/polygonal mask splitting the slide: solid color block with text on one side, and a full-bleed image on the other."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["angled-split","polygon-mask","large-typography"],"avoid":["Bullet lists","Multiple charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Core values","Section transitions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-polygon-image","purpose":"Thematic background filling the right diagonal segment","bbox":[0.45,0,0.55,1],"priority":1}]}
- content: [{"id":"content-content","composition":"Masonry-style asymmetrical grid with multiple rectangular image slots and a dedicated upper-right text zone.","zones":["Masonry-style asymmetrical grid with multiple rectangular image slots and a dedicated upper-right text zone."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["masonry-grid","gallery","multi-image"],"avoid":["Text-heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Portfolio galleries","Product showcases","Moodboards"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"grid-top-left","purpose":"Gallery item","bbox":[0.05,0.08,0.3,0.26],"priority":2},{"id":"grid-mid-left","purpose":"Gallery item","bbox":[0.05,0.36,0.3,0.26],"priority":3},{"id":"grid-bottom-left","purpose":"Gallery item wide","bbox":[0.05,0.64,0.41,0.26],"priority":4},{"id":"grid-bottom-mid","purpose":"Gallery item square","bbox":[0.48,0.64,0.2,0.26],"priority":5},{"id":"grid-bottom-right","purpose":"Gallery item right","bbox":[0.69,0.64,0.26,0.26],"priority":6}]},{"id":"content-comparison","composition":"Complex multi-column collage featuring offset image squares, floating paragraphs, and a heavy vertical color block with rotated typography.","zones":["Complex multi-column collage featuring offset image squares, floating paragraphs, and a heavy vertical color block with rotated typography."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["vertical-text","collage","layered-frames"],"avoid":["Simple singular messages","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Service breakdowns","Multi-faceted concepts"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"image-left-column","purpose":"Vertical aesthetic shot","bbox":[0,0.47,0.16,0.53],"priority":3},{"id":"image-center-top","purpose":"Small floating detail shot","bbox":[0.44,0,0.13,0.31],"priority":4},{"id":"image-center-mid","purpose":"Medium contextual shot","bbox":[0.21,0,0.2,0.62],"priority":2},{"id":"image-framed-right","purpose":"Framed feature image overlapping the vertical bar","bbox":[0.58,0.38,0.24,0.42],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Opposing quadrant layout with intersecting horizontal blocks, combining large typography, solid fills, and an overlaid semi-transparent data highlight box.","zones":["Opposing quadrant layout with intersecting horizontal blocks, combining large typography, solid fills, and an overlaid semi-transparent data highlight box."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["quadrant","data-highlight","overlay"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Results highlights","Financial summaries"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"top-right-bg","purpose":"Texture or subtle background image for data overlay","bbox":[0.36,0,0.64,0.64],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical split with text blocks inside staggered outlines on the left, and staggered varied-size image blocks on the right.","zones":["Asymmetrical split with text blocks inside staggered outlines on the left, and staggered varied-size image blocks on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["offset-grid","staggered-images","outlined-frame"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","About us","Chapter summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-top-right","purpose":"Primary lifestyle or subject photo","bbox":[0.6,0.18,0.35,0.44],"priority":1},{"id":"image-bottom-mid","purpose":"Secondary contextual photo","bbox":[0.5,0.52,0.16,0.31],"priority":2}]}]
- agenda: {"id":"agenda-primary","composition":"Asymmetrical split with text blocks inside staggered outlines on the left, and staggered varied-size image blocks on the right.","zones":["Asymmetrical split with text blocks inside staggered outlines on the left, and staggered varied-size image blocks on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["offset-grid","staggered-images","outlined-frame"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","About us","Chapter summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-top-right","purpose":"Primary lifestyle or subject photo","bbox":[0.6,0.18,0.35,0.44],"priority":1},{"id":"image-bottom-mid","purpose":"Secondary contextual photo","bbox":[0.5,0.52,0.16,0.31],"priority":2}]}
- quote: {"id":"quote-primary","composition":"Full-bleed background image with a massive bottom-aligned title and a floating text box anchored to the top right.","zones":["Full-bleed background image with a massive bottom-aligned title and a floating text box anchored to the top right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["floating-panel","full-bleed","hero-quote"],"avoid":["Detailed lists","Diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Hero statements","Chapter covers"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"background-showcase","purpose":"Full slide image with space for bottom text","bbox":[0,0,1,1],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-bleed background image with a massive, centered white closing message.","zones":["Full-bleed background image with a massive, centered white closing message."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Sharp, orthogonal geometric blocks overlapping images and text","Asymmetrical, modular grid structures","High-contrast typographic scale with massive numerals"],"optional_variants":["bookend","minimal","hero-image"],"avoid":["Contact detail lists (unless added below title)","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Atmospheric closing background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds with semi-transparent or solid overlays.
- Sharp rectangular crops, often staggered in masonry layouts.
- Images placed within overlapping solid frames or polygons to break standard grid rigidity.

【图标与装饰】
- Minimalist approach; relies heavily on typography and large numerals instead of traditional icons.

【数据页构图】
- Opposing quadrant layout with intersecting horizontal blocks, combining large typography, solid fills, and an overlaid semi-transparent data highlight box.

【图表风格】
- Data emphasized through exaggerated typographic scale (e.g., giant numbers) rather than traditional graphs.

【章节页构图】
- Diagonal/polygonal mask splitting the slide: solid color block with text on one side, and a full-bleed image on the other.

【收尾页构图】
- Full-bleed background image with a massive, centered white closing message.

【禁止】
- No rounded corners on images or shapes.
- No bright, saturated primary colors; stick to muted/earthy tones.
- No drop shadows on text or flat shapes.
- Avoid centered, symmetrical layouts (except for cover/closing).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Architecture/interior design portfolios、Creative agency credentials、High-end lifestyle brand presentations。
