# 116 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-116-6bfd8b35

## 风格ID
linzi-morandi-2-21-ppt-ppt-116-6bfd8b35

## 风格名称
116 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-116-6bfd8b35

## 风格描述
A minimalist, artistic presentation template utilizing a muted Morandi palette, organic brushstroke framing, and clean geometric content structures.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Slate (#3b3e48) for primary text and high-contrast blocks; Blush (#f0e1df) for soft backgrounds/highlights; Blue (#a4b6c6) for accent shapes.
- fonts: Serif font for headers to convey elegance; Sans-serif for highly legible body copy.
- spacing: Generous margins, particularly near the painted edge framing; tight, controlled padding within solid color blocks.
- shape_language: A mix of sharp rectangles, arch-topped columns, and perfect circles, contrasted against organic/fluid master background edges.
- texture: Flat vector solids combined with watercolor/gouache style brush textures on edges.
- grid: Strong adherence to horizontal and vertical divisions, frequently using 2, 3, or 4 column splits.
- motion_or_depth: Largely flat, relying on color contrast and overlapping shapes (e.g., circles crossing dividing lines) to create a subtle layered effect.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「116 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-116-6bfd8b35」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, artistic presentation template utilizing a muted Morandi palette, organic brushstroke framing, and clean geometric content structures.
- 推荐配色：#3b3e48、#f0e1df、#a4b6c6、#ffffff、#e2e2e2

【不可丢失的风格锚点】
- Abstract, painted organic brushstrokes functioning as asymmetric edge framing
- Alternating deep slate and soft blush color blocking
- Prominent circular badges for numbers and icons overlapping rectangular containers
- Elegant serif typography for major headings

【字体】
- Use high-contrast serif sizing for primary titles.
- Keep body text in sans-serif, using a lighter slate or medium gray to reduce harshness.
- Center-align text inside strictly defined geometric blocks; left-align free-floating text.

【封面页构图】
- Left-aligned text hierarchy against expansive whitespace, balanced by large organic painted edges on the right.

【内容页构图】
- Three vertical columns with staggered image and text placements, intersected by solid color header blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned text hierarchy against expansive whitespace, balanced by large organic painted edges on the right.","zones":["Left-aligned text hierarchy against expansive whitespace, balanced by large organic painted edges on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["minimalist","asymmetric","text-heavy-left"],"avoid":["Heavy text","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Chapter openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central horizontal band with an intersecting dark circle for numbering, framed by an organic left edge.","zones":["Central horizontal band with an intersecting dark circle for numbering, framed by an organic left edge."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["horizontal-ribbon","badge-anchor"],"avoid":["Detailed content","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Agenda items"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three vertical columns with staggered image and text placements, intersected by solid color header blocks.","zones":["Three vertical columns with staggered image and text placements, intersected by solid color header blocks."],"content_capacity":{"density":"medium","max_items":9},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["three-column","staggered-layout","image-grid"],"avoid":["Single narrative text","Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product feature highlights","Case studies"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"col1-img","purpose":"Visual representation of first column topic","bbox":[0.08,0.29,0.16,0.29],"priority":1},{"id":"col2-img","purpose":"Visual representation of second column topic","bbox":[0.52,0.29,0.16,0.29],"priority":2},{"id":"col3-img","purpose":"Visual representation of third column topic","bbox":[0.5,0.75,0.16,0.36],"priority":3}]},{"id":"content-comparison","composition":"Four vertical arch-topped panels alternating in contrasting colors, containing centered icons and text.","zones":["Four vertical arch-topped panels alternating in contrasting colors, containing centered icons and text."],"content_capacity":{"density":"high","max_items":12},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["four-column","arch-cards","alternating-colors"],"avoid":["Long paragraphs","Large photography","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Four-step processes","Feature comparisons"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Four-quadrant matrix separated by thin center-aligned crosshair lines, with a central typographic anchor.","zones":["Four-quadrant matrix separated by thin center-aligned crosshair lines, with a central typographic anchor."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["quadrant-matrix","crosshair-grid","analytical"],"avoid":["Linear narratives","Large continuous graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["SWOT analyses","Pros and cons","Risk assessments"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central horizontal band with an intersecting dark circle for numbering, framed by an organic left edge.","zones":["Central horizontal band with an intersecting dark circle for numbering, framed by an organic left edge."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["horizontal-ribbon","badge-anchor"],"avoid":["Detailed content","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Agenda items"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Left-aligned bold text hierarchy against expansive whitespace, balanced by large organic painted edges on the right.","zones":["Left-aligned bold text hierarchy against expansive whitespace, balanced by large organic painted edges on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Abstract, painted organic brushstrokes functioning as asymmetric edge framing","Alternating deep slate and soft blush color blocking","Prominent circular badges for numbers and icons overlapping rectangular containers"],"optional_variants":["minimalist","asymmetric","bookend"],"avoid":["New information","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Crop images into sharp, borderless rectangles.
- Stagger image placement relative to text blocks to create a dynamic reading rhythm.

【图标与装饰】
- Use minimalist, monoline icons.
- Enclose icons within circular white plates with subtle or no borders.
- Maintain uniform stroke weights across all icons.

【数据页构图】
- Four-quadrant matrix separated by thin center-aligned crosshair lines, with a central typographic anchor.

【图表风格】
- Divide complex data sets using thin, delicate crosshair lines.
- Use color-coded rectangular headers to denote distinct data categories or quadrants.

【章节页构图】
- Central horizontal band with an intersecting dark circle for numbering, framed by an organic left edge.

【收尾页构图】
- Left-aligned bold text hierarchy against expansive whitespace, balanced by large organic painted edges on the right.

【禁止】
- Do not use vibrant, highly saturated neon or primary colors.
- Avoid drop shadows or 3D bevel effects.
- Do not place images over the painted brushstroke edges.
- Do not use rounded corners on photographs.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Artistic or fashion brand proposals、Minimalist corporate summaries、High-end lifestyle product decks。
