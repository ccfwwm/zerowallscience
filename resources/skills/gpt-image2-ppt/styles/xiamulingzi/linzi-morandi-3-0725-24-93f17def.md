# 24 · 3.07更新高级色25 / linzi-morandi-3-0725-24-93f17def

## 风格ID
linzi-morandi-3-0725-24-93f17def

## 风格名称
24 · 3.07更新高级色25 / linzi-morandi-3-0725-24-93f17def

## 风格描述
A modern, sophisticated presentation template utilizing a muted Morandi color palette, soft geometric shapes, and clean grid layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted coral and teal serve as primary accents and structural block backgrounds. Slate blue acts as a grounding secondary color. Backgrounds are off-white.
- fonts: Clean, modern sans-serif. Thin weights for background stylistic text, regular/medium for headers, light/regular for body text.
- spacing: Generous outer margins. Internal gutters between grid items are tight but mathematically consistent.
- shape_language: Soft and friendly. Extensive use of pill shapes, fully rounded circles for icons, and overlapping fluid/rounded rectangles.
- texture: Flat and matte. No gradients, drop shadows, or glossy effects.
- grid: Symmetrical 2, 3, and 4-column structures. Content is strictly aligned to invisible vertical and horizontal axes.
- motion_or_depth: Depth is achieved purely through 2D planar overlap (text over shapes, color blocks over images) without simulated 3D effects.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「24 · 3.07更新高级色25 / linzi-morandi-3-0725-24-93f17def」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, sophisticated presentation template utilizing a muted Morandi color palette, soft geometric shapes, and clean grid layouts.
- 推荐配色：#F09586、#7BA7B8、#4E7587、#F9F9F9、#333333

【不可丢失的风格锚点】
- Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.
- Pill-shaped (capsule) section indicators positioned at the top left of content slides.
- Large, thin, uppercase background typography acting as a watermark beneath primary titles.
- Alternating solid color blocks and images used in tight checkerboard or grid formations.

【字体】
- Cover/Section Titles: Center-aligned, layered over large thin tracking text.
- Slide Headers: Encased in a pill-shaped container, left-aligned.
- Body text: Left-aligned, high line-height, constrained to specific column widths.
- Numbers: Used as large stylistic elements behind section titles or as small indicators inside solid blocks.

【封面页构图】
- Centered layered typography above massive overlapping rounded shapes at the bottom edge.

【内容页构图】
- Left side image/color block collage, right side vertical list with dashed dividers.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered layered typography above massive overlapping rounded shapes at the bottom edge.","zones":["Centered layered typography above massive overlapping rounded shapes at the bottom edge."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["hero","centered","geometric-base"],"avoid":["Data heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered layered typography with a large numeral, above bottom overlapping shapes.","zones":["Centered layered typography with a large numeral, above bottom overlapping shapes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["section-break","numbered","geometric-base"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left side image/color block collage, right side vertical list with dashed dividers.","zones":["Left side image/color block collage, right side vertical list with dashed dividers."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["split-layout","image-grid","list"],"avoid":["Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Process overviews","Feature highlights with supporting imagery"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-top-left","purpose":"contextual image","bbox":[0.05,0.27,0.24,0.26],"priority":1},{"id":"img-bottom-right","purpose":"contextual image","bbox":[0.3,0.55,0.24,0.26],"priority":2}]},{"id":"content-comparison","composition":"Four-quadrant checkerboard of solid color blocks and images.","zones":["Four-quadrant checkerboard of solid color blocks and images."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["quadrant","checkerboard","image-heavy"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Core value propositions","Team profiles","Product comparisons"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img-top-right","purpose":"mood/context image","bbox":[0.5,0,0.5,0.5],"priority":1},{"id":"img-bottom-left","purpose":"mood/context image","bbox":[0,0.5,0.5,0.5],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Two side-by-side bar charts separated by a central graphical element.","zones":["Two side-by-side bar charts separated by a central graphical element."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["charts","comparison","split-layout"],"avoid":["Complex multi-series line charts","copying source assets, source text, or an exact source arrangement"],"best_for":["A/B comparisons","Before/After metrics","Competitor analysis"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered layered typography with a large numeral, above bottom overlapping shapes.","zones":["Centered layered typography with a large numeral, above bottom overlapping shapes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["section-break","numbered","geometric-base"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered layered typography above massive overlapping rounded shapes at the bottom edge.","zones":["Centered layered typography above massive overlapping rounded shapes at the bottom edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Large, overlapping, heavily rounded shapes anchored to the bottom edge on cover/section slides.","Pill-shaped (capsule) section indicators positioned at the top left of content slides.","Large, thin, uppercase background typography acting as a watermark beneath primary titles."],"optional_variants":["closing","centered","geometric-base"],"avoid":["Any content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped to strict squares or rectangles to fit the grid.
- Images are frequently paired with slightly overlapping, solid-colored square tags containing numbers.
- No complex masks or irregular cutouts; images act as structural building blocks.

【图标与装饰】
- Minimalist, thin-line style.
- Frequently housed inside solid colored circles or placed over solid color blocks in white.

【数据页构图】
- Two side-by-side bar charts separated by a central graphical element.

【图表风格】
- Flat design, no 3D effects.
- Bar charts exclude Y-axis lines, relying on direct data labels placed above the bars.
- Colors of data series strictly adhere to the primary coral and teal palette.

【章节页构图】
- Centered layered typography with a large numeral, above bottom overlapping shapes.

【收尾页构图】
- Centered layered typography above massive overlapping rounded shapes at the bottom edge.

【禁止】
- Avoid harsh neon or highly saturated colors.
- Do not use sharp right angles for major decorative elements; maintain soft radii.
- Avoid drop shadows or bevel effects.
- Do not place complex text directly over busy photographs without a solid color block intermediary.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Quarterly business reviews、Creative agency credentials、Modern HR or internal communications、Product marketing overviews。
