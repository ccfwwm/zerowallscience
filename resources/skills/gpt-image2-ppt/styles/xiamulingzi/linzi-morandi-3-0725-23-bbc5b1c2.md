# 23 · 3.07更新高级色25 / linzi-morandi-3-0725-23-bbc5b1c2

## 风格ID
linzi-morandi-3-0725-23-bbc5b1c2

## 风格名称
23 · 3.07更新高级色25 / linzi-morandi-3-0725-23-bbc5b1c2

## 风格描述
A soft, Morandi-toned presentation featuring organic blob framing, pastel pinks and grays, and circular content nodes.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background (#F8EFE4) universally applied; pastel pink (#F7B4A9) and muted gray (#C4C7C8) serve as primary container and accent colors; gold/brown (#B58B35) reserved for primary headings.
- fonts: Clean sans-serif typography; medium weight for headings to maintain legibility against light backgrounds, lighter weights for secondary text.
- spacing: Generous outer margins pushed inward by the corner blobs; elements are heavily centralized with airy padding.
- shape_language: Contrast between fluid/organic background framing and rigid circular foreground containers.
- texture: Flat, matte color fills with no gradients or drop shadows; clean vector lines.
- grid: Predominantly single-column centered layouts, occasionally breaking into modular 2, 3, or 4-column horizontal rows.
- motion_or_depth: Completely flat design; overlapping shapes establish a simple 2D hierarchy without utilizing shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「23 · 3.07更新高级色25 / linzi-morandi-3-0725-23-bbc5b1c2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A soft, Morandi-toned presentation featuring organic blob framing, pastel pinks and grays, and circular content nodes.
- 推荐配色：#F8EFE4、#F7B4A9、#C4C7C8、#B58B35、#FFFFFF

【不可丢失的风格锚点】
- Organic, fluid shapes (blobs) at the slide corners acting as constant framing
- Thin, sweeping intersecting contour lines connecting corner elements
- Strict circular containers for icons, images, and primary data nodes
- Muted pastel color blocking

【字体】
- Center alignment is the default for titles, subtitles, and body text in single-column layouts
- Primary headings utilize the gold/brown color for contrast against the cream background
- Body text inside colored shapes uses white, though this frequently violates contrast rules on lighter pastels

【封面页构图】
- Centered title block anchored by organic corner blobs and thin contour lines

【内容页构图】
- Three-node horizontal circular layout with a central image and flanking text circles

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title block anchored by organic corner blobs and thin contour lines","zones":["Centered title block anchored by organic corner blobs and thin contour lines"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["centered","organic-frame","minimal"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Main deck entry"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central large circular node housing a numeral, with centered text below","zones":["Central large circular node housing a numeral, with centered text below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["section-break","circular-node","centered"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Agenda transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three-node horizontal circular layout with a central image and flanking text circles","zones":["Three-node horizontal circular layout with a central image and flanking text circles"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["circular-layout","three-nodes","symmetrical"],"avoid":["Long paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Process comparisons","Core value highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"central-image","purpose":"Visual representation of the core concept","bbox":[0.35,0.25,0.3,0.53],"priority":1}]},{"id":"content-comparison","composition":"Split layout with left vertical image and right stacked text/icon lists","zones":["Split layout with left vertical image and right stacked text/icon lists"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["split-layout","horizontal-list","image-left"],"avoid":["Full-width imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature overviews","Step-by-step logic"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-column-image","purpose":"Contextual background or product photo","bbox":[0.08,0.17,0.27,0.65],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Central large circular node housing a numeral, with centered text below","zones":["Central large circular node housing a numeral, with centered text below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["section-break","circular-node","centered"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Agenda transitions"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-node horizontal circular layout with a central image and flanking text circles","zones":["Three-node horizontal circular layout with a central image and flanking text circles"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["circular-layout","three-nodes","symmetrical"],"avoid":["Long paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Process comparisons","Core value highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"central-image","purpose":"Visual representation of the core concept","bbox":[0.35,0.25,0.3,0.53],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered text layout anchored by organic corner blobs, identical to cover","zones":["Centered text layout anchored by organic corner blobs, identical to cover"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, fluid shapes (blobs) at the slide corners acting as constant framing","Thin, sweeping intersecting contour lines connecting corner elements","Strict circular containers for icons, images, and primary data nodes"],"optional_variants":["centered","organic-frame","bookend"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are masked into perfect circles or sharp-edged horizontal rectangles
- No borders, strokes, or drop shadows are applied to image containers

【图标与装饰】
- Solid, flat white icons housed within colored circular badges
- Icons often overlap or sit directly on layout separator lines

【数据页构图】
- Central large circular node housing a numeral, with centered text below

【图表风格】
- No traditional data charts present; numerical data is presented as oversized typographic percentages within colored blocks

【章节页构图】
- Central large circular node housing a numeral, with centered text below

【收尾页构图】
- Centered text layout anchored by organic corner blobs, identical to cover

【禁止】
- Avoid placing thin white text inside light pastel gray or pink containers due to severe legibility loss
- Do not use sharp rectangular framing for background elements; keep backgrounds organic
- Avoid heavily saturated colors that break the muted Morandi palette
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios、Interior design proposals、Soft-skills training modules、Academic reflections or personal defenses。
