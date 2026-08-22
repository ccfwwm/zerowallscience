# 72 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-72-df3872cb

## 风格ID
linzi-morandi-2-21-ppt-ppt-72-df3872cb

## 风格名称
72 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-72-df3872cb

## 风格描述
An editorial, fashion-forward presentation template featuring deep Morandi colors, stark geometric blocking, and striking rotated typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Earthy, muted tones (forest green, mustard, terracotta, slate blue) used as large background fills, contrasting with stark white or dark charcoal sidebars.
- fonts: Bold, industrial sans-serif for display headers (often heavily tracked and rotated); clean, legible modern sans-serif for body copy.
- spacing: Generous negative space formed by solid color blocks; strict modular grid margins aligning text blocks with image edges.
- shape_language: Purely orthogonal; rectangles and squares only, with sharp corners and no rounded elements.
- texture: Flat, matte color blocks. Depth relies entirely on overlapping rectangular panels and photographic textures.
- grid: Editorial split-screen grids (50/50, 40/60, 30/70) and complex asymmetrical multi-column layouts.
- motion_or_depth: Flat paper-like layers. Overlap is used to create visual interest rather than drop shadows or gradients.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「72 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-72-df3872cb」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial, fashion-forward presentation template featuring deep Morandi colors, stark geometric blocking, and striking rotated typography.
- 推荐配色：#344b42、#c98c47、#a13f2d、#222b34、#b87c54、#9ba1a0、#435564

【不可丢失的风格锚点】
- Sideways/rotated oversized header text on slide edges
- Thick, solid color-blocking creating robust geometric backgrounds
- Asymmetrical overlapping of full-bleed and heavily inset photographs
- Minimalist palette dot clusters used as decorative motifs
- Strict right-angle geometry with small square accents in corners

【字体】
- Titles are frequently rotated -90 or 90 degrees and anchored to the extreme left or right margins.
- Headers use all-caps, heavy font weights, and loose letter spacing.
- Body text is set in medium weight, tightly bounded in rectangular blocks to mirror the layout's geometry.
- High contrast in scale between massive display type and small body copy.

【封面页构图】
- Framed central landscape image with solid color borders and clean centered text below

【内容页构图】
- Split layout with rotated left-edge typography, central body copy, and right full-bleed image

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Framed central landscape image with solid color borders and clean centered text below","zones":["Framed central landscape image with solid color borders and clean centered text below"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["framed-hero","minimal-text","centered"],"avoid":["Complex data","Lengthy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Hero image introduction"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Main cover image","bbox":[0.07,0.1,0.86,0.6],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical masonry-style grid of portrait images with interlocking color blocks","zones":["Asymmetrical masonry-style grid of portrait images with interlocking color blocks"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["collage","masonry","multi-image","asymmetrical"],"avoid":["Text-heavy explanations","Sequential storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Visual styling collections","Product galleries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img-left","purpose":"Large vertical feature","bbox":[0.08,0.0,0.34,0.74],"priority":1},{"id":"img-center","purpose":"Central medium feature","bbox":[0.5,0.19,0.19,0.61],"priority":2},{"id":"img-right-top","purpose":"Top right detail","bbox":[0.71,0.0,0.19,0.38],"priority":3},{"id":"img-right-bottom","purpose":"Bottom right vertical feature","bbox":[0.71,0.4,0.19,0.6],"priority":4}]}
- content: [{"id":"content-content","composition":"Split layout with rotated left-edge typography, central body copy, and right full-bleed image","zones":["Split layout with rotated left-edge typography, central body copy, and right full-bleed image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["split-screen","rotated-text","full-bleed"],"avoid":["Dense lists","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key concepts","Team profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-feature","purpose":"Full height feature image","bbox":[0.63,0.0,0.37,1.0],"priority":1}]},{"id":"content-comparison","composition":"Split layout with a left inset square image and right full-bleed vertical image","zones":["Split layout with a left inset square image and right full-bleed vertical image"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["dual-image","split-background","inset-square"],"avoid":["Text-heavy slides","Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Before/after comparisons","Detail vs wide shots","Visual pacing breaks"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-inset","purpose":"Detail or secondary image","bbox":[0.11,0.23,0.29,0.58],"priority":2},{"id":"right-full","purpose":"Primary vertical image","bbox":[0.51,0.0,0.49,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Asymmetrical masonry-style grid of portrait images with interlocking color blocks","zones":["Asymmetrical masonry-style grid of portrait images with interlocking color blocks"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["collage","masonry","multi-image","asymmetrical"],"avoid":["Text-heavy explanations","Sequential storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Visual styling collections","Product galleries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img-left","purpose":"Large vertical feature","bbox":[0.08,0.0,0.34,0.74],"priority":1},{"id":"img-center","purpose":"Central medium feature","bbox":[0.5,0.19,0.19,0.61],"priority":2},{"id":"img-right-top","purpose":"Top right detail","bbox":[0.71,0.0,0.19,0.38],"priority":3},{"id":"img-right-bottom","purpose":"Bottom right vertical feature","bbox":[0.71,0.4,0.19,0.6],"priority":4}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split layout with rotated left-edge typography, central body copy, and right full-bleed image","zones":["Split layout with rotated left-edge typography, central body copy, and right full-bleed image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["split-screen","rotated-text","full-bleed"],"avoid":["Dense lists","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key concepts","Team profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-feature","purpose":"Full height feature image","bbox":[0.63,0.0,0.37,1.0],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Left aligned full-bleed image with a bold, solid color right panel containing a centered quote","zones":["Left aligned full-bleed image with a bold, solid color right panel containing a centered quote"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Sideways/rotated oversized header text on slide edges","Thick, solid color-blocking creating robust geometric backgrounds","Asymmetrical overlapping of full-bleed and heavily inset photographs"],"optional_variants":["quote","color-block","split-screen"],"avoid":["Standard bulleted lists","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key statements","Brand manifestos"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"quote-author-image","purpose":"Portrait or lifestyle shot","bbox":[0.0,0.0,0.37,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in strict rectangular masks with sharp edges.
- Frequent use of full-bleed edge alignment on at least one or two sides.
- No borders or strokes on images; edge separation relies on underlying solid color blocks.
- Photos often act as heavy visual counterweights to large blocks of solid color.

【图标与装饰】
- Extremely minimal; relies primarily on typography and color shapes.
- Uses oversized quotation marks for testimonials.
- Small geometric shapes (squares, circles) act as subtle bullet points or corner anchors.

【数据页构图】
- Asymmetrical masonry-style grid of portrait images with interlocking color blocks

【图表风格】
- No data charts present. Layout prioritizes photography and text over quantitative data.

【章节页构图】
- Asymmetrical masonry-style grid of portrait images with interlocking color blocks

【收尾页构图】
- Framed central landscape image with solid color borders and clean centered text below

【禁止】
- Do not use rounded corners or organic shapes.
- Avoid gradients or drop shadows; maintain flat, solid layers.
- Avoid center-aligned body text; strictly use left or right alignment aligned to the grid.
- Do not crowd the rotated side-titles with body text.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks and styling portfolios、Lifestyle brand guidelines、Photography or architecture showcases、Editorial magazine-style pitches。
