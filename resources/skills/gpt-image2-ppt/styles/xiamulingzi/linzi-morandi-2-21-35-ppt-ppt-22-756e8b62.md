# 莫兰迪风格PPT (22) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-22-756e8b62

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-22-756e8b62

## 风格名称
莫兰迪风格PPT (22) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-22-756e8b62

## 风格描述
Editorial-style presentation featuring a Morandi color palette, split-screen layouts, asymmetrical overlaps, and high-contrast typography mixing serif and sans-serif.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted warm taupe as primary structural blocks, pure white for negative space, very dark brown for high-contrast text.
- fonts: Elegant transitional serif for display elements, clean geometric sans-serif for body copy.
- spacing: Generous asymmetrical whitespace, elements frequently bridge across column gutters.
- shape_language: Strictly sharp rectangles, solid flat color fills without gradients.
- texture: Contrast between perfectly flat matte color blocks and highly textured photographic elements.
- grid: Two-column asymmetric splits (often 40/60 or 50/50), occasionally shifting to center-aligned collages.
- motion_or_depth: Flat 2.5D stacking with strict Z-index rules: Image Base -> Solid Color Block -> Typography Layer.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (22) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-22-756e8b62」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial-style presentation featuring a Morandi color palette, split-screen layouts, asymmetrical overlaps, and high-contrast typography mixing serif and sans-serif.
- 推荐配色：#A38E82、#FFFFFF、#2A2421、#F1CCD0、#E8E0DA

【不可丢失的风格锚点】
- Muted earth-tone color blocks overlapping with edge-to-edge photography
- Extreme scale contrast between oversized display text and small body copy
- Asymmetrical split layouts with intentional grid-breaking text elements
- Vertical rotated text used as structural framing elements

【字体】
- Display text is set extremely large, sometimes split arbitrarily across multiple lines for graphic effect.
- Body copy is kept small and tightly grouped to maximize negative space.
- Rotated text used for secondary navigation or stylistic labeling on the extreme left margin.

【封面页构图】
- Full-bleed background image with centrally aligned, oversized display typography layered over a smaller subtitle.

【内容页构图】
- Left-half image spanning top to bottom, intersected by a small colored rectangular anchor that bridges the image and right-side text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with centrally aligned, oversized display typography layered over a smaller subtitle.","zones":["Full-bleed background image with centrally aligned, oversized display typography layered over a smaller subtitle."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["full-bleed","hero-title","centered"],"avoid":["Detailed subtitles or subtitle blocks requiring multiple sentences","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact title introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-hero","purpose":"Full bleed atmospheric background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Left-aligned circular or square image element with dramatically enlarged, vertically stacked display text on the right.","zones":["Left-aligned circular or square image element with dramatically enlarged, vertically stacked display text on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["split-typography","minimal-section","asymmetric"],"avoid":["Standard bulleted content or long section titles","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions with very short titles"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"accent-img-1","purpose":"Product or texture accent","bbox":[0.1,0.2,0.3,0.6],"priority":1}]}
- content: [{"id":"content-content","composition":"Left-half image spanning top to bottom, intersected by a small colored rectangular anchor that bridges the image and right-side text.","zones":["Left-half image spanning top to bottom, intersected by a small colored rectangular anchor that bridges the image and right-side text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["split-screen","bridged-layout","profile"],"avoid":["Data-heavy lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction paragraphs","Creator bios"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"half-bleed-left","purpose":"Primary subject portrait or detail","bbox":[0,0,0.5,1],"priority":1}]},{"id":"content-comparison","composition":"Narrow left vertical color stripe, white text zone, and a large right-side full-height image.","zones":["Narrow left vertical color stripe, white text zone, and a large right-side full-height image."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["image-right","vertical-stripe","loose-text"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Key value propositions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"half-bleed-right","purpose":"Atmospheric lifestyle image","bbox":[0.4,0,0.6,1],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned circular or square image element with dramatically enlarged, vertically stacked display text on the right.","zones":["Left-aligned circular or square image element with dramatically enlarged, vertically stacked display text on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["split-typography","minimal-section","asymmetric"],"avoid":["Standard bulleted content or long section titles","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions with very short titles"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"accent-img-1","purpose":"Product or texture accent","bbox":[0.1,0.2,0.3,0.6],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-half image spanning top to bottom, intersected by a small colored rectangular anchor that bridges the image and right-side text.","zones":["Left-half image spanning top to bottom, intersected by a small colored rectangular anchor that bridges the image and right-side text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["split-screen","bridged-layout","profile"],"avoid":["Data-heavy lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction paragraphs","Creator bios"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"half-bleed-left","purpose":"Primary subject portrait or detail","bbox":[0,0,0.5,1],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background image with massive centered typography bisected by a small horizontal line, and an outlined box at the bottom.","zones":["Full-bleed background image with massive centered typography bisected by a small horizontal line, and an outlined box at the bottom."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earth-tone color blocks overlapping with edge-to-edge photography","Extreme scale contrast between oversized display text and small body copy","Asymmetrical split layouts with intentional grid-breaking text elements"],"optional_variants":["full-bleed","closing","centered-outlined-box"],"avoid":["Detailed contact lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing statements","Contact slides"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-closing","purpose":"Full bleed atmospheric background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used either as edge-to-edge full bleeds or cropped strictly into sharp rectangles.
- No borders, shadows, or rounded corners applied to images.
- Images often serve as background layers for solid color blocks to overlap.

【图标与装饰】
- Lightweight, uniform line-art icons aligned horizontally in specific content blocks.

【数据页构图】
- Left-aligned circular or square image element with dramatically enlarged, vertically stacked display text on the right.

【图表风格】
- No traditional data charts present; data/concepts conveyed through textual hierarchy and layout.

【章节页构图】
- Left-aligned circular or square image element with dramatically enlarged, vertically stacked display text on the right.

【收尾页构图】
- Full-bleed background image with massive centered typography bisected by a small horizontal line, and an outlined box at the bottom.

【禁止】
- Avoid rounded corners on any element.
- Do not use drop shadows or 3D effects.
- Prevent light text from overlapping textured or light image areas without a solid backing block.
- Avoid dense, long-form paragraphs that break the minimalist editorial aesthetic.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or beauty brand lookbooks、Design agency portfolios、Highly visual lifestyle pitch decks、Concept mood boards。
