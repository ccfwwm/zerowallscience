# 4 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-4-1ea723c0

## 风格ID
linzi-morandi-2-21-ppt-ppt-4-1ea723c0

## 风格名称
4 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-4-1ea723c0

## 风格描述
High-end editorial lookbook presentation featuring strict grids, overlapping macro-typography, and a sophisticated earthy color palette.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Beige/off-white acts as the primary canvas; taupe and dark olive/brown serve as structural blocks and text colors; white is used sparingly for high contrast on dark photos.
- fonts: Heavy, tightly tracked geometric sans-serif for primary headers; highly legible, small regular sans-serif for body copy and marginalia.
- spacing: Generous outer margins housing tiny navigational text; tight gutters between masonry image blocks.
- shape_language: Strictly orthogonal; sharp 90-degree corners with zero border-radius on all elements.
- texture: Clean flat vectors contrasting with rich, textured editorial photography.
- grid: Complex asymmetric column grids (often 50/50 or 60/40 splits) with strong vertical and horizontal text alignments.
- motion_or_depth: Depth is created entirely through the layering of large typography over offset image panels.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「4 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-4-1ea723c0」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- High-end editorial lookbook presentation featuring strict grids, overlapping macro-typography, and a sophisticated earthy color palette.
- 推荐配色：#EBEAE5、#B7AD9B、#5C5A4C、#4A433A、#FFFFFF

【不可丢失的风格锚点】
- Muted, warm earth-tone color palette
- Magazine-style marginalia (tiny text at slide edges)
- Macro-scale, tightly tracked display typography overlapping image boundaries
- Strict sharp-edged rectangular image panels
- Asymmetric split-screen layouts

【字体】
- Headers are set extremely large, often breaking across multiple lines and overlapping adjacent image panels.
- Body copy is kept small, compact, and strictly left-aligned.
- Use tiny uppercase or small-caps text at the far edges of the slide for an editorial 'folio' effect.

【封面页构图】
- Full-bleed background with a distinct letterbox/inset framing effect and minimal marginalia.

【内容页构图】
- Asymmetric split layout with a large background panel and an overlapping inset portrait panel.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with a distinct letterbox/inset framing effect and minimal marginalia.","zones":["Full-bleed background with a distinct letterbox/inset framing effect and minimal marginalia."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, warm earth-tone color palette","Magazine-style marginalia (tiny text at slide edges)","Macro-scale, tightly tracked display typography overlapping image boundaries"],"optional_variants":["hero-cover","minimal-text","editorial-framing"],"avoid":["Data heavy slides","Text heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-background","purpose":"Atmospheric full-bleed backdrop","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}
- section: {"id":"section-primary","composition":"Horizontal split with top image band and bottom solid color block containing a multi-column text layout.","zones":["Horizontal split with top image band and bottom solid color block containing a multi-column text layout."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, warm earth-tone color palette","Magazine-style marginalia (tiny text at slide edges)","Macro-scale, tightly tracked display typography overlapping image boundaries"],"optional_variants":["horizontal-split","three-column","color-block"],"avoid":["Hero image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Strategic pillars","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"header-strip","purpose":"Textural top banner","bbox":[0.0,0.0,1.0,0.3],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetric split layout with a large background panel and an overlapping inset portrait panel.","zones":["Asymmetric split layout with a large background panel and an overlapping inset portrait panel."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, warm earth-tone color palette","Magazine-style marginalia (tiny text at slide edges)","Macro-scale, tightly tracked display typography overlapping image boundaries"],"optional_variants":["split-screen","overlapping-images","profile"],"avoid":["Complex data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Case study introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bg-left","purpose":"Large anchoring background image","bbox":[0.0,0.0,0.66,1.0],"priority":1},{"id":"inset-right","purpose":"Overlapping feature image","bbox":[0.6,0.2,0.3,0.6],"priority":2}]},{"id":"content-comparison","composition":"Offset image panel on the right with large typography on the left bridging across the image boundary.","zones":["Offset image panel on the right with large typography on the left bridging across the image boundary."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, warm earth-tone color palette","Magazine-style marginalia (tiny text at slide edges)","Macro-scale, tightly tracked display typography overlapping image boundaries"],"optional_variants":["text-overlap","offset-image","editorial"],"avoid":["Heavy body text","copying source assets, source text, or an exact source arrangement"],"best_for":["Quote slides","Key statements","Product highlights"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"right-panel","purpose":"Feature image with margins","bbox":[0.55,0.1,0.45,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Minimalist scatter/bubble chart with a text header block above it.","zones":["Minimalist scatter/bubble chart with a text header block above it."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, warm earth-tone color palette","Magazine-style marginalia (tiny text at slide edges)","Macro-scale, tightly tracked display typography overlapping image boundaries"],"optional_variants":["minimal-chart","bubble-plot","clean-data"],"avoid":["Dense, complex financial tables","copying source assets, source text, or an exact source arrangement"],"best_for":["High-level data trends","Conceptual distributions"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetric split layout with a large background panel and an overlapping inset portrait panel.","zones":["Asymmetric split layout with a large background panel and an overlapping inset portrait panel."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, warm earth-tone color palette","Magazine-style marginalia (tiny text at slide edges)","Macro-scale, tightly tracked display typography overlapping image boundaries"],"optional_variants":["split-screen","overlapping-images","profile"],"avoid":["Complex data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Case study introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bg-left","purpose":"Large anchoring background image","bbox":[0.0,0.0,0.66,1.0],"priority":1},{"id":"inset-right","purpose":"Overlapping feature image","bbox":[0.6,0.2,0.3,0.6],"priority":2}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are entirely uncropped (no organic shapes) and placed in sharp rectangular frames.
- Use a mix of full-bleed background images and floating, inset image panels to create dynamic tension.
- Apply a cohesive warm/desaturated color grade to all photography to match the earth-tone palette.

【图标与装饰】
- Extremely minimal, uncolored, thin-line stroke icons.
- Consistent stroke weight across the entire icon set.
- Arranged in strict, evenly spaced grids with high negative space.

【数据页构图】
- Minimalist scatter/bubble chart with a text header block above it.

【图表风格】
- Utilitarian and minimalist; thin, subtle lines for axes without background gridlines.
- Data points represented as simple solid-colored geometric shapes (e.g., circles) mapped to the deck's muted palette.

【章节页构图】
- Horizontal split with top image band and bottom solid color block containing a multi-column text layout.

【收尾页构图】
- Full-bleed background with a distinct letterbox/inset framing effect and minimal marginalia.

【禁止】
- Bright, saturated primary colors.
- Rounded corners or organic blob shapes.
- Default bulleted lists or centered text blobs.
- 3D effects, drop shadows, or gradients.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle lookbooks、High-end architecture or interior design portfolios、Boutique agency credentials、Editorial-style annual reports。
