# 2707 · FG11【朋克酷风】 / linzi-punk-fg11-2707-1dee59f0

## 风格ID
linzi-punk-fg11-2707-1dee59f0

## 风格名称
2707 · FG11【朋克酷风】 / linzi-punk-fg11-2707-1dee59f0

## 风格描述
A dark-mode brutalist presentation template featuring high-contrast neon accents, oversized typography, visible grid lines, and text-as-texture techniques.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background is near-black, text is pure white. High-saturation orange-red and teal are used sparingly for emphasis, shapes, and glow effects.
- fonts: Bold, rigid grotesque sans-serif for main display elements; standard clean sans-serif for body. Relies heavily on uppercase.
- spacing: Unconventional margins; elements frequently bleed off the edges or butt against structural grid lines.
- shape_language: Harsh rectangles, perfect circles, and diagonal graphic tape. Wireframe or outline treatments for icons and decorative elements.
- texture: Dense blocks of repeating text and heavy, blurred neon glows behind precise masks create texture.
- grid: Exposed, visible wireframe grid system using thin white dividers to create asymmetrical quadrants and strips.
- motion_or_depth: Flat overlapping layers (Z-index stacking) where transparent color blocks, floating text, and images intersect without drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「2707 · FG11【朋克酷风】 / linzi-punk-fg11-2707-1dee59f0」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A dark-mode brutalist presentation template featuring high-contrast neon accents, oversized typography, visible grid lines, and text-as-texture techniques.
- 推荐配色：#161616、#FFFFFF、#F43518、#299385

【不可丢失的风格锚点】
- Visible 1px thin grid lines defining asymmetrical structural panes
- Oversized, bold geometric sans-serif typography contrasting with micro-copy
- Repeating 'marquee' text bands used as borders or background textures
- Solid accent circles and transparent colored geometric overlays

【字体】
- Scale contrast is extreme; hero text is massive, supporting metadata is tiny.
- Use uppercase lettering for structural elements, headers, and decorative backgrounds.
- Allow oversized typography to be cropped by slide edges or wrap around circular masks.
- Utilize text rotation (90 degrees vertical) to create framing borders on the left or right edges.

【封面页构图】
- Asymmetrical grid layout with central oversized title, bottom ticker-tape text band, and floating outline icon

【内容页构图】
- Central circular image masked with a neon gradient glow, flanked by warped/curved text and floating shapes

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical grid layout with central oversized title, bottom ticker-tape text band, and floating outline icon","zones":["Asymmetrical grid layout with central oversized title, bottom ticker-tape text band, and floating outline icon"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["grid-based","marquee-text","high-contrast"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section openers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Minimal text layout with intersecting horizontal text blocks and a contrasting accent word","zones":["Minimal text layout with intersecting horizontal text blocks and a contrasting accent word"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["text-overlap","minimalist","typographic-focus"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Mission statements","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Central circular image masked with a neon gradient glow, flanked by warped/curved text and floating shapes","zones":["Central circular image masked with a neon gradient glow, flanked by warped/curved text and floating shapes"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["neon-glow","circular-mask","warped-text"],"avoid":["Standard body copy","copying source assets, source text, or an exact source arrangement"],"best_for":["Hero statements","Product or portrait showcase"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero_circle","purpose":"Showcase portrait or key visual","bbox":[0.5,0.5,0.35,0.6],"priority":1}]},{"id":"content-comparison","composition":"Tall rectangular central image intersected by diagonal transparent color bars, bordered by vertical text","zones":["Tall rectangular central image intersected by diagonal transparent color bars, bordered by vertical text"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["diagonal-overlay","vertical-text","portrait-layout"],"avoid":["Heavy data","Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Speaker introductions","Artist profiles","Event highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"profile_image","purpose":"Portrait of speaker/artist","bbox":[0.5,0.5,0.3,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Oversized central countdown/timer typography supported by a thin horizontal rule and minimal labels","zones":["Oversized central countdown/timer typography supported by a thin horizontal rule and minimal labels"],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["oversized-numbers","metric-display","minimalist-data"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Countdowns","Key metrics","Event schedules"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Full-bleed busy background image with huge floating typography and a horizontal connected-node timeline","zones":["Full-bleed busy background image with huge floating typography and a horizontal connected-node timeline"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["full-bleed","timeline-nodes","overlay-text"],"avoid":["Dense reading material","copying source assets, source text, or an exact source arrangement"],"best_for":["Schedules","Timelines","Agendas"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"background_ambient","purpose":"Atmospheric full bleed background","bbox":[0.5,0.5,1.0,1.0],"priority":1}]}]
- agenda: {"id":"agenda-primary","composition":"Full-bleed busy background image with huge floating typography and a horizontal connected-node timeline","zones":["Full-bleed busy background image with huge floating typography and a horizontal connected-node timeline"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Visible 1px thin grid lines defining asymmetrical structural panes","Oversized, bold geometric sans-serif typography contrasting with micro-copy","Repeating 'marquee' text bands used as borders or background textures"],"optional_variants":["full-bleed","timeline-nodes","overlay-text"],"avoid":["Dense reading material","copying source assets, source text, or an exact source arrangement"],"best_for":["Schedules","Timelines","Agendas"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"background_ambient","purpose":"Atmospheric full bleed background","bbox":[0.5,0.5,1.0,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Mask images in strict geometric shapes (circles, tall rectangles) or use as full-bleed backgrounds.
- Apply harsh color gradients, neon outer glows, or semi-transparent colored overlays to integrate photos into the dark palette.
- Embrace raw, high-contrast, nighttime, or neon-lit photographic styles.

【图标与装饰】
- Icons must be strictly 1px thin white lines.
- Favor abstract, geometric, or surreal iconography over literal or corporate symbols.
- Integrate icons directly onto grid intersections or use them as floating isolated elements with massive negative space.

【数据页构图】
- Oversized central countdown/timer typography supported by a thin horizontal rule and minimal labels

【图表风格】
- Replace standard charts with oversized typographic data points or horizontal node-based timelines.

【章节页构图】
- Minimal text layout with intersecting horizontal text blocks and a contrasting accent word

【收尾页构图】
- Asymmetrical grid layout with central oversized title, bottom ticker-tape text band, and floating outline icon

【禁止】
- Avoid soft drop shadows or 3D bevels.
- Do not use light backgrounds or low-contrast text.
- Avoid standard bullet points; use grid panes or spatial separation instead.
- Avoid overly corporate or bright daylight stock photography.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios、Music festival or event pitches、Fashion or streetwear lookbooks、Edgy technology or agency credentials。
