# 优雅线条（43）---木七设计 · ppt模板 / linzi-morandi-ppt-43-141653e7

## 风格ID
linzi-morandi-ppt-43-141653e7

## 风格名称
优雅线条（43）---木七设计 · ppt模板 / linzi-morandi-ppt-43-141653e7

## 风格描述
Elegant, minimalist presentation system featuring a Morandi color palette, organic fluid background shapes, and fine monoline artistic details.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white background with earthy, muted dusty pinks, sages, and warm taupes for functional areas and accents
- fonts: Stylized, thin, wide sans-serif for hero titles; clean, readable sans-serif for body and subtitles, all heavily tracked
- spacing: Airy and generous, heavily utilizing negative space around centered clusters
- shape_language: Fluid amoeba-like background blobs contrasted with strict geometric icon containers (circles, rounded diamonds)
- texture: Flat vectors with occasional brush-stroke textures behind titles
- grid: Predominantly center-aligned vertical axis, using 4-column or symmetrical 2x2 grids for content
- motion_or_depth: Strictly flat layering; depth is achieved solely through the overlapping of fluid shapes and line-art

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（43）---木七设计 · ppt模板 / linzi-morandi-ppt-43-141653e7」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, minimalist presentation system featuring a Morandi color palette, organic fluid background shapes, and fine monoline artistic details.
- 推荐配色：#F3F0F1、#B59094、#DBCBB9、#8A736F、#4F6D56

【不可丢失的风格锚点】
- Organic, overlapping fluid shapes in muted tones
- Continuous single-line artistic illustrations
- White monoline icons housed in perfect geometric containers
- Center-weighted alignment for primary typography

【字体】
- Main titles are centered, thin, and styled with high letter-spacing
- Subtitles use a smaller, slightly heavier weight in muted taupe
- Body text is centered, low-contrast dark gray/brown, avoiding pure black
- Small decorative lines or pill shapes often anchor text blocks

【封面页构图】
- Center-aligned title cluster flanked by organic fluid shapes and abstract monoline illustrations on the edges

【内容页构图】
- Centered top header with a 4-column row of perfectly circular icon containers and centered text below

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned title cluster flanked by organic fluid shapes and abstract monoline illustrations on the edges","zones":["Center-aligned title cluster flanked by organic fluid shapes and abstract monoline illustrations on the edges"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, overlapping fluid shapes in muted tones","Continuous single-line artistic illustrations","White monoline icons housed in perfect geometric containers"],"optional_variants":["fluid-borders","centered-title","artistic-hero"],"avoid":["Data-heavy summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Pitch covers","Portfolio introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered text cluster with a subtle brush-stroke background layer, framed by scattered circular and fluid organic shapes","zones":["Centered text cluster with a subtle brush-stroke background layer, framed by scattered circular and fluid organic shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, overlapping fluid shapes in muted tones","Continuous single-line artistic illustrations","White monoline icons housed in perfect geometric containers"],"optional_variants":["brush-accent","asymmetrical-frame","pill-badge"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Centered top header with a 4-column row of perfectly circular icon containers and centered text below","zones":["Centered top header with a 4-column row of perfectly circular icon containers and centered text below"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, overlapping fluid shapes in muted tones","Continuous single-line artistic illustrations","White monoline icons housed in perfect geometric containers"],"optional_variants":["4-column","circle-icons","symmetrical"],"avoid":["Long paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Feature lists","Service pillars"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Centered top header with a central 2x2 diamond grid of icons, flanked by text blocks on the left and right","zones":["Centered top header with a central 2x2 diamond grid of icons, flanked by text blocks on the left and right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, overlapping fluid shapes in muted tones","Continuous single-line artistic illustrations","White monoline icons housed in perfect geometric containers"],"optional_variants":["diamond-cluster","split-text","central-focus"],"avoid":["Sequential steps","copying source assets, source text, or an exact source arrangement"],"best_for":["Interconnected concepts","Four-part models","Symmetrical feature highlights"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Centered top header, split layout with a left-aligned image block and three adjacent vertical stat cards on the right","zones":["Centered top header, split layout with a left-aligned image block and three adjacent vertical stat cards on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, overlapping fluid shapes in muted tones","Continuous single-line artistic illustrations","White monoline icons housed in perfect geometric containers"],"optional_variants":["split-layout","stat-cards","image-anchored"],"avoid":["Complex tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Milestone achievements","Portfolio highlights"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-feature-image","purpose":"contextual lifestyle or portfolio image","bbox":[0.0,0.25,0.43,0.53],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered text cluster with a subtle brush-stroke background layer, framed by scattered circular and fluid organic shapes","zones":["Centered text cluster with a subtle brush-stroke background layer, framed by scattered circular and fluid organic shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, overlapping fluid shapes in muted tones","Continuous single-line artistic illustrations","White monoline icons housed in perfect geometric containers"],"optional_variants":["brush-accent","asymmetrical-frame","pill-badge"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-01"],"external_image_slots":[]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used as edge-to-edge organic textures or masked inside device mockups
- Avoid rigid square frames; blend photos with adjacent fluid colored blocks

【图标与装饰】
- Strictly white, fine monoline style
- Always centered within a solid Morandi-colored geometric shape (circle, diamond, ring segment)

【数据页构图】
- Centered top header, split layout with a left-aligned image block and three adjacent vertical stat cards on the right

【图表风格】
- Flat, borderless vertical bar charts
- Grouped bars have zero gap between them
- Thin, subtle horizontal grid lines with no vertical axes or frame
- Colors directly map to the core 3-tone Morandi palette

【章节页构图】
- Centered text cluster with a subtle brush-stroke background layer, framed by scattered circular and fluid organic shapes

【收尾页构图】
- Center-aligned title cluster flanked by organic fluid shapes and abstract monoline illustrations on the edges

【禁止】
- Drop shadows or 3D effects
- Bright, highly saturated primary or neon colors
- Left-aligned heavy text blocks (disrupts the airy center-weighted aesthetic)
- Thick borders or heavy outlined shapes
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Lifestyle and fashion brand pitches、Boutique wellness or interior design proposals、Minimalist corporate overviews。
