# 精选科技风12 · 模板 / linzi-tech-12-225a84ec

## 风格ID
linzi-tech-12-225a84ec

## 风格名称
精选科技风12 · 模板 / linzi-tech-12-225a84ec

## 风格描述
Dark-mode, sci-fi inspired presentation template featuring vibrant neon gradients, glassmorphic cards, and large spherical/organic focal elements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary void black background, vivid purple/blue gradients for primary components, pure white for high-hierarchy text, translucent dark charcoal for glass panels.
- fonts: Bold, wide geometric sans-serif for numbers and headers; clean, neutral sans-serif for body copy.
- spacing: Generous internal padding within cards (approx 24-32px equivalent), wide horizontal margins between columns.
- shape_language: Heavy reliance on heavily rounded rectangles (pill-like or 20px+ radius), perfect circles for icons/avatars, and organic/spherical background silhouettes.
- texture: Frosted glass (glassmorphism) with subtle dot-matrix patterns overlaying vivid gradients.
- grid: Symmetrical centered layouts, primarily utilizing 2-column, 3-column, and 4-column balanced card grids.
- motion_or_depth: High depth achieved through foreground organic silhouettes, mid-ground text/cards, and deep background starry environments.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风12 · 模板 / linzi-tech-12-225a84ec」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Dark-mode, sci-fi inspired presentation template featuring vibrant neon gradients, glassmorphic cards, and large spherical/organic focal elements.
- 推荐配色：#050508、#7B2CBF、#007BFF、#FFFFFF、#333333

【不可丢失的风格锚点】
- Deep space/dark void backgrounds paired with high-contrast neon highlights
- Translucent 'glass' cards with thin glowing strokes
- Vibrant purple-to-blue color transitions in shapes and typography
- Oversized geometric typography interacting with spherical/organic background elements

【字体】
- Headers use uppercase, extra-bold geometric sans-serif, often colored pure white for contrast.
- Numbers and section indicators are massively oversized, acting as structural graphic elements.
- Body text uses lighter weights and slightly muted white/grey to establish hierarchy.

【封面页构图】
- Center-aligned massive typography overlaid on a central spherical graphic, grounded by a heavy organic silhouette at the bottom edge.

【内容页构图】
- Triangular central focal node with radiating text clusters anchored by simple line icons.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned massive typography overlaid on a central spherical graphic, grounded by a heavy organic silhouette at the bottom edge.","zones":["Center-aligned massive typography overlaid on a central spherical graphic, grounded by a heavy organic silhouette at the bottom edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["cinematic-cover","centered-hero","organic-anchor"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Event openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Massive central organic graphic acting as a physical shelf for oversized section numbers and text.","zones":["Massive central organic graphic acting as a physical shelf for oversized section numbers and text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["hero-graphic","section-divider","oversized-type"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-05"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Triangular central focal node with radiating text clusters anchored by simple line icons.","zones":["Triangular central focal node with radiating text clusters anchored by simple line icons."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["radial-layout","central-node","diagrammatic"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Core concepts","Pillar models"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Two-column layout with large, vivid gradient cards. Cards feature internal vertical splits for metric highlights and descriptive text.","zones":["Two-column layout with large, vivid gradient cards. Cards feature internal vertical splits for metric highlights and descriptive text."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["two-column","gradient-cards","metric-focus"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Metric highlights","Feature comparisons"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Triangular central focal node with radiating text clusters anchored by simple line icons.","zones":["Triangular central focal node with radiating text clusters anchored by simple line icons."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["radial-layout","central-node","diagrammatic"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Core concepts","Pillar models"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Two-column layout with large, vivid gradient cards. Cards feature internal vertical splits for metric highlights and descriptive text.","zones":["Two-column layout with large, vivid gradient cards. Cards feature internal vertical splits for metric highlights and descriptive text."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["two-column","gradient-cards","metric-focus"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Metric highlights","Feature comparisons"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Center-aligned vibrant gradient typography framed heavily by a dark organic vignette bordering the edges of the slide.","zones":["Center-aligned vibrant gradient typography framed heavily by a dark organic vignette bordering the edges of the slide."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Deep space/dark void backgrounds paired with high-contrast neon highlights","Translucent 'glass' cards with thin glowing strokes","Vibrant purple-to-blue color transitions in shapes and typography"],"optional_variants":["closing-slide","vignette-frame","gradient-text"],"avoid":["Any content requiring reading","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Final remarks"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Avatars are cropped into perfect circles and overlaid on vibrant gradient backdrops.
- Supporting images are housed in large rounded rectangles with generous corner radii to match the card shapes.
- Background imagery is dark, high-contrast, and often features a vignette effect to center focus.

【图标与装饰】
- Minimalist, thin-line white geometric icons.
- Icons are frequently housed within gradient-filled circles or act as standalone anchors at the top of cards.

【数据页构图】
- Triangular central focal node with radiating text clusters anchored by simple line icons.

【图表风格】
- No traditional data charts present; metrics are displayed as oversized typographic callouts within partitioned cards.

【章节页构图】
- Massive central organic graphic acting as a physical shelf for oversized section numbers and text.

【收尾页构图】
- Center-aligned vibrant gradient typography framed heavily by a dark organic vignette bordering the edges of the slide.

【禁止】
- Avoid flat, opaque light backgrounds which break the neon/dark-mode aesthetic.
- Do not use sharp right angles for content containers; always use large border radii.
- Avoid low-contrast text on bright neon gradients.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Tech startup pitch decks、Web3, crypto, or futuristic technology presentations、High-impact keynote intros requiring a cinematic, dark-mode vibe。
