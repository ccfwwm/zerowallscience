# 莫兰迪风格PPT (2) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-2-6fda302a

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-2-6fda302a

## 风格名称
莫兰迪风格PPT (2) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-2-6fda302a

## 风格描述
An elegant, lookbook-style presentation utilizing a Morandi color palette, staggered overlapping layouts, and organic leaf shadow overlays.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Olive green and rust orange act as primary accents against light grey and white backgrounds. Dark charcoal used for primary text.
- fonts: Clean, thin modern sans-serif for body and structural headers. An elegant, sweeping script font used exclusively as a decorative layer.
- spacing: Generous negative space, often utilizing a 50/50 or 40/60 asymmetrical split with padded inner text columns.
- shape_language: Strictly orthogonal. Sharp rectangular image crops and text boxes. No rounded corners.
- texture: Flat, matte color blocks contrasted with the pseudo-realistic texture of dappled plant shadows.
- grid: Modular grid with overlapping elements; cards deliberately break the strict column lines to create depth.
- motion_or_depth: Depth is achieved through flat overlaps (color blocks over images) and the ambient shadow overlays acting as a foreground lighting effect.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (2) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-2-6fda302a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, lookbook-style presentation utilizing a Morandi color palette, staggered overlapping layouts, and organic leaf shadow overlays.
- 推荐配色：#595536、#BA4D29、#C8C9C8、#FFFFFF、#222222

【不可丢失的风格锚点】
- Organic botanical shadow overlays on negative space
- Three-diamond (◆ ◆ ◆) decorative motifs
- Overlapping solid color cards and photographic blocks
- Oversized flowing script typography bridging separate visual zones

【字体】
- Use uppercase sans-serif for secondary labels and metadata.
- Deploy the decorative script font diagonally or overlapping boundaries as a visual texture rather than strictly legible content.
- Maintain wide line-height for body paragraphs to enhance the editorial/lookbook feel.

【封面页构图】
- Asymmetrical split with a soft grey geometric block on the left holding an inset portrait, and a full-bleed hero image on the right with overlaid script typography.

【内容页构图】
- Center-left rectangular image overlapping a lower-right solid color text card, flanked by a minimalist left sidebar.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with a soft grey geometric block on the left holding an inset portrait, and a full-bleed hero image on the right with overlaid script typography.","zones":["Asymmetrical split with a soft grey geometric block on the left holding an inset portrait, and a full-bleed hero image on the right with overlaid script typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["split-cover","inset-image","script-overlay"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Hero introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full bleed right side atmosphere","bbox":[0.5,0.0,0.5,1.0],"priority":1},{"id":"inset-portrait","purpose":"Focal character or subject","bbox":[0.15,0.2,0.25,0.6],"priority":2}]}
- section: {"id":"section-primary","composition":"Horizontal split: upper half white space with structured text and quotes, lower half occupied entirely by a full-width image.","zones":["Horizontal split: upper half white space with structured text and quotes, lower half occupied entirely by a full-width image."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["horizontal-split","bottom-heavy","section-break"],"avoid":["Long form body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter titles"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"bottom-panorama","purpose":"Grounding atmospheric background","bbox":[0.15,0.45,0.85,0.55],"priority":1}]}
- content: [{"id":"content-content","composition":"Center-left rectangular image overlapping a lower-right solid color text card, flanked by a minimalist left sidebar.","zones":["Center-left rectangular image overlapping a lower-right solid color text card, flanked by a minimalist left sidebar."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["staggered-cards","overlap","profile"],"avoid":["Dense lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Key concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-left-image","purpose":"Primary visual anchor","bbox":[0.22,0.15,0.28,0.65],"priority":1}]},{"id":"content-comparison","composition":"Left white column with text, right full-bleed image, united by a solid horizontal text box spanning the lower third.","zones":["Left white column with text, right full-bleed image, united by a solid horizontal text box spanning the lower third."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["split-screen","bridging-box","half-bleed"],"avoid":["Multi-chart comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Narrative slides"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-half-bleed","purpose":"Atmospheric right-side image","bbox":[0.45,0.0,0.55,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Center-left rectangular image overlapping a lower-right solid color text card, flanked by a minimalist left sidebar.","zones":["Center-left rectangular image overlapping a lower-right solid color text card, flanked by a minimalist left sidebar."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["staggered-cards","overlap","profile"],"avoid":["Dense lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Key concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-left-image","purpose":"Primary visual anchor","bbox":[0.22,0.15,0.28,0.65],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left white column with text, right full-bleed image, united by a solid horizontal text box spanning the lower third.","zones":["Left white column with text, right full-bleed image, united by a solid horizontal text box spanning the lower third."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["split-screen","bridging-box","half-bleed"],"avoid":["Multi-chart comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Narrative slides"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-half-bleed","purpose":"Atmospheric right-side image","bbox":[0.45,0.0,0.55,1.0],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Three-column structure: left white column for quotes, center square image, right solid dark block with an interactive-style outlined button.","zones":["Three-column structure: left white column for quotes, center square image, right solid dark block with an interactive-style outlined button."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["three-column","quote","button-callout"],"avoid":["Detailed statistical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Calls to action","Core value statements"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"center-square","purpose":"Subject portrait or product detail","bbox":[0.32,0.25,0.36,0.55],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Perfect 50/50 vertical split. Left side is a full-height image, right side is a solid dark panel with centered closing text and decorative script.","zones":["Perfect 50/50 vertical split. Left side is a full-height image, right side is a solid dark panel with centered closing text and decorative script."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic botanical shadow overlays on negative space","Three-diamond (◆ ◆ ◆) decorative motifs","Overlapping solid color cards and photographic blocks"],"optional_variants":["50-50-split","high-contrast","closing-screen"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information","Final quotes"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-image","purpose":"Final memorable visual","bbox":[0.0,0.0,0.5,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should feature moody, desaturated, or earthy tones to match the Morandi palette.
- Use sharp rectangular framing or full-bleed edge alignment.
- Layer solid colored text boxes partially over the images.

【图标与装饰】
- Minimalist. Use three small, rust-colored diamonds in a horizontal row to denote section headers or important callouts.

【数据页构图】
- Center-left rectangular image overlapping a lower-right solid color text card, flanked by a minimalist left sidebar.

【图表风格】
- No charts present; rely on high-impact photography and text blocking for data presentation.

【章节页构图】
- Horizontal split: upper half white space with structured text and quotes, lower half occupied entirely by a full-width image.

【收尾页构图】
- Perfect 50/50 vertical split. Left side is a full-height image, right side is a solid dark panel with centered closing text and decorative script.

【禁止】
- Avoid rounded corners on images or shapes.
- Do not use drop shadows on elements; rely on the organic lighting overlays and flat overlaps for depth.
- Avoid bright, saturated, or neon colors that break the muted Morandi aesthetic.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Photography portfolios、Fashion or editorial lookbooks、Lifestyle brand decks、Moodboards and creative pitches。
