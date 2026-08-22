# 优雅线条（31）---木七设计 · ppt模板 / linzi-morandi-ppt-31-fbd21f8f

## 风格ID
linzi-morandi-ppt-31-fbd21f8f

## 风格名称
优雅线条（31）---木七设计 · ppt模板 / linzi-morandi-ppt-31-fbd21f8f

## 风格描述
A modern, artistic presentation template featuring a Morandi earth-tone palette, fluid organic shapes, and minimalist typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Warm beige background serves as the canvas, with dark brown used for primary typography. Terracotta, mustard, and tan act as large graphic accents and functional blocks.
- fonts: Clean, geometric sans-serif typography. Headings are central and bold, while body copy is lighter and airy.
- spacing: Generous margins, particularly in centered layouts. Content blocks use tight internal padding but wide spacing between distinct columns.
- shape_language: A juxtaposition of soft, amoeba-like background elements against strict, sharp rectangular framing for photos and text boxes.
- texture: A distinct grainy, chalk-like stippling effect applied only to the perimeters of the large background shapes.
- grid: Flexible underlying structure ranging from single-column centered to strict 3- and 4-column horizontal divisions.
- motion_or_depth: Predominantly flat layered composition, with depth implied purely by shape overlap, though occasional soft drop shadows are applied to devices and timeline nodes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（31）---木七设计 · ppt模板 / linzi-morandi-ppt-31-fbd21f8f」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, artistic presentation template featuring a Morandi earth-tone palette, fluid organic shapes, and minimalist typography.
- 推荐配色：#E9E1D6、#67453B、#BB5A45、#E9C883、#C8A892

【不可丢失的风格锚点】
- Earthy Morandi color palette
- Fluid, abstract background shapes with subtly textured/stippled edges
- Thin, overlapping, continuous contour line accents
- Pill-shaped badges for tags and primary labels

【字体】
- Headings should be centered or strongly left-aligned depending on the layout, using a dark brown sans-serif.
- Subtitle and meta-information placed inside rounded pill-shaped badges.
- Body text requires generous line height and moderate contrast (white on dark backgrounds, dark brown on light).

【封面页构图】
- Centered typographic lockup over asymmetrical fluid background shapes and contour lines.

【内容页构图】
- Left-aligned image bleeding off edge, overlaid with a horizontal color block containing columned text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typographic lockup over asymmetrical fluid background shapes and contour lines.","zones":["Centered typographic lockup over asymmetrical fluid background shapes and contour lines."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["centered","organic-frame","minimal"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major chapter openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered hierarchical text with a prominent pill badge, flanked by soft background corners.","zones":["Centered hierarchical text with a prominent pill badge, flanked by soft background corners."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["transition","text-focus","centered"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key takeaway statements"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left-aligned image bleeding off edge, overlaid with a horizontal color block containing columned text.","zones":["Left-aligned image bleeding off edge, overlaid with a horizontal color block containing columned text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["split-layout","overlap","columns"],"avoid":["Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Feature highlights","Case study summaries"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"side-feature","purpose":"Contextual lifestyle or product image","bbox":[0.0,0.0,0.38,0.6],"priority":1}]},{"id":"content-comparison","composition":"Staggered checkerboard layout alternating image blocks and colored text blocks.","zones":["Staggered checkerboard layout alternating image blocks and colored text blocks."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["checkerboard","grid","image-text"],"avoid":["Single narrative flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Product feature grids","Dual-concept comparisons","Service breakdowns"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"grid-img-top","purpose":"Supporting visual for first point","bbox":[0.12,0.24,0.17,0.31],"priority":1},{"id":"grid-img-bottom","purpose":"Supporting visual for second point","bbox":[0.7,0.57,0.17,0.31],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Four-column horizontal array of donut charts with corresponding labels and captions.","zones":["Four-column horizontal array of donut charts with corresponding labels and captions."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["charts","4-column","metrics"],"avoid":["Deep, complex financial tables","copying source assets, source text, or an exact source arrangement"],"best_for":["High-level statistics","Market share comparisons","Survey results"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered hierarchical text with a prominent pill badge, flanked by soft background corners.","zones":["Centered hierarchical text with a prominent pill badge, flanked by soft background corners."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["transition","text-focus","centered"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key takeaway statements"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Vertical bi-color split background with a large quotation mark watermark and an overlapping device mockup.","zones":["Vertical bi-color split background with a large quotation mark watermark and an overlapping device mockup."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["bi-color","mockup","quote"],"avoid":["Print-only references","copying source assets, source text, or an exact source arrangement"],"best_for":["Client testimonials","Digital product showcases","Executive quotes"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"device-screen","purpose":"Screen replacement for digital mockup","bbox":[0.55,0.34,0.36,0.38],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Minimalist centered text surrounded by inward-pointing organic abstract shapes.","zones":["Minimalist centered text surrounded by inward-pointing organic abstract shapes."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Earthy Morandi color palette","Fluid, abstract background shapes with subtly textured/stippled edges","Thin, overlapping, continuous contour line accents"],"optional_variants":["closing","organic-frame","minimal"],"avoid":["Any content presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Contact information slides"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Photographs are housed in strict, unrounded rectangular frames, contrasting with the fluid backgrounds.
- Images should ideally feature warm lighting or lifestyle subjects to match the earth-tone palette.

【图标与装饰】
- Oversized structural icons (like quotation marks) used as graphic watermarks.
- Solid white silhouette icons used sparingly inside circular nodes.

【数据页构图】
- Four-column horizontal array of donut charts with corresponding labels and captions.

【图表风格】
- Donut charts utilize the presentation's core accent colors against a light grey/beige track, with bold percentage values centered inside.

【章节页构图】
- Centered hierarchical text with a prominent pill badge, flanked by soft background corners.

【收尾页构图】
- Minimalist centered text surrounded by inward-pointing organic abstract shapes.

【禁止】
- Vibrant, highly saturated neon or primary colors.
- Harsh geometric shapes (triangles, sharp polygons) as background graphics.
- Overly detailed or metallic gradients.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lifestyle brand guidelines、Creative agency portfolios、Modern HR or internal culture reports、Artistic project proposals。
