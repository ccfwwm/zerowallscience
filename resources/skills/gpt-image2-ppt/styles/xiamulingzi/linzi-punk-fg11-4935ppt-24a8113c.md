# 4935紫色演出潮流PPT模版 · FG11【朋克酷风】 / linzi-punk-fg11-4935ppt-24a8113c

## 风格ID
linzi-punk-fg11-4935ppt-24a8113c

## 风格名称
4935紫色演出潮流PPT模版 · FG11【朋克酷风】 / linzi-punk-fg11-4935ppt-24a8113c

## 风格描述
A dynamic, high-contrast presentation template featuring bold diagonal layouts, overlapping hollow frames, and a strong purple accent color, ideal for events or creative portfolios.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Purple (#7A378B) for accents, frames, and key graphics; Dark Navy (#1D1E3D) for solid text blocks and high-contrast text; White (#FFFFFF) for backgrounds; Grey (#A8A8A8) for secondary data and subtle backgrounds.
- fonts: Clean, modern sans-serif for body and headings (e.g., Helvetica/Arial style), with optional textured display font for covers.
- spacing: Generous outer margins with tight, overlapping internal elements to create tension and depth.
- shape_language: Sharp angles, diagonal lines, hard-edged rectangles, and stylized arrow ribbons.
- texture: Mostly flat surfaces with occasional distressed textures on primary titles or dark photo overlays.
- grid: Non-standard, heavily skewed diagonal grids paired with rigid orthogonal bounding boxes for text.
- motion_or_depth: Significant depth achieved through stark overlapping of flat shapes, thick hollow frames, and pronounced, soft drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「4935紫色演出潮流PPT模版 · FG11【朋克酷风】 / linzi-punk-fg11-4935ppt-24a8113c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A dynamic, high-contrast presentation template featuring bold diagonal layouts, overlapping hollow frames, and a strong purple accent color, ideal for events or creative portfolios.
- 推荐配色：#7A378B、#1D1E3D、#FFFFFF、#F4F4F4、#A8A8A8

【不可丢失的风格锚点】
- Bold diagonal background splits and image masks
- Thick, hollow rectangular and square accent frames overlapping content
- Deep purple primary accent against stark white and dark navy
- Prominent drop shadows creating distinct layers

【字体】
- Headings: Sans-serif, dark grey or purple, often large and left-aligned.
- Body: Sans-serif, light grey or white depending on background, easily legible.
- Display: Textured, all-caps sans-serif used exclusively for main title.
- Alignment: Primarily left-aligned text blocks, even within complex diagonal layouts.

【封面页构图】
- Full-bleed background with textured, centered typographic focal point and subtle outer framing.

【内容页构图】
- Angled image mask on the left with prominent text layout on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with textured, centered typographic focal point and subtle outer framing.","zones":["Full-bleed background with textured, centered typographic focal point and subtle outer framing."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["dark-mode","textured-text","full-bleed"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Atmospheric background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Strong diagonal split with image on one side, text on the other, united by an overlapping hollow frame.","zones":["Strong diagonal split with image on one side, text on the other, united by an overlapping hollow frame."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["diagonal-split","overlapping-frame","high-contrast"],"avoid":["Detailed lists","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"diag-left","purpose":"High-impact visual to fill the left diagonal cut","bbox":[0,0,0.6,1],"priority":1}]}
- content: [{"id":"content-content","composition":"Angled image mask on the left with prominent text layout on the right.","zones":["Angled image mask on the left with prominent text layout on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["angled-mask","asymmetrical","clean-text"],"avoid":["Lengthy body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Product showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"angled-left","purpose":"Subject-focused image fitting the custom mask","bbox":[0.1,0.15,0.5,0.85],"priority":1}]},{"id":"content-comparison","composition":"Grid-defying multi-image layout with adjacent text blocks.","zones":["Grid-defying multi-image layout with adjacent text blocks."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["multi-image","offset-grid","text-heavy"],"avoid":["Single, focused messages","copying source assets, source text, or an exact source arrangement"],"best_for":["Gallery views","Dual-feature comparisons"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"top-right-sq","purpose":"Square detail image","bbox":[0.42,0,0.31,0.52],"priority":1},{"id":"bottom-right-land","purpose":"Landscape context image","bbox":[0.42,0.54,0.53,0.3],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Stylized bar chart paired with a prominent framed text callout.","zones":["Stylized bar chart paired with a prominent framed text callout."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["bar-chart","pill-shapes","framed-text"],"avoid":["Complex multi-series charts","Precise data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Simple data comparisons","Trend visualization over time"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Strong diagonal split with image on one side, text on the other, united by an overlapping hollow frame.","zones":["Strong diagonal split with image on one side, text on the other, united by an overlapping hollow frame."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["diagonal-split","overlapping-frame","high-contrast"],"avoid":["Detailed lists","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"diag-left","purpose":"High-impact visual to fill the left diagonal cut","bbox":[0,0,0.6,1],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed atmospheric image with a central, semi-transparent text container.","zones":["Full-bleed atmospheric image with a central, semi-transparent text container."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Bold diagonal background splits and image masks","Thick, hollow rectangular and square accent frames overlapping content","Deep purple primary accent against stark white and dark navy"],"optional_variants":["closing","full-bleed","centered-block"],"avoid":["Any complex information","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final calls to action","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Striking background image to end the presentation","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are often masked into sharp diagonal shapes.
- Full-bleed images use dark or colored gradient overlays to ensure text readability.
- Images are frequently framed or overlapped by thick hollow vector shapes.

【图标与装饰】
- Minimalist, using solid small squares as bullet points.
- Social media icons in header/footer are small, flat, and grey.

【数据页构图】
- Stylized bar chart paired with a prominent framed text callout.

【图表风格】
- Column charts use pill-shaped bars (rounded tops and bottoms).
- Data points are differentiated by alternating primary purple and secondary grey colors.
- Values are placed vertically inside the bars.

【章节页构图】
- Strong diagonal split with image on one side, text on the other, united by an overlapping hollow frame.

【收尾页构图】
- Full-bleed atmospheric image with a central, semi-transparent text container.

【禁止】
- Avoid using soft, low-contrast pastel imagery; it will clash with the stark, edgy frames.
- Do not center-align body text; it breaks the strict grid established by the framing.
- Avoid removing drop shadows from overlapping elements; the layout will lose its necessary depth.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Event pitches (concerts, festivals, nightlife)、Creative agency portfolios、High-energy product launches、Trend reports in fashion or music。
