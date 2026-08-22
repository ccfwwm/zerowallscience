# 101 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-101-7e1b51d2

## 风格ID
linzi-morandi-2-21-ppt-ppt-101-7e1b51d2

## 风格名称
101 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-101-7e1b51d2

## 风格描述
A minimalist, elegant presentation system featuring Morandi gradient backgrounds, translucent frosted-glass panels, and highly structured typographic layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Soft dusty pinks and sage greens for backgrounds; stark white for primary text, shapes, and borders. Opaque pastel accents for charts/icons.
- fonts: Elegant serif for primary titles, clean legible sans-serif for body copy and numbers. Strong scale contrast.
- spacing: Generous outer margins with content centralized within translucent bounding boxes.
- shape_language: Geometric precision featuring sharp rectangles, circles for icons, and 45-degree rotated squares (diamonds). Thin stroke outlines.
- texture: Smooth linear gradients combined with translucent overlays simulating frosted glass.
- grid: Symmetrical center-aligned cover, distinct 1/3 to 2/3 splits for section breaks, and 2x4 or 2x2 matrices for content.
- motion_or_depth: Optical depth is achieved flatly through translucent layers revealing the background gradient, rather than drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「101 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-101-7e1b51d2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, elegant presentation system featuring Morandi gradient backgrounds, translucent frosted-glass panels, and highly structured typographic layouts.
- 推荐配色：#C893A0、#97C0AC、#FFFFFF、#E2B9C3、#AED3C4

【不可丢失的风格锚点】
- Dusty rose to sage green continuous background gradients.
- Translucent white framing panels creating a subtle glassmorphism effect.
- Large, high-contrast structural typography (numerals and section headers).
- Rotated vertical watermark typography on the margins.

【字体】
- Primary titles use an elegant serif typeface, centered or clearly anchored.
- Section indicators use oversized sans-serif numerals on the left, establishing a strong anchor.
- Watermark text is rotated 90 degrees along the right edge or sits horizontally overlapping the frame.
- Body text is exclusively light-weight sans-serif.

【封面页构图】
- Central translucent framed box containing tiered centered text, flanked by thin outlined pill shapes.

【内容页构图】
- 2x4 uniform grid of circular icons with centered text lockups below each.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central translucent framed box containing tiered centered text, flanked by thin outlined pill shapes.","zones":["Central translucent framed box containing tiered centered text, flanked by thin outlined pill shapes."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Dusty rose to sage green continuous background gradients.","Translucent white framing panels creating a subtle glassmorphism effect.","Large, high-contrast structural typography (numerals and section headers)."],"optional_variants":["centered","glassmorphism","minimal"],"avoid":["Data presentation","Heavy text reading","copying source assets, source text, or an exact source arrangement"],"best_for":["Title page","Section introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Asymmetrical two-column split within a translucent frame, oversized numeral on the left, title and description on the right.","zones":["Asymmetrical two-column split within a translucent frame, oversized numeral on the left, title and description on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Dusty rose to sage green continuous background gradients.","Translucent white framing panels creating a subtle glassmorphism effect.","Large, high-contrast structural typography (numerals and section headers)."],"optional_variants":["split-layout","typographic-anchor","chapter-break"],"avoid":["Detailed lists","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"2x4 uniform grid of circular icons with centered text lockups below each.","zones":["2x4 uniform grid of circular icons with centered text lockups below each."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Dusty rose to sage green continuous background gradients.","Translucent white framing panels creating a subtle glassmorphism effect.","Large, high-contrast structural typography (numerals and section headers)."],"optional_variants":["grid-8","icon-centric","balanced"],"avoid":["Deep narrative text","Sequential storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Features overview","Service lists","Team profiles (if icons are swapped for circular portraits)"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Central composite diamond shape made of 4 smaller rotated squares, flanked by text blocks in the four corners.","zones":["Central composite diamond shape made of 4 smaller rotated squares, flanked by text blocks in the four corners."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Dusty rose to sage green continuous background gradients.","Translucent white framing panels creating a subtle glassmorphism effect.","Large, high-contrast structural typography (numerals and section headers)."],"optional_variants":["diamond-matrix","radial-layout","corner-text"],"avoid":["Long sequential lists","Data-heavy charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Core value propositions","SWOT analysis","Interconnected concepts"],"evidence_pages":["page-06"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Left-aligned dominant donut chart paired with a right-aligned vertical list of key metrics and icon blocks.","zones":["Left-aligned dominant donut chart paired with a right-aligned vertical list of key metrics and icon blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Dusty rose to sage green continuous background gradients.","Translucent white framing panels creating a subtle glassmorphism effect.","Large, high-contrast structural typography (numerals and section headers)."],"optional_variants":["donut-chart","data-summary","split-data"],"avoid":["Complex line trends","Dense tables","copying source assets, source text, or an exact source arrangement"],"best_for":["High-level statistics","Quarterly summaries","Proportion visualization"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical two-column split within a translucent frame, oversized numeral on the left, title and description on the right.","zones":["Asymmetrical two-column split within a translucent frame, oversized numeral on the left, title and description on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Dusty rose to sage green continuous background gradients.","Translucent white framing panels creating a subtle glassmorphism effect.","Large, high-contrast structural typography (numerals and section headers)."],"optional_variants":["split-layout","typographic-anchor","chapter-break"],"avoid":["Detailed lists","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- The system relies entirely on gradient backgrounds and vector shapes rather than photography.
- If photos are used, they must be heavily heavily muted or placed behind the frosted glass overlays.

【图标与装饰】
- Icons are predominantly flat white silhouettes placed perfectly centered inside pastel circular or diamond backgrounds.
- Line-art icons are used sparingly on solid colored blocks.

【数据页构图】
- Left-aligned dominant donut chart paired with a right-aligned vertical list of key metrics and icon blocks.

【图表风格】
- Charts use flat, untextured geometric shapes (e.g., a simple donut chart) with solid pastel segments that complement the background gradient.

【章节页构图】
- Asymmetrical two-column split within a translucent frame, oversized numeral on the left, title and description on the right.

【收尾页构图】
- Central translucent framed box containing tiered centered text, flanked by thin outlined pill shapes.

【禁止】
- Avoid overlapping large decorative text directly on top of functional body copy (as seen on page 08).
- Do not use high-saturation or neon colors; maintain the muted Morandi palette.
- Do not use harsh drop shadows; rely on translucent shapes for depth.
- Do not clutter the expansive margins designated for the translucent frame.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Fashion or lifestyle brand decks、Minimalist corporate summaries、Design moodboards and strategy presentations。
