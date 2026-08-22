# 63 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-63-dea7cee2

## 风格ID
linzi-morandi-2-21-ppt-ppt-63-dea7cee2

## 风格名称
63 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-63-dea7cee2

## 风格描述
An editorial-style presentation featuring high contrast, ultra-bold typography, asymmetrical layouts, and floating shadow cards.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominate, contrasted by dark charcoal blocks. A muted camel/tan acts as a precise accent for active states, buttons, and typographic highlights.
- fonts: Primary headings use an ultra-chunky, bold sans-serif. Body copy utilizes a clean, geometric sans-serif for legibility.
- spacing: Generous white space, particularly around primary headings. Padding within floating cards is uniform and structured.
- shape_language: Strictly rectilinear. Sharp corners on all blocks, images, and cards. No rounded elements.
- texture: Clean, flat surfaces juxtaposed with soft, large-radius drop shadows to create a layered, multi-planar effect.
- grid: Asymmetrical column grids (often 40/60 or 30/70 splits). Leftward bias for anchor elements.
- motion_or_depth: Depth is heavily relied upon, using overlapping elements and z-axis shadow elevation to distinguish active or highlighted content from the background.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「63 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-63-dea7cee2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial-style presentation featuring high contrast, ultra-bold typography, asymmetrical layouts, and floating shadow cards.
- 推荐配色：#FFFFFF、#303030、#C19B76、#F4F4F4

【不可丢失的风格锚点】
- Ultra-bold, oversized sans-serif typography for primary headings.
- Persistent rotated marginalia and branding on the extreme left edge.
- Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth.
- Selective inline text coloring (accenting single syllables or letters within a word).

【字体】
- Headings must be extremely heavy/bold, set in lowercase or sentence case.
- Use the accent color to highlight specific letters or syllables within large single-word headings for visual interest.
- Body text should remain low-contrast (medium gray) against white backgrounds to maintain hierarchy.
- Maintain strict left alignment for primary text blocks.

【封面页构图】
- Asymmetrical split with massive left typography, bottom-left accent block, and large right-side image.

【内容页构图】
- Top abstract texture, left-aligned title, and a bottom row of items where the central item is a floating white shadow card.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with massive left typography, bottom-left accent block, and large right-side image.","zones":["Asymmetrical split with massive left typography, bottom-left accent block, and large right-side image."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["split-cover","editorial-hero","bold-type"],"avoid":["Dense data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major section transitions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_portrait","purpose":"Primary visual anchor","bbox":[0.41,0.0,0.59,0.89],"priority":1}]}
- section: {"id":"section-primary","composition":"Top cropped image, massive left-aligned title with inline color, and a bottom 2x2 content grid featuring one colored accent card.","zones":["Top cropped image, massive left-aligned title with inline color, and a bottom 2x2 content grid featuring one colored accent card."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["top-image","accent-card","2x2-grid"],"avoid":["Sequential timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Core principles"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"top_banner","purpose":"Contextual texture","bbox":[0.2,0.0,0.6,0.28],"priority":2}]}
- content: [{"id":"content-content","composition":"Top abstract texture, left-aligned title, and a bottom row of items where the central item is a floating white shadow card.","zones":["Top abstract texture, left-aligned title, and a bottom row of items where the central item is a floating white shadow card."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["floating-card","top-texture","horizontal-row"],"avoid":["Large bodies of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Service pillars","Value propositions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top_texture","purpose":"Abstract background element","bbox":[0.4,0.0,0.6,0.28],"priority":2}]},{"id":"content-comparison","composition":"50/50 vertical split (light/dark backgrounds) with overlapping image blocks and text on both sides, plus a central interactive-style button.","zones":["50/50 vertical split (light/dark backgrounds) with overlapping image blocks and text on both sides, plus a central interactive-style button."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["split-background","dual-image","comparison"],"avoid":["Single, unified messages","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Dual narratives","Case studies"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left_image","purpose":"First concept visual","bbox":[0.13,0.09,0.25,0.55],"priority":1},{"id":"right_image","purpose":"Second concept visual","bbox":[0.5,0.09,0.25,0.55],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Large central map graphic with accented regions and a floating information card positioned in the bottom right.","zones":["Large central map graphic with accented regions and a floating information card positioned in the bottom right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["map-graphic","floating-insight","geographic"],"avoid":["Complex quantitative charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Geographic data","Global presence"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top cropped image, massive left-aligned title with inline color, and a bottom 2x2 content grid featuring one colored accent card.","zones":["Top cropped image, massive left-aligned title with inline color, and a bottom 2x2 content grid featuring one colored accent card."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["top-image","accent-card","2x2-grid"],"avoid":["Sequential timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Core principles"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"top_banner","purpose":"Contextual texture","bbox":[0.2,0.0,0.6,0.28],"priority":2}]}]
- closing: {"id":"closing-primary","composition":"Dark solid background, massive right-aligned closing typography, and a left-aligned quoted text block.","zones":["Dark solid background, massive right-aligned closing typography, and a left-aligned quoted text block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Ultra-bold, oversized sans-serif typography for primary headings.","Persistent rotated marginalia and branding on the extreme left edge.","Floating white or accent-colored rectangular cards with diffuse drop shadows creating z-depth."],"optional_variants":["dark-mode","massive-type","closing-slide"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Contact information","Final quotes"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should bleed to the edge when used as backgrounds or partial backgrounds.
- When placed within the layout, images use sharp rectangular crops with no border.
- Subjects cut out from their backgrounds work well when overlapping solid color blocks.

【图标与装饰】
- Icons are strictly linear, lightweight, and monochromatic (dark gray or black).
- They are used as consistent anchors above short text blocks in feature grids.

【数据页构图】
- Large central map graphic with accented regions and a floating information card positioned in the bottom right.

【图表风格】
- Data graphics (like maps) should use flat, light gray base colors with the primary accent color used for highlighted regions.
- Overlay data insights on floating shadow cards rather than embedding text directly into the graphic.

【章节页构图】
- Top cropped image, massive left-aligned title with inline color, and a bottom 2x2 content grid featuring one colored accent card.

【收尾页构图】
- Dark solid background, massive right-aligned closing typography, and a left-aligned quoted text block.

【禁止】
- Do not use rounded corners on any elements.
- Avoid center-aligned text for primary content; stick to the left-aligned grid.
- Do not outline shapes; rely on contrast and shadows for separation.
- Avoid highly saturated primary colors; stick to the muted, high-contrast palette.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or editorial lookbooks、Creative agency credentials、High-end product showcases、Modern corporate overviews requiring a design-forward aesthetic。
