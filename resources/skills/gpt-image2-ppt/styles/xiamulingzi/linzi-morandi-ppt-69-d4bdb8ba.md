# 优雅线条（69）---木七设计 · ppt模板 / linzi-morandi-ppt-69-d4bdb8ba

## 风格ID
linzi-morandi-ppt-69-d4bdb8ba

## 风格名称
优雅线条（69）---木七设计 · ppt模板 / linzi-morandi-ppt-69-d4bdb8ba

## 风格描述
An elegant, minimalist presentation template featuring a soft Morandi color palette, organic geometric framing, and clean typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White background, dusty blue and peach for primary accents/fills, dark gray for typography.
- fonts: Clean sans-serif for primary text, optional outline/stroke styling for large structural text (e.g., section numbers).
- spacing: Generous margins framed by corner graphics, wide padding between columns and elements.
- shape_language: Organic overlapping circles/blobs for decoration, sharp rectangles for content cards, chevron arrows for processes.
- texture: Flat color fills, no gradients, clean vector edges.
- grid: Flexible central content zone, utilizing 2-column, 3-column, and staggered grid alignments.
- motion_or_depth: Flat design with slight overlapping of decorative shapes to create minimal depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（69）---木七设计 · ppt模板 / linzi-morandi-ppt-69-d4bdb8ba」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template featuring a soft Morandi color palette, organic geometric framing, and clean typography.
- 推荐配色：#6B94A9、#FABCAE、#DEEBE5、#F6DEE2、#FFFFFF

【不可丢失的风格锚点】
- Overlapping pastel circles and wavy line doodles in corners
- Airy layouts with generous white space
- Use of muted dusty blue and peach as primary accent colors
- Clean, borderless geometric shapes for content containers

【字体】
- Titles are large, centered or left-aligned, often in dusty blue.
- Body text is medium-dark gray, small, with adequate line height for readability.
- Section indicators use vertical orientation or outline styling for contrast.

【封面页构图】
- Centered title and subtitle block framed by abstract organic shapes in corners

【内容页构图】
- Diagonal staggered layout with alternating image and text blocks

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle block framed by abstract organic shapes in corners","zones":["Centered title and subtitle block framed by abstract organic shapes in corners"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["minimal","centered","organic-frame"],"avoid":["Data-heavy content","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Vertical colored rectangle containing vertical text, paired with rotated outlined section number","zones":["Vertical colored rectangle containing vertical text, paired with rotated outlined section number"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["vertical-text","split-layout"],"avoid":["Long paragraphs","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Diagonal staggered layout with alternating image and text blocks","zones":["Diagonal staggered layout with alternating image and text blocks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["staggered","image-text-pair"],"avoid":["Sequential process steps","Dense data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Case study highlights","Team introductions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"image_1","purpose":"First feature image","bbox":[0.14,0.31,0.25,0.3],"priority":1},{"id":"image_2","purpose":"Second feature image","bbox":[0.59,0.55,0.26,0.3],"priority":2}]},{"id":"content-comparison","composition":"Three equally sized rectangular cards with alternating colors, containing icons and text","zones":["Three equally sized rectangular cards with alternating colors, containing icons and text"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["3-column","cards","icon-grid"],"avoid":["Detailed narratives","Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Service offerings","Core values","Feature highlights"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Two-column layout with donut charts on the left and a bar chart on the right","zones":["Two-column layout with donut charts on the left and a bar chart on the right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["mixed-charts","data-comparison"],"avoid":["Text-heavy explanations","Full-bleed imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Financial summaries","Market share comparisons","Metric dashboards"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Vertical colored rectangle containing vertical text, paired with rotated outlined section number","zones":["Vertical colored rectangle containing vertical text, paired with rotated outlined section number"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["vertical-text","split-layout"],"avoid":["Long paragraphs","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing statement, styled identically to the cover slide with organic corner framing","zones":["Centered closing statement, styled identically to the cover slide with organic corner framing"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Overlapping pastel circles and wavy line doodles in corners","Airy layouts with generous white space","Use of muted dusty blue and peach as primary accent colors"],"optional_variants":["closing","centered","bookend"],"avoid":["New information","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are embedded within sharp rectangular frames.
- No borders or drop shadows on images, maintaining a flat aesthetic.
- Images are used both as small supporting elements and large hero features.

【图标与装饰】
- White outline icons placed centrally within colored rectangular cards.
- Simple, universal symbols.

【数据页构图】
- Two-column layout with donut charts on the left and a bar chart on the right

【图表风格】
- Flat design charts utilizing the template's pastel palette.
- Donut charts with clear central metrics.
- Bar charts with thin, subtle gridlines and no background fill.
- Data labels are clean and directly adjacent to data points.

【章节页构图】
- Vertical colored rectangle containing vertical text, paired with rotated outlined section number

【收尾页构图】
- Centered closing statement, styled identically to the cover slide with organic corner framing

【禁止】
- Avoid harsh, saturated colors that break the muted Morandi palette.
- Do not use heavy drop shadows or 3D effects.
- Avoid cluttered layouts; maintain the generous white space.
- Do not cover the decorative corner elements with text or images.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Lifestyle or fashion brand pitches、Elegant corporate overviews、Minimalist educational presentations。
