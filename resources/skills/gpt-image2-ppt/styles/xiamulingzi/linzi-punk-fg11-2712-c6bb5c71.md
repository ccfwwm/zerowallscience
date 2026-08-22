# 2712 · FG11【朋克酷风】 / linzi-punk-fg11-2712-c6bb5c71

## 风格ID
linzi-punk-fg11-2712-c6bb5c71

## 风格名称
2712 · FG11【朋克酷风】 / linzi-punk-fg11-2712-c6bb5c71

## 风格描述
A striking brutalist urban template featuring oversized typography, stark geometric color blocking, and high-contrast neon/cyberpunk photographic integrations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Black and white form the brutalist core, punctuated by vibrant warning reds/oranges and deep moody blues.
- fonts: Ultra-bold sans-serif for primary display headers (often all-caps); clean, readable sans-serif for secondary details.
- spacing: Extreme scale contrast; massive leading/tracking in background typographic textures, paired with tightly boxed textual components.
- shape_language: Strictly orthogonal with occasional harsh diagonal splits; devoid of soft radiuses or organic curves.
- texture: Flat, untextured digital solids contrasted against heavily textured/grained or neon-lit photography.
- grid: A mix of symmetrical triptychs/split-screens and highly asymmetrical masonry collages.
- motion_or_depth: Depth is created entirely through extreme 2D overlap (massive text masking images) rather than soft shadows, except for stylized solid block drop-shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「2712 · FG11【朋克酷风】 / linzi-punk-fg11-2712-c6bb5c71」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A striking brutalist urban template featuring oversized typography, stark geometric color blocking, and high-contrast neon/cyberpunk photographic integrations.
- 推荐配色：#000000、#FFFFFF、#E24430、#1E2A40、#C8C8C8

【不可丢失的风格锚点】
- Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery
- Rigid rectangular structural layouts with stark split-screen or masonry arrangements
- Vertical margin text used as a framing device
- High-contrast, saturated 'neon' or duotone image treatments

【字体】
- Scale text up until it breaks container boundaries for visual impact.
- Rotate secondary typographic labels 90 degrees to frame the outer edges of the slide.
- Repeat identical lines of text to create a structural background pattern.
- Employ extreme scale contrast between colossal headers and minimal body copy.

【封面页构图】
- Central rectangular hero image flanked by massive, bleeding top/bottom headers and vertically rotated margin text, punctuated by a circular overlay badge.

