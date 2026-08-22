# 1 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-1-f469dfff

## 风格ID
linzi-morandi-2-21-ppt-ppt-1-f469dfff

## 风格名称
1 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-1-f469dfff

## 风格描述
Minimalist editorial presentation template featuring oversized serif typography, asymmetrical layouts, exposed grid lines, and elegant color blocking.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white cream base for light mode, dark olive for dark mode, with ochre yellow as a primary accent block.
- fonts: High-contrast elegant serif for major headings; clean, geometric sans-serif for body copy and navigational elements.
- spacing: Generous macro whitespace with tight micro-spacing within text clusters; elements often anchor to extreme edges.
- shape_language: Primarily sharp rectangles with occasional large geometric curves or rounded corners for contrast.
- texture: Flat, matte color blocks paired with high-quality photographic textures.
- grid: Distinctive visible grid usage; asymmetric columns broken by horizontal divider lines.
- motion_or_depth: Strictly flat, achieving depth purely through overlapping layers (images over text, or images straddling color boundaries).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「1 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-1-f469dfff」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist editorial presentation template featuring oversized serif typography, asymmetrical layouts, exposed grid lines, and elegant color blocking.
- 推荐配色：#F2F0E6、#333333、#D59D33、#6E8568、#FFFFFF

【不可丢失的风格锚点】
- Oversized, high-contrast serif display typography
- Exposed, ultra-thin horizontal and vertical structural lines
- Widely-tracked, small-caps sans-serif metadata text
- Images overlapping solid color blocks or large text elements
- Asymmetrical composition balancing heavy text with ample whitespace

【字体】
- Display headers: Massive scale, serif, tightly leaded, often crossing into image boundaries.
- Meta navigation: Very small, sans-serif, widely tracked (uppercase), anchored to extreme top/bottom edges.
- Body copy: Small, muted sans-serif, left-aligned, set in narrow columns.

【封面页构图】
- Massive right-aligned geometric graphic/mask paired with left-aligned typographic clusters and a horizontal dividing line.

【内容页构图】
- Central square image flanked by diagonal typographic anchors and bisected by horizontal grid lines.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Massive right-aligned geometric graphic/mask paired with left-aligned typographic clusters and a horizontal dividing line.","zones":["Massive right-aligned geometric graphic/mask paired with left-aligned typographic clusters and a horizontal dividing line."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized, high-contrast serif display typography","Exposed, ultra-thin horizontal and vertical structural lines","Widely-tracked, small-caps sans-serif metadata text"],"optional_variants":["hero-mask","editorial-cover","asymmetric"],"avoid":["Data-heavy reporting","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Major section title slides"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-mask","purpose":"Hero image visible through a large geometric mask","bbox":[0.55,0.15,0.4,0.7],"priority":1}]}
- section: {"id":"section-primary","composition":"Oversized left-aligned serif text dominating the canvas, paired with a right-aligned split image/color block module.","zones":["Oversized left-aligned serif text dominating the canvas, paired with a right-aligned split image/color block module."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized, high-contrast serif display typography","Exposed, ultra-thin horizontal and vertical structural lines","Widely-tracked, small-caps sans-serif metadata text"],"optional_variants":["oversized-type","color-block","high-impact"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Bold statements","Section transitions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"side-image","purpose":"Supporting visual paired with color block","bbox":[0.6,0.2,0.2,0.45],"priority":1}]}
- content: [{"id":"content-content","composition":"Central square image flanked by diagonal typographic anchors and bisected by horizontal grid lines.","zones":["Central square image flanked by diagonal typographic anchors and bisected by horizontal grid lines."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized, high-contrast serif display typography","Exposed, ultra-thin horizontal and vertical structural lines","Widely-tracked, small-caps sans-serif metadata text"],"optional_variants":["center-image","diagonal-balance","grid-lines"],"avoid":["Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction or summary slides","Highlighting a single concept with supporting text"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-focus","purpose":"Primary visual anchor","bbox":[0.3,0.2,0.25,0.45],"priority":1}]},{"id":"content-comparison","composition":"Dark solid background featuring a central image layered over massive background typography.","zones":["Dark solid background featuring a central image layered over massive background typography."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized, high-contrast serif display typography","Exposed, ultra-thin horizontal and vertical structural lines","Widely-tracked, small-caps sans-serif metadata text"],"optional_variants":["layered-type","dark-mode","center-focus"],"avoid":["Text-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Mood boards","Atmospheric transition slides","Key visual showcases"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"center-layered","purpose":"Hero image floating above text layer","bbox":[0.15,0.2,0.4,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Two symmetrical, thin-bordered rectangular cards holding equal-weight text blocks.","zones":["Two symmetrical, thin-bordered rectangular cards holding equal-weight text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized, high-contrast serif display typography","Exposed, ultra-thin horizontal and vertical structural lines","Widely-tracked, small-caps sans-serif metadata text"],"optional_variants":["two-column","card-layout","comparison"],"avoid":["Narrative storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Dual concepts","Pricing or service tiers"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central square image flanked by diagonal typographic anchors and bisected by horizontal grid lines.","zones":["Central square image flanked by diagonal typographic anchors and bisected by horizontal grid lines."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized, high-contrast serif display typography","Exposed, ultra-thin horizontal and vertical structural lines","Widely-tracked, small-caps sans-serif metadata text"],"optional_variants":["center-image","diagonal-balance","grid-lines"],"avoid":["Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction or summary slides","Highlighting a single concept with supporting text"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-focus","purpose":"Primary visual anchor","bbox":[0.3,0.2,0.25,0.45],"priority":1}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images often intentionally overlap solid color backgrounds or oversized text.
- Occasional use of geometric masks (e.g., half-circles or giant letterforms) and soft rounded corners.
- Full-bleed vertical splits used for strong section pacing.

【图标与装饰】
- Flat, monochrome, minimal stroke or solid geometric icons.
- Presented in dense, orderly grids bounded by thin structural outlines.

【数据页构图】
- Two symmetrical, thin-bordered rectangular cards holding equal-weight text blocks.

【图表风格】
- No standard charts shown; data/concepts are structured using thin geometric bounding boxes and text columns.

【章节页构图】
- Oversized left-aligned serif text dominating the canvas, paired with a right-aligned split image/color block module.

【收尾页构图】
- Massive right-aligned geometric graphic/mask paired with left-aligned typographic clusters and a horizontal dividing line.

【禁止】
- Avoid centering text or images; maintain strong left-to-right asymmetry.
- Do not use drop shadows or gradients; keep depth purely compositional.
- Avoid standard bulleted lists; use spatial grouping instead.
- Do not crowd the edges; preserve the space around the meta navigation.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion and lookbook presentations、Creative agency portfolios、High-end brand guidelines、Editorial pitch decks。
