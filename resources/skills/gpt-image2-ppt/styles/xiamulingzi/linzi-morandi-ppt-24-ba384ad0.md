# 优雅线条（24）---木七设计 · ppt模板 / linzi-morandi-ppt-24-ba384ad0

## 风格ID
linzi-morandi-ppt-24-ba384ad0

## 风格名称
优雅线条（24）---木七设计 · ppt模板 / linzi-morandi-ppt-24-ba384ad0

## 风格描述
An elegant, geometric template utilizing a muted teal and gray palette. Features intersecting polygonal backgrounds, serif typography, and sophisticated layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark teal as primary anchoring background, light gray-blue for secondary planes, white for typography on dark backgrounds, dark teal for text on light backgrounds.
- fonts: Elegant transitional serif for primary headers and large numbers; clean geometric sans-serif for body copy and data labels.
- spacing: Generous margins with content frequently centered or aligned to strong vertical axes; large negative space in section dividers.
- shape_language: Sharp geometric polygons (triangles, trapezoids) juxtaposed with perfect circles and partially rounded rectangles.
- texture: Flat vector color blocks with no gradients, relying purely on shape intersection for depth.
- grid: Dynamic background grid based on diagonals; content adheres to strict horizontal/vertical 2-column or 4-column structures.
- motion_or_depth: Depth achieved through overlapping opaque color planes simulating folded paper or architectural forms.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（24）---木七设计 · ppt模板 / linzi-morandi-ppt-24-ba384ad0」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, geometric template utilizing a muted teal and gray palette. Features intersecting polygonal backgrounds, serif typography, and sophisticated layouts.
- 推荐配色：#2F5C5D、#A1B9BB、#C2C3C7、#FFFFFF、#406F70

【不可丢失的风格锚点】
- Intersecting diagonal planes creating faux-3D depth
- High-contrast serif typography for large numerals and headers
- Overlapping circular motifs for icons and graphic accents
- Asymmetric rounded corners on image frames

【字体】
- Use elegant serif fonts for large numbers and primary section titles.
- Use uppercase sans-serif with wide tracking for small sub-headers.
- Maintain strict left or center alignment for body paragraphs.

【封面页构图】
- Full-bleed intersecting geometric planes with centered typography block and bottom-right decorative accents

【内容页构图】
- Split horizontal bands with left-aligned text, right-aligned custom-shaped image, and a numbered list

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed intersecting geometric planes with centered typography block and bottom-right decorative accents","zones":["Full-bleed intersecting geometric planes with centered typography block and bottom-right decorative accents"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["geometric-cover","centered-title","minimalist"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major chapter openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Bold diagonal color split with an oversized serif numeral intersecting the edge, accompanied by smaller descriptive text","zones":["Bold diagonal color split with an oversized serif numeral intersecting the edge, accompanied by smaller descriptive text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["diagonal-split","oversized-number","section-break"],"avoid":["Standard content","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Transition slides"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split horizontal bands with left-aligned text, right-aligned custom-shaped image, and a numbered list","zones":["Split horizontal bands with left-aligned text, right-aligned custom-shaped image, and a numbered list"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["split-layout","asymmetric-image","numbered-list"],"avoid":["Heavy statistical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction layouts","Product highlights","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"banner_bg","purpose":"background context","bbox":[0.11,0.15,0.78,0.35],"priority":2},{"id":"hero_framed","purpose":"primary visual focus","bbox":[0.6,0.3,0.28,0.35],"priority":1}]},{"id":"content-comparison","composition":"Left-aligned dominant image block breaking a geometric background, flanked by a rigid right-aligned text column","zones":["Left-aligned dominant image block breaking a geometric background, flanked by a rigid right-aligned text column"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["image-left","text-column","asymmetric-balance"],"avoid":["Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Important quotes","Feature spotlights"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"feature_image","purpose":"product or context imagery","bbox":[0.12,0.2,0.5,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four horizontally overlapping circles with alternating solid and stroked styles, positioned above data blocks","zones":["Four horizontally overlapping circles with alternating solid and stroked styles, positioned above data blocks"],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["overlapping-circles","process-flow","icon-row"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","Core value pillars","Step-by-step metrics"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split horizontal bands with left-aligned text, right-aligned custom-shaped image, and a numbered list","zones":["Split horizontal bands with left-aligned text, right-aligned custom-shaped image, and a numbered list"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["split-layout","asymmetric-image","numbered-list"],"avoid":["Heavy statistical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction layouts","Product highlights","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"banner_bg","purpose":"background context","bbox":[0.11,0.15,0.78,0.35],"priority":2},{"id":"hero_framed","purpose":"primary visual focus","bbox":[0.6,0.3,0.28,0.35],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed intersecting geometric planes matching the cover, with centered closing typography","zones":["Full-bleed intersecting geometric planes matching the cover, with centered closing typography"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Intersecting diagonal planes creating faux-3D depth","High-contrast serif typography for large numerals and headers","Overlapping circular motifs for icons and graphic accents"],"optional_variants":["geometric-closing","bookend","centered-text"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Apply asymmetric border radii to standalone image frames (e.g., top-left and bottom-right rounded).
- Use full-bleed images behind translucent overlays or cropped to geometric bounding boxes.

【图标与装饰】
- Utilize thin, minimalist line-art icons.
- Encase icons within solid or wireframe overlapping circles to create visual weight.

【数据页构图】
- Four horizontally overlapping circles with alternating solid and stroked styles, positioned above data blocks

【图表风格】
- Use alternating row background colors (zebra striping) for tabular data or lists.
- Align statistics, icons, and text in strict horizontal bands.

【章节页构图】
- Bold diagonal color split with an oversized serif numeral intersecting the edge, accompanied by smaller descriptive text

【收尾页构图】
- Full-bleed intersecting geometric planes matching the cover, with centered closing typography

【禁止】
- Avoid overly bright or neon colors; stick to muted, desaturated tones.
- Do not use drop shadows; rely on shape overlap for depth.
- Avoid heavily rounded bubbly fonts; maintain crisp serif/sans-serif contrast.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Corporate business reports、High-end brand guidelines、Consulting frameworks、Elegant portfolio presentations。
