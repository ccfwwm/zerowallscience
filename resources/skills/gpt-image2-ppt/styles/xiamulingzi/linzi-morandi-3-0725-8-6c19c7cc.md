# 8 · 3.07更新高级色25 / linzi-morandi-3-0725-8-6c19c7cc

## 风格ID
linzi-morandi-3-0725-8-6c19c7cc

## 风格名称
8 · 3.07更新高级色25 / linzi-morandi-3-0725-8-6c19c7cc

## 风格描述
A soft, elegant presentation featuring a Morandi color palette, fluid organic background shapes, and floating white content cards with soft drop shadows.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted blue and dusty pink primary accents, terracotta highlights, dark slate-blue text on white/off-white backgrounds.
- fonts: Clean sans-serif, medium weight for headings, regular for body, exclusively colored in slate blue.
- spacing: Generous outer padding framing the central white content card; well-distributed internal margins for text columns.
- shape_language: Organic fluid blobs for backgrounds; heavily rounded rectangles for cards and badges; geometric circles for icons.
- texture: Flat colors with subtle, soft drop shadows on main content cards to create floating 2.5D depth.
- grid: Container-based layout (card within slide). Interior grids range from 2-column splits to 4-column horizontal flows.
- motion_or_depth: Depth achieved by floating a pristine white content card over an edge-to-edge organic patterned background.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「8 · 3.07更新高级色25 / linzi-morandi-3-0725-8-6c19c7cc」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A soft, elegant presentation featuring a Morandi color palette, fluid organic background shapes, and floating white content cards with soft drop shadows.
- 推荐配色：#9CA6B5、#E8DADA、#D08C5C、#66759E、#F7F7F7、#FFFFFF

【不可丢失的风格锚点】
- Fluid organic background blobs overlapping the corners
- Central white content card with prominent rounded corners and soft drop shadow
- Terracotta circular bullet/header accent on content cards
- Slate blue typography instead of black or dark gray

【字体】
- Avoid pure black; use dark slate blue (#66759E) for all text to maintain soft contrast.
- Use small capsule-shaped background badges for supertitles or meta-tags.
- Maintain high line-height for body text to emphasize airy, elegant aesthetic.

【封面页构图】
- Centered text block flanked by fluid corner organic shapes

【内容页构图】
- Left image slot, right stacked numbered list with circular badges

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered text block flanked by fluid corner organic shapes","zones":["Centered text block flanked by fluid corner organic shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["cover-slide","fluid-background","minimalist-title"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left text column, right interlocking branched arrows pointing right","zones":["Left text column, right interlocking branched arrows pointing right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["branched-arrows","two-column","flow-diagram"],"avoid":["Extensive paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process overviews","Options or pathways","Input/Output flows"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left image slot, right stacked numbered list with circular badges","zones":["Left image slot, right stacked numbered list with circular badges"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["image-left","numbered-list","two-column"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Product feature highlights","Agenda summaries","Image-accompanied lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-left","purpose":"Contextual visual representation","bbox":[0.08,0.3,0.41,0.49],"priority":1}]},{"id":"content-comparison","composition":"Staggered text blocks around a bottom-center image slot","zones":["Staggered text blocks around a bottom-center image slot"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["staggered-layout","image-center-bottom","multi-block"],"avoid":["Sequential process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Case study intros","Portfolio showcases","Feature highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"hero-bottom","purpose":"Supporting visual feature","bbox":[0.36,0.5,0.26,0.31],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left pie chart with thin leader lines extending to right-side stacked text blocks","zones":["Left pie chart with thin leader lines extending to right-side stacked text blocks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["pie-chart","data-visualization","leader-lines"],"avoid":["Time-series data","copying source assets, source text, or an exact source arrangement"],"best_for":["Market share analysis","Demographic breakdowns","Budget allocations"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left text column, right interlocking branched arrows pointing right","zones":["Left text column, right interlocking branched arrows pointing right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["branched-arrows","two-column","flow-diagram"],"avoid":["Extensive paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process overviews","Options or pathways","Input/Output flows"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered text block on fluid organic background","zones":["Centered text block on fluid organic background"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid organic background blobs overlapping the corners","Central white content card with prominent rounded corners and soft drop shadow","Terracotta circular bullet/header accent on content cards"],"optional_variants":["closing-slide","fluid-background","minimalist-center"],"avoid":["Content summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Standard rectangular crops for photos.
- Avoid harsh borders; blend images harmoniously with the soft pastel surroundings.
- Images should ideally feature soft, muted tones to match the Morandi template palette.

【图标与装饰】
- Minimalist white line icons.
- Icons are always housed centrally within colored circular or rounded-diamond badges.

【数据页构图】
- Left pie chart with thin leader lines extending to right-side stacked text blocks

【图表风格】
- Flat, 2D data visualizations without 3D effects.
- Chart segments strictly adhere to the pastel Morandi palette (muted blues, dusty pinks, light grays).
- Use thin, straight slate-blue leader lines to connect chart segments to external labels.

【章节页构图】
- Left text column, right interlocking branched arrows pointing right

【收尾页构图】
- Centered text block on fluid organic background

【禁止】
- Pure black text, which breaks the soft color harmony.
- Sharp, jagged background shapes or aggressive geometric angles.
- High-saturation primary colors (neon, bright red, pure green).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency pitches、Lifestyle or wellness brand decks、HR or culture presentations、High-end corporate reporting requiring a softer touch。
