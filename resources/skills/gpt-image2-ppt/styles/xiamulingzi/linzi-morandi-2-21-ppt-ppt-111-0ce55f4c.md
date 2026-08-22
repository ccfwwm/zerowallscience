# 111 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-111-0ce55f4c

## 风格ID
linzi-morandi-2-21-ppt-ppt-111-0ce55f4c

## 风格名称
111 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-111-0ce55f4c

## 风格描述
A minimalist, elegant presentation template featuring a muted Morandi color palette, diagonal background geometry, and clean geometric content containers.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White primary background for content; dark gray (#555555) for text; alternating Morandi shades (slate, terracotta, sage, peach) for accents and data visualization.
- fonts: Elegant serif for primary headings to convey sophistication, paired with a legible sans-serif for body copy.
- spacing: Generous margins inside the white content frame, maintaining a consistent clear zone from the colored background edges.
- shape_language: Primarily orthogonal rectangles mixed with smooth circular badges, pill shapes, and chevron ribbons.
- texture: Flat vector geometry combined with soft, wide drop shadows behind the main content layer to create a subtle 3D floating effect.
- grid: Centralized single-column covers, transitioning into 2-column and 3-row grid variations within the inner white card bounds.
- motion_or_depth: Depth is strictly established via the drop shadow separating the white content container from the dynamic diagonal background pattern.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「111 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-111-0ce55f4c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, elegant presentation template featuring a muted Morandi color palette, diagonal background geometry, and clean geometric content containers.
- 推荐配色：#7CA6B5、#E08E79、#8CB3A0、#FCAE9D、#FADCD2

【不可丢失的风格锚点】
- Diagonal striped, multi-colored background frame
- Central floating white content card with subtle top/bottom drop shadows
- Muted, pastel 'Morandi' accent colors
- Clean circular and pill-shaped geometric containers for icons and numbers

【字体】
- Titles use a prominent serif font, center-aligned on covers and section breaks.
- Body text is sans-serif, maintaining small but readable sizes with open line heights.
- Hierarchy is driven by scale and placement rather than heavy font weights.

【封面页构图】
- Full-width horizontal white band layered over diagonal stripes, containing centered typography and a colored pill-shaped badge.

【内容页构图】
- Split layout with left-aligned text clusters under a colored header tab, paired with a large right-side rectangular image.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-width horizontal white band layered over diagonal stripes, containing centered typography and a colored pill-shaped badge.","zones":["Full-width horizontal white band layered over diagonal stripes, containing centered typography and a colored pill-shaped badge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["centered","floating-band","minimalist"],"avoid":["Data-heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major chapter breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"White rectangular card with margins revealing the background frame, featuring a centered colored rectangular label and stacked text.","zones":["White rectangular card with margins revealing the background frame, featuring a centered colored rectangular label and stacked text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["card-layout","centered-text","section-break"],"avoid":["Complex data","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key message highlights"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout with left-aligned text clusters under a colored header tab, paired with a large right-side rectangular image.","zones":["Split layout with left-aligned text clusters under a colored header tab, paired with a large right-side rectangular image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["split-layout","image-right","text-left"],"avoid":["Full-screen charts","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Service descriptions","Case studies"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-right","purpose":"contextual or subject photography","bbox":[0.53,0.2,0.43,0.51],"priority":1}]},{"id":"content-comparison","composition":"Three-row horizontal list where each item pairs a left-side text block with a right-aligned icon-and-pill graphic.","zones":["Three-row horizontal list where each item pairs a left-side text block with a right-aligned icon-and-pill graphic."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["horizontal-list","icon-pills","3-items"],"avoid":["Dense paragraphs","Visual portfolios","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Key takeaways","Sequential lists"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Central circular diagram split into four colored quadrants surrounding a core icon, with text blocks radiating outward.","zones":["Central circular diagram split into four colored quadrants surrounding a core icon, with text blocks radiating outward."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["radial-diagram","quadrants","central-hub"],"avoid":["Linear timelines","Exact quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Core value representations","Four-part models","Cyclical processes"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: White rectangular card with margins revealing the background frame, featuring a centered colored rectangular label and stacked text.","zones":["White rectangular card with margins revealing the background frame, featuring a centered colored rectangular label and stacked text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["card-layout","centered-text","section-break"],"avoid":["Complex data","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key message highlights"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Full-width horizontal white band layered over diagonal stripes, containing centered typography and a colored pill-shaped badge, identical to the cover structure.","zones":["Full-width horizontal white band layered over diagonal stripes, containing centered typography and a colored pill-shaped badge, identical to the cover structure."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Diagonal striped, multi-colored background frame","Central floating white content card with subtle top/bottom drop shadows","Muted, pastel 'Morandi' accent colors"],"optional_variants":["centered","floating-band","bookend"],"avoid":["Summary data","Detailed conclusions","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in rigid, unbordered rectangular slots that align flush with adjacent colored geometric text blocks.
- Device mockups (smartphones) are used as specific framing devices for app/mobile concepts.

【图标与装饰】
- Monoline, minimalist icons placed inside solid circular accent badges.
- Icons consistently use white strokes over colored Morandi backgrounds.

【数据页构图】
- Central circular diagram split into four colored quadrants surrounding a core icon, with text blocks radiating outward.

【图表风格】
- Donut charts with clean, flat segments using the template's accent colors, featuring central percentage text.
- Symmetrical, segmented circular diagrams creating a unified target/core visual.

【章节页构图】
- White rectangular card with margins revealing the background frame, featuring a centered colored rectangular label and stacked text.

【收尾页构图】
- Full-width horizontal white band layered over diagonal stripes, containing centered typography and a colored pill-shaped badge, identical to the cover structure.

【禁止】
- Avoid using highly saturated neon or primary colors that break the muted aesthetic.
- Do not overlap text directly onto the busy diagonal background; always use the white card.
- Avoid heavy borders or complex gradients on shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Business planning and strategy proposals、Creative portfolio presentations、Design agency overviews、Lifestyle or wellness brand decks。
