# 5-2 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-5-2-d6732955

## 风格ID
linzi-morandi-2-21-ppt-ppt-5-2-d6732955

## 风格名称
5-2 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-5-2-d6732955

## 风格描述
Editorial, magazine-style presentation template featuring bold overlapping typography, dark earthy color blocking, and structural grid-breaking image placements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark brown and olive blocks act as heavy structural backgrounds. White is strictly reserved for high-contrast typography and icon grids. Khaki/beige used sparingly for nodes/accents.
- fonts: Primary titles utilize a high-contrast elegant serif. Body text and rotated edge labels utilize a clean, legible geometric sans-serif.
- spacing: Asymmetrical spacing with tight text groups floating within expansive, color-blocked negative spaces.
- shape_language: Primarily orthogonal with sharp rectangular image masks and solid background blocks. Accentuated by geometric hexagons in data visualizations and fluid wavy strokes.
- texture: Flat, matte color fields contrasting with the rich, realistic textures of photography.
- grid: Deconstructed columnar grid. Elements intentionally break alignment to overlap adjacent zones, creating an editorial feel.
- motion_or_depth: Depth is achieved purely through 2D planar overlaps (text over image, image over background block) and a singular heavy drop-shadow on device mockups.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「5-2 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-5-2-d6732955」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial, magazine-style presentation template featuring bold overlapping typography, dark earthy color blocking, and structural grid-breaking image placements.
- 推荐配色：#44382b、#675c4c、#b59a7a、#ffffff

【不可丢失的风格锚点】
- Massive serif typography overlapping image boundaries
- Vertical, 90-degree rotated text framing the outer edges
- Triple-stroke decorative wavy line motifs in corners
- Stark, asymmetrical split-screen color blocking using earthy tones

【字体】
- Titles should be oversized, serif, and frequently overlap image borders.
- Use rotated (vertical) text along the far left or right slide margins as a framing device.
- Keep body copy small, sans-serif, and tightly grouped to maximize negative space.

【封面页构图】
- Wide central image container anchored by a massive overlapping text block on its lower half, framed by corner strokes and edge text.

【内容页构图】
- Right-aligned image bleeding off top and bottom edges, balanced by a dominant text column on the left and massive vertical text on the right edge.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Wide central image container anchored by a massive overlapping text block on its lower half, framed by corner strokes and edge text.","zones":["Wide central image container anchored by a massive overlapping text block on its lower half, framed by corner strokes and edge text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["hero-image","overlapping-text","editorial-cover"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"Wide feature image","bbox":[0.08,0.18,0.84,0.64],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical two-column split with text groupings on one side and a vertical portrait image floating on the other.","zones":["Asymmetrical two-column split with text groupings on one side and a vertical portrait image floating on the other."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["split-layout","portrait-image","quote"],"avoid":["Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Core value statements","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait","purpose":"Vertical feature image","bbox":[0.5,0.18,0.35,0.64],"priority":1}]}
- content: [{"id":"content-content","composition":"Right-aligned image bleeding off top and bottom edges, balanced by a dominant text column on the left and massive vertical text on the right edge.","zones":["Right-aligned image bleeding off top and bottom edges, balanced by a dominant text column on the left and massive vertical text on the right edge."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["edge-bleed","vertical-split","heavy-typography"],"avoid":["Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Service descriptions","Founder messages"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"right-bleed","purpose":"Full-height vertical image","bbox":[0.55,0.0,0.3,0.71],"priority":1}]},{"id":"content-comparison","composition":"Central full-height portrait image aggressively overlapped by giant serif typography from multiple edges, flanked by dark color blocks.","zones":["Central full-height portrait image aggressively overlapped by giant serif typography from multiple edges, flanked by dark color blocks."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["typography-spill","central-focus","layered-composition"],"avoid":["Detailed analytical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Brand manifestos","Product unveils"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"center-vertical","purpose":"Central hero portrait","bbox":[0.38,0.0,0.35,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Diagonal continuous line populated with hexagonal nodes, connecting to text blocks placed in an alternating sequence above and below the line.","zones":["Diagonal continuous line populated with hexagonal nodes, connecting to text blocks placed in an alternating sequence above and below the line."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["diagonal-timeline","hexagonal-nodes","alternating-labels"],"avoid":["Unrelated bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Roadmaps"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical two-column split with text groupings on one side and a vertical portrait image floating on the other.","zones":["Asymmetrical two-column split with text groupings on one side and a vertical portrait image floating on the other."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["split-layout","portrait-image","quote"],"avoid":["Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Core value statements","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait","purpose":"Vertical feature image","bbox":[0.5,0.18,0.35,0.64],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Central square image intersected by large typography on both its left and right boundaries, accompanied by large stylized numerals.","zones":["Central square image intersected by large typography on both its left and right boundaries, accompanied by large stylized numerals."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["intersecting-text","large-numbers","central-image"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics","Bold statements","Chapter numbers"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"central-square","purpose":"Focal image","bbox":[0.38,0.18,0.62,0.64],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Central rectangular image with a massive, high-contrast title layered directly over the exact center, anchored by asymmetrical framing margins.","zones":["Central rectangular image with a massive, high-contrast title layered directly over the exact center, anchored by asymmetrical framing margins."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Massive serif typography overlapping image boundaries","Vertical, 90-degree rotated text framing the outer edges","Triple-stroke decorative wavy line motifs in corners"],"optional_variants":["centered-overlay","closing-slide","asymmetrical-frame"],"avoid":["Contact detail lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final calls to action"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"closing-image","purpose":"Final visual impression","bbox":[0.14,0.18,0.71,0.64],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use sharp, unrounded rectangular masks for all standard photography.
- Images should frequently touch or bleed off at least one slide edge.
- Images act as structural columns or focal anchors for overlapping typography.

【图标与装饰】
- Solid, flat white icons strictly aligned in grid formations.
- For processes, contain icons within geometric shapes (e.g., hexagons) to create unified nodes.

【数据页构图】
- Diagonal continuous line populated with hexagonal nodes, connecting to text blocks placed in an alternating sequence above and below the line.

【图表风格】
- Process charts utilize diagonal axes to create dynamic, upward-flowing visual paths.
- Connect text to graphical nodes using thin, dotted leader lines.

【章节页构图】
- Asymmetrical two-column split with text groupings on one side and a vertical portrait image floating on the other.

【收尾页构图】
- Central rectangular image with a massive, high-contrast title layered directly over the exact center, anchored by asymmetrical framing margins.

【禁止】
- Avoid centering standard text blocks; rely on asymmetrical edge alignments.
- Do not use gradients or 3D bevels; stick to flat, solid earthy tones.
- Avoid enclosing titles in bounding boxes; let them breathe or overlap imagery.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、High-end lifestyle brand decks、Editorial corporate profiles、Creative agency credentials。
