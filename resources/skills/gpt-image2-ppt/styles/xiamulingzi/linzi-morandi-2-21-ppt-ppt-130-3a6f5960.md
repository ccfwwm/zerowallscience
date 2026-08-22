# 130 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-130-3a6f5960

## 风格ID
linzi-morandi-2-21-ppt-ppt-130-3a6f5960

## 风格名称
130 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-130-3a6f5960

## 风格描述
A traditional, poetic template defined by vertical typography, stark high-contrast split backgrounds, and heavy use of organic decorative accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Deep slate blue acts as both a solid background and heavy structural container; pure white provides high-contrast negative space. Dark ink grey is used for text.
- fonts: Serif or traditional calligraphy-inspired fonts to match the poetic tone. High contrast between large structural numbers and standard body text.
- spacing: Extremely generous padding. Text columns are tightly leaded internally but separated by wide external margins to emphasize whitespace.
- shape_language: Perfect circles and sharp-edged rectangles. No rounded corners.
- texture: Flat, unshadowed geometric shapes contrasted with organic, soft-edged botanical or ink-wash graphical accents.
- grid: Multi-column vertical flow (3-4 columns). Symmetrical balances and extreme asymmetrical splits (e.g., 20/80).
- motion_or_depth: Flat. Depth is achieved solely through organic graphic elements overlapping the hard edges of structural background blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「130 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-130-3a6f5960」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A traditional, poetic template defined by vertical typography, stark high-contrast split backgrounds, and heavy use of organic decorative accents.
- 推荐配色：#373C4E、#FFFFFF、#2A2A2A、#D9A54D

【不可丢失的风格锚点】
- Vertical text orientation for both headers and body copy
- Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)
- Circular containers used as numbers, icons, or primary text bounds
- High-contrast minimalist environments (pure white against deep slate blue)
- Organic, borderless graphic accents that bleed across geometric grid lines

【字体】
- Text is predominantly set in a vertical orientation, reading right-to-left
- Titles often separated by thin vertical divider lines
- Horizontal text is used sparingly, typically confined to isolated bounded boxes for contrast
- Large, stylistic circular numerals are used as hierarchical anchors

【封面页构图】
- Full bleed dark background, corner-anchored graphic accents, centered vertical typography

【内容页构图】
- Top centered title, three columns of vertical text with solid rectangular header blocks, right-aligned accent graphic

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full bleed dark background, corner-anchored graphic accents, centered vertical typography","zones":["Full bleed dark background, corner-anchored graphic accents, centered vertical typography"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["dark-mode","centered-vertical","minimalist"],"avoid":["Data-heavy content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central vertical stripe containing title, dividing the slide into two equal halves, each containing two numbered content clusters","zones":["Central vertical stripe containing title, dividing the slide into two equal halves, each containing two numbered content clusters"],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["central-divider","4-item-grid","symmetrical"],"avoid":["Single focal point content","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Four-part models","Section overviews"],"evidence_pages":["page-08"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Top centered title, three columns of vertical text with solid rectangular header blocks, right-aligned accent graphic","zones":["Top centered title, three columns of vertical text with solid rectangular header blocks, right-aligned accent graphic"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["3-column","vertical-text","light-mode"],"avoid":["Long sequential narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Three-point lists"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"accent-graphic-right","purpose":"borderless organic accent graphic","bbox":[0.7,0.3,0.25,0.6],"priority":2}]},{"id":"content-comparison","composition":"50/50 horizontal split screen, alternating background colors, mirrored vertical text blocks, circular numerical anchors","zones":["50/50 horizontal split screen, alternating background colors, mirrored vertical text blocks, circular numerical anchors"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["horizontal-split","contrast-planes","numbered"],"avoid":["Single continuous narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Two-step sequences","Dichotomies"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"accent-graphic-left-top","purpose":"borderless organic accent graphic","bbox":[0.0,0.1,0.3,0.4],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Three large equal-sized circles acting as primary text containers distributed evenly across the center","zones":["Three large equal-sized circles acting as primary text containers distributed evenly across the center"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["circular-containers","symmetrical","3-item-grid"],"avoid":["Paragraphs of explanatory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Core pillars","High-level concepts","Three-part frameworks"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top centered title, three columns of vertical text with solid rectangular header blocks, right-aligned accent graphic","zones":["Top centered title, three columns of vertical text with solid rectangular header blocks, right-aligned accent graphic"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["3-column","vertical-text","light-mode"],"avoid":["Long sequential narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Three-point lists"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"accent-graphic-right","purpose":"borderless organic accent graphic","bbox":[0.7,0.3,0.25,0.6],"priority":2}]}]
- quote: {"id":"quote-primary","composition":"Centered outlined bounding box, horizontal text flow, integrated background watermark, corner-anchored overlapping accent graphic","zones":["Centered outlined bounding box, horizontal text flow, integrated background watermark, corner-anchored overlapping accent graphic"],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["bordered-container","horizontal-text","watermark"],"avoid":["Standard bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Important quotes","Executive summaries","Stand-out statements"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"accent-graphic-corner","purpose":"corner overlapping accent","bbox":[0.6,0.3,0.2,0.4],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Full bleed dark background, corner-anchored graphic accents, centered vertical typography (Identical macro to cover)","zones":["Full bleed dark background, corner-anchored graphic accents, centered vertical typography (Identical macro to cover)"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Vertical text orientation for both headers and body copy","Harsh, edge-to-edge color splits (50/50 horizontal or 20/80 vertical)","Circular containers used as numbers, icons, or primary text bounds"],"optional_variants":["bookend","dark-mode","minimalist"],"avoid":["Summary bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are entirely borderless, die-cut, or transparent-background graphical elements
- Graphics act as marginalia, anchored to corners or bridging the divide between contrasting background blocks
- No standard rectangular photo frames are used

【图标与装饰】
- Traditional seal/stamp motifs used as accent icons
- Numbers frequently enclosed in solid filled circles

【数据页构图】
- Three large equal-sized circles acting as primary text containers distributed evenly across the center

【图表风格】
- No traditional data charts present. Lists are mapped to multi-column vertical text blocks or isolated circular containers.

【章节页构图】
- Central vertical stripe containing title, dividing the slide into two equal halves, each containing two numbered content clusters

【收尾页构图】
- Full bleed dark background, corner-anchored graphic accents, centered vertical typography (Identical macro to cover)

【禁止】
- Avoid horizontal text flow for primary content blocks to maintain the theme's structural signature
- Avoid standard framed photos or heavy drop shadows
- Avoid bright, neon, or modern primary colors that break the muted, traditional palette
- Avoid cluttered layouts; negative space is a mandatory structural element
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Poetry, literature, or historical subject presentations、High-end cultural or arts portfolio overviews、Minimalist narrative storytelling。
