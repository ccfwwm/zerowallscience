# 37 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-37-eb89a2db

## 风格ID
linzi-morandi-2-21-ppt-ppt-37-eb89a2db

## 风格名称
37 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-37-eb89a2db

## 风格描述
A modern, minimalist presentation template featuring a muted Morandi color palette, organic fluid shapes, and elegant typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Warm off-white background with bold overlapping shapes in sage green, pale peach, and dark charcoal. Text primarily uses dark charcoal for high contrast.
- fonts: Clean geometric sans-serif, using medium weights for primary headers (in accent colors) and regular weights for body text.
- spacing: Generous interior margins. Corner-anchored graphics naturally push and frame content toward the center or active columns.
- shape_language: Amorphous, fluid 'blob' graphics with smooth curves. Strict circles used for icons and image masks.
- texture: Mostly flat vector colors accented by thin, textured white dry-brush strokes following the contours of the shapes.
- grid: Open and flexible. Mixes center-weighted single columns with 50/50 splits and asymmetrical masonry grids.
- motion_or_depth: Flat design with depth implied only through the overlapping of opaque shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「37 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-37-eb89a2db」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, minimalist presentation template featuring a muted Morandi color palette, organic fluid shapes, and elegant typography.
- 推荐配色：#F8F6F4、#6D867C、#D8B29C、#423837

【不可丢失的风格锚点】
- Muted sage, peach, and charcoal color scheme
- Organic, fluid overlapping blob shapes
- Subtle distressed chalk/brush strokes as accents
- Asymmetrical, diagonal corner framing

【字体】
- Headings use the sage green or dark charcoal color, often left-aligned with a vertical divider line.
- Body text is dark charcoal, set with generous line height for readability.
- Hierarchy is established through color and scale rather than heavy font weights.

【封面页构图】
- Diagonal organic framing with center-left aligned title block

【内容页构图】
- Two-column split: left text and list, right vertical image

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Diagonal organic framing with center-left aligned title block","zones":["Diagonal organic framing with center-left aligned title block"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["title-slide","blob-frame","minimal"],"avoid":["Data visualization","Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section headers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Minimalist center-left section title with diagonal blob framing","zones":["Minimalist center-left section title with diagonal blob framing"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["section-divider","text-only","framed"],"avoid":["Content-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Transition slides"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Two-column split: left text and list, right vertical image","zones":["Two-column split: left text and list, right vertical image"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["split-layout","image-right","icon-list"],"avoid":["Full screen data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product highlights","Case studies"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-vertical-image","purpose":"Primary visual context for the slide","bbox":[0.63,0.26,0.28,0.65],"priority":1}]},{"id":"content-comparison","composition":"Left text column paired with a right-side asymmetrical masonry image grid","zones":["Left text column paired with a right-side asymmetrical masonry image grid"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["masonry-grid","gallery","split-layout"],"avoid":["Single focus points","Detailed charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Mood boards","Portfolio galleries","Project summaries"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"gallery-top-left","purpose":"Gallery image","bbox":[0.4,0.23,0.29,0.34],"priority":1},{"id":"gallery-bottom-left","purpose":"Gallery image","bbox":[0.4,0.59,0.21,0.34],"priority":2},{"id":"gallery-bottom-right","purpose":"Gallery image","bbox":[0.62,0.59,0.3,0.34],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Curved U-shape timeline with alternating circular nodes","zones":["Curved U-shape timeline with alternating circular nodes"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["process-curve","timeline","nodes"],"avoid":["Complex quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Milestones"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Minimalist center-left section title with diagonal blob framing","zones":["Minimalist center-left section title with diagonal blob framing"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["section-divider","text-only","framed"],"avoid":["Content-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Transition slides"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Heavy top-right asymmetrical blob cluster with bottom-left text block","zones":["Heavy top-right asymmetrical blob cluster with bottom-left text block"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted sage, peach, and charcoal color scheme","Organic, fluid overlapping blob shapes","Subtle distressed chalk/brush strokes as accents"],"optional_variants":["closing-slide","asymmetrical-heavy","farewell"],"avoid":["Detailed content","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are placed in strict rectangles or perfect circles to contrast with the organic background shapes.
- Gallery layouts use tight masonry grids with minimal gutters.
- Some circular images feature a thin accent-color border.

【图标与装饰】
- Flat, minimalist white icons placed centrally inside solid accent-color circles.
- Used systematically for lists, branching diagrams, and supplementary data points.

【数据页构图】
- Curved U-shape timeline with alternating circular nodes

【图表风格】
- Process flows use curved, dashed lines connecting circular nodes.
- Branching diagrams use thin, straight solid lines radiating from a central focal point.

【章节页构图】
- Minimalist center-left section title with diagonal blob framing

【收尾页构图】
- Heavy top-right asymmetrical blob cluster with bottom-left text block

【禁止】
- Avoid sharp, rigid geometric background shapes (squares/triangles) that clash with the fluid aesthetic.
- Do not use highly saturated primary colors; stick to muted/desaturated tones.
- Avoid dense walls of text; maintain the airy, minimalist feel.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Annual reviews and strategic summaries、Design mood boards、Soft-skills training modules。
