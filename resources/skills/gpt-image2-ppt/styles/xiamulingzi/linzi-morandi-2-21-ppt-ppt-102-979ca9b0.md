# 102 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-102-979ca9b0

## 风格ID
linzi-morandi-2-21-ppt-ppt-102-979ca9b0

## 风格名称
102 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-102-979ca9b0

## 风格描述
A modern, academic presentation template featuring a soothing Morandi pastel color palette, organic wavy borders, and terrazzo speckle accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white/cream background (#F8F6F4) framed by muted sage green (#576F64), dusty mauve (#A78C84), and tan (#DBCAC0). Text uses a deep taupe/brown (#7D6C65).
- fonts: Rounded, clean sans-serif for primary headers to match the organic shape language, paired with simple geometric sans-serif for body copy.
- spacing: Generous central canvas area (approx 70% of slide) protected by consistent wavy margin intrusions.
- shape_language: Primarily organic and fluid for backgrounds; strictly geometric (circles, highly-rounded rectangles, hexagons) for functional content modules.
- texture: Flat vector color blocks mixed with a scattered terrazzo/confetti speckle pattern.
- grid: Flexible central staging area, often employing radial, split 60/40, or horizontal sequential alignments.
- motion_or_depth: Mostly flat layered background elements. Subtle drop shadows applied exclusively to focal UI elements like section numbers and primary timeline nodes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「102 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-102-979ca9b0」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, academic presentation template featuring a soothing Morandi pastel color palette, organic wavy borders, and terrazzo speckle accents.
- 推荐配色：#576F64、#A78C84、#DBCAC0、#F8F6F4、#7D6C65

【不可丢失的风格锚点】
- Organic, fluid, wavy color-blocked shapes framing the slide corners.
- Terrazzo-style speckled dots clustered primarily in the bottom-left corner.
- Elevated rounded-rectangle badges with soft drop shadows for section numbering.
- Delicate, minimalist outline icons centered in circular nodes.

【字体】
- Headings: Center-aligned on covers and section breaks; left-aligned with a subtitle on content slides.
- Body: Left-aligned, medium-to-low density, strong contrast against the cream background.
- Hierarchy: Distinct size jumps between titles, subtitles, and body text. Frequent use of all-caps for English subtitles.

【封面页构图】
- Center-aligned stacked title with an overarching circular crest icon, framed by fluid organic corner shapes and terrazzo speckles.

【内容页构图】
- Radial hexagonal diagram with a central core connected to 6 surrounding nodes via thick straight lines.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned stacked title with an overarching circular crest icon, framed by fluid organic corner shapes and terrazzo speckles.","zones":["Center-aligned stacked title with an overarching circular crest icon, framed by fluid organic corner shapes and terrazzo speckles."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["center-aligned","organic-frame","crest-icon"],"avoid":["Data-heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Presentation introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central horizontal grouping containing an elevated rounded square (for numbers) on the left and typography on the right.","zones":["Central horizontal grouping containing an elevated rounded square (for numbers) on the left and typography on the right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["section-break","elevated-badge","minimalist"],"avoid":["Body content","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section breaks"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Radial hexagonal diagram with a central core connected to 6 surrounding nodes via thick straight lines.","zones":["Radial hexagonal diagram with a central core connected to 6 surrounding nodes via thick straight lines."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["radial-diagram","hexagonal","hub-and-spoke"],"avoid":["Sequential timelines","Linear narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Ecosystem maps","Core feature breakdowns","Component analysis"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"content-comparison","composition":"Horizontal timeline with alternating top/bottom text nodes and a larger concluding node on the right.","zones":["Horizontal timeline with alternating top/bottom text nodes and a larger concluding node on the right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["horizontal-timeline","alternating-layout","milestones"],"avoid":["Hierarchical org charts","Data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Project roadmaps","Historical timelines","Process steps"],"evidence_pages":["page-05"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Split layout (60/40) with a line chart on the left and a vertical list of three icon-led items on the right.","zones":["Split layout (60/40) with a line chart on the left and a vertical list of three icon-led items on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["split-layout","line-chart","vertical-list"],"avoid":["Dense text paragraphs","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend analysis","Data with key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central horizontal grouping containing an elevated rounded square (for numbers) on the left and typography on the right.","zones":["Central horizontal grouping containing an elevated rounded square (for numbers) on the left and typography on the right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["section-break","elevated-badge","minimalist"],"avoid":["Body content","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section breaks"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Center-aligned closing message with a top crest icon, framed by fluid organic corner shapes and terrazzo speckles, matching the cover.","zones":["Center-aligned closing message with a top crest icon, framed by fluid organic corner shapes and terrazzo speckles, matching the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, fluid, wavy color-blocked shapes framing the slide corners.","Terrazzo-style speckled dots clustered primarily in the bottom-left corner.","Elevated rounded-rectangle badges with soft drop shadows for section numbering."],"optional_variants":["bookend","center-aligned","closing"],"avoid":["Content presentation","Data analysis","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A slides","Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- No photographic placeholders are used; the template relies entirely on vector illustrations, icons, and typography.

【图标与装饰】
- Monoline outline icons, typically white when placed inside colored circular nodes, or taupe when placed on the background.

【数据页构图】
- Split layout (60/40) with a line chart on the left and a vertical list of three icon-led items on the right.

【图表风格】
- Minimalist structural lines without heavy grids.
- Radial progress indicators use segmented circular spokes.
- Data points on line charts are marked with simple solid circles.

【章节页构图】
- Central horizontal grouping containing an elevated rounded square (for numbers) on the left and typography on the right.

【收尾页构图】
- Center-aligned closing message with a top crest icon, framed by fluid organic corner shapes and terrazzo speckles, matching the cover.

【禁止】
- Avoid sharp, rigid rectangular borders which clash with the organic fluid shapes.
- Avoid high-saturation primary colors; stick to muted, pastel, or earthy tones.
- Do not clutter the corner regions, as they are reserved for the wavy framing elements.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic defense presentations、Creative portfolio introductions、Soft-skills training modules、Wellness or lifestyle brand pitches。
