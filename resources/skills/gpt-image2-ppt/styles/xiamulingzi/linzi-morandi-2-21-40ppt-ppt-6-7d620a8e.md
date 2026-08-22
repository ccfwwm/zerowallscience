# 莫兰迪风尚 (6) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-6-7d620a8e

## 风格ID
linzi-morandi-2-21-40ppt-ppt-6-7d620a8e

## 风格名称
莫兰迪风尚 (6) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-6-7d620a8e

## 风格描述
An artistic, Morandi-inspired deck utilizing a persistent complex organic background offset by strict, solid-color rectangular content overlays.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Warm light-grey for content panels; Slate blue, deep red, and mustard yellow for accents and background elements
- fonts: Elegant serif for primary titles; clean sans-serif for body text and metadata
- spacing: Generous outer margins establishing the floating card effect; standardized inner padding within the card
- shape_language: Strict geometric rectangles for functional areas contrasting heavily with organic, fluid background shapes
- texture: Painted/brush-stroke material effects isolated entirely to the background layer
- grid: Standardized 2, 3, and 4-column column splits constrained entirely within the inner content card
- motion_or_depth: Simple 2.5D depth created by placing a stark, flat card over a visually deep, textured background canvas

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (6) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-6-7d620a8e」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An artistic, Morandi-inspired deck utilizing a persistent complex organic background offset by strict, solid-color rectangular content overlays.
- 推荐配色：#31414D、#E0AA1F、#761F1A、#E1DACF、#FFFFFF

【不可丢失的风格锚点】
- Full-bleed complex, organic background acting as a continuous canvas
- Solid-color, sharp-edged rectangular floating cards defining the content area
- Vertical accent blocks in top-left slide headers
- Prominent, oversized serif typography for major titles and numbers

【字体】
- Center-align major titles on full-bleed backgrounds
- Use oversized, bold numerals as graphical elements for timelines and sequences
- Ensure high contrast by placing dense body text only over solid-color safe zones

【封面页构图】
- Centered dual-level text block over full-bleed complex organic background

【内容页构图】
- Floating card layout containing four equal-width square image placeholders arranged horizontally with text below

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered dual-level text block over full-bleed complex organic background","zones":["Centered dual-level text block over full-bleed complex organic background"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["centered","minimal-text","hero-background"],"avoid":["Text-heavy executive summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentations requiring high visual impact openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned section numeral in a stroked box adjacent to title text over full-bleed background","zones":["Left-aligned section numeral in a stroked box adjacent to title text over full-bleed background"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["section-break","asymmetric","numeral-focus"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Agenda introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Floating card layout containing four equal-width square image placeholders arranged horizontally with text below","zones":["Floating card layout containing four equal-width square image placeholders arranged horizontally with text below"],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["4-column","gallery","image-grid"],"avoid":["Deep narrative text","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Product galleries","Feature highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img1","purpose":"gallery item 1","bbox":[0.1,0.3,0.15,0.28],"priority":1},{"id":"img2","purpose":"gallery item 2","bbox":[0.3,0.3,0.15,0.28],"priority":2},{"id":"img3","purpose":"gallery item 3","bbox":[0.53,0.3,0.15,0.28],"priority":3},{"id":"img4","purpose":"gallery item 4","bbox":[0.74,0.3,0.15,0.28],"priority":4}]},{"id":"content-comparison","composition":"Floating card containing three large, alternating-color vertical numerals interspersed with text blocks","zones":["Floating card containing three large, alternating-color vertical numerals interspersed with text blocks"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["timeline","typographic-focus","rotated-text"],"avoid":["Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Chronological timelines","Step-by-step processes"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Floating solid-color card containing a top-left header and an isometric stacked diagram with labeled callouts","zones":["Floating solid-color card containing a top-left header and an isometric stacked diagram with labeled callouts"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["isometric-diagram","card-layout","callouts"],"avoid":["Linear timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Layered architectural concepts","Process stacking","Component breakdowns"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned section numeral in a stroked box adjacent to title text over full-bleed background","zones":["Left-aligned section numeral in a stroked box adjacent to title text over full-bleed background"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["section-break","asymmetric","numeral-focus"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Agenda introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Single centered typographic element over full-bleed complex background","zones":["Single centered typographic element over full-bleed complex background"],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Full-bleed complex, organic background acting as a continuous canvas","Solid-color, sharp-edged rectangular floating cards defining the content area","Vertical accent blocks in top-left slide headers"],"optional_variants":["closing","centered-title","minimal"],"avoid":["Contact info slides requiring multiple lines","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation conclusion","Q&A pause screens"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images within content zones use strict geometric cropping (squares, rectangles)
- Images sit flat on the content card without borders, shadows, or rounded corners

【图标与装饰】
- Minimal iconography; primarily relies on typography and color blocks for signaling

【数据页构图】
- Floating solid-color card containing a top-left header and an isometric stacked diagram with labeled callouts

【图表风格】
- Diagrams utilize flat, isometric geometric shapes (e.g., stacked diamonds)
- Connecting lines are extremely thin with subtle terminal nodes

【章节页构图】
- Left-aligned section numeral in a stroked box adjacent to title text over full-bleed background

【收尾页构图】
- Single centered typographic element over full-bleed complex background

【禁止】
- Do not place body copy directly on complex textured backgrounds
- Avoid rounded corners on content cards or images to maintain the sharp/organic contrast
- Do not clutter the margins outside the central content card
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios、Exhibition or gallery overviews、Brand mood boards or lookbooks。