【内容页构图】
- Hard 50/50 vertical split with solid vivid color on one side (containing centered text) and a white side featuring two asymmetrical image blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central rectangular hero image flanked by massive, bleeding top/bottom headers and vertically rotated margin text, punctuated by a circular overlay badge.","zones":["Central rectangular hero image flanked by massive, bleeding top/bottom headers and vertically rotated margin text, punctuated by a circular overlay badge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery","Rigid rectangular structural layouts with stark split-screen or masonry arrangements","Vertical margin text used as a framing device"],"optional_variants":["hero-image","oversized-text","framed-layout"],"avoid":["Detailed content","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section heroes"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_center","purpose":"Main structural focal point","bbox":[0.1,0.16,0.8,0.68],"priority":1}]}
- section: {"id":"section-primary","composition":"Left-aligned portrait image heavily masked by staggered oversized text, with a large folio number and minimal paragraph text on the right.","zones":["Left-aligned portrait image heavily masked by staggered oversized text, with a large folio number and minimal paragraph text on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery","Rigid rectangular structural layouts with stark split-screen or masonry arrangements","Vertical margin text used as a framing device"],"optional_variants":["text-mask","asymmetrical","dark-mode"],"avoid":["Heavy body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_portrait","purpose":"Textural background for header","bbox":[0.05,0.08,0.35,0.84],"priority":1}]}
- content: [{"id":"content-content","composition":"Hard 50/50 vertical split with solid vivid color on one side (containing centered text) and a white side featuring two asymmetrical image blocks.","zones":["Hard 50/50 vertical split with solid vivid color on one side (containing centered text) and a white side featuring two asymmetrical image blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery","Rigid rectangular structural layouts with stark split-screen or masonry arrangements","Vertical margin text used as a framing device"],"optional_variants":["split-screen","dual-image","high-contrast"],"avoid":["Single continuous narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Dual concepts","Product/feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top_right_portrait","purpose":"Secondary imagery","bbox":[0.67,0.08,0.18,0.45],"priority":1},{"id":"bottom_right_landscape","purpose":"Tertiary imagery","bbox":[0.58,0.68,0.34,0.32],"priority":2}]},{"id":"content-comparison","composition":"Three equally sized vertical image panels spanning the width, anchored entirely by a massive 3D-extruded word spanning the bottom.","zones":["Three equally sized vertical image panels spanning the width, anchored entirely by a massive 3D-extruded word spanning the bottom."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery","Rigid rectangular structural layouts with stark split-screen or masonry arrangements","Vertical margin text used as a framing device"],"optional_variants":["triptych","3d-text","image-columns"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Gallery","Core values/pillars"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left_column","purpose":"Triptych part 1","bbox":[0.08,0.05,0.26,0.75],"priority":1},{"id":"center_column","purpose":"Triptych part 2","bbox":[0.36,0.05,0.28,0.75],"priority":2},{"id":"right_column","purpose":"Triptych part 3","bbox":[0.66,0.05,0.26,0.75],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned portrait image heavily masked by staggered oversized text, with a large folio number and minimal paragraph text on the right.","zones":["Left-aligned portrait image heavily masked by staggered oversized text, with a large folio number and minimal paragraph text on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery","Rigid rectangular structural layouts with stark split-screen or masonry arrangements","Vertical margin text used as a framing device"],"optional_variants":["text-mask","asymmetrical","dark-mode"],"avoid":["Heavy body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_portrait","purpose":"Textural background for header","bbox":[0.05,0.08,0.35,0.84],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Hard 50/50 vertical split with solid vivid color on one side (containing centered text) and a white side featuring two asymmetrical image blocks.","zones":["Hard 50/50 vertical split with solid vivid color on one side (containing centered text) and a white side featuring two asymmetrical image blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized bold sans-serif typography that bleeds off-canvas or heavily overlaps imagery","Rigid rectangular structural layouts with stark split-screen or masonry arrangements","Vertical margin text used as a framing device"],"optional_variants":["split-screen","dual-image","high-contrast"],"avoid":["Single continuous narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Dual concepts","Product/feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top_right_portrait","purpose":"Secondary imagery","bbox":[0.67,0.08,0.18,0.45],"priority":1},{"id":"bottom_right_landscape","purpose":"Tertiary imagery","bbox":[0.58,0.68,0.34,0.32],"priority":2}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Apply high-contrast color overlays or deep saturation (neon/cyberpunk aesthetics).
- Confine images to rigid rectangular slots without border styling.
- Allow images to be partially obscured by giant typographic elements.
- Use duotone/monochrome filtering when placing text directly over full-bleed images.

【图标与装饰】
- Use minimalist, uniform line-art icons arranged in strict, dense grids.
- Avoid multi-colored or highly illustrative icons; keep them starkly monochromatic.

【数据页构图】
- Left-aligned portrait image heavily masked by staggered oversized text, with a large folio number and minimal paragraph text on the right.

【图表风格】
- Data visualization is not natively present, but should rely on bold typographic data points (large numbers) and stark rectangular bar forms if needed.

【章节页构图】
- Left-aligned portrait image heavily masked by staggered oversized text, with a large folio number and minimal paragraph text on the right.

【收尾页构图】
- Central rectangular hero image flanked by massive, bleeding top/bottom headers and vertically rotated margin text, punctuated by a circular overlay badge.

【禁止】
- Soft rounded corners or circular image masks (except graphic badges).
- Pastel or muted, low-contrast color palettes.
- Delicate serif or script typography.
- Realistic, soft drop shadows.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Edgy fashion lookbooks or streetwear brand pitches.、Creative agency portfolios showcasing bold design.、Music festival or urban event decks.、Youth-oriented tech product mockups.。
