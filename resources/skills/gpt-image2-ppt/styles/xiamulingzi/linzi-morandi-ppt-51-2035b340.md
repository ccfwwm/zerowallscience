# 优雅线条（51）---木七设计 · ppt模板 / linzi-morandi-ppt-51-2035b340

## 风格ID
linzi-morandi-ppt-51-2035b340

## 风格名称
优雅线条（51）---木七设计 · ppt模板 / linzi-morandi-ppt-51-2035b340

## 风格描述
An elegant, minimalist presentation template utilizing a warm Morandi color palette, overlapping circular geometry, and clean sans-serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background (#FCF8F5) with primary terracotta accents (#C56B52). Dark rust (#A2361B) for emphasis and mid-grey (#6A6A6A) for dark secondary elements.
- fonts: Clean, modern geometric sans-serif for both headings and body text to maintain a contemporary feel
- spacing: Generous outer margins with clustered, tight padding within unified content blocks (e.g., cards and grouped image grids)
- shape_language: Predominantly soft and rounded; strict circles, pills, and soft-cornered rectangles
- texture: Flat color fields contrasted with precise 45-degree diagonal line hatching inside specific shapes
- grid: Flexible underlying grid supporting rigid 4-column cards, asymmetric 1/3 to 2/3 splits, and fully centered layouts
- motion_or_depth: Strictly flat layers with depth implied only through 2D shape overlaps and subtle contrast; no drop shadows except on realistic device mockups

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（51）---木七设计 · ppt模板 / linzi-morandi-ppt-51-2035b340」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template utilizing a warm Morandi color palette, overlapping circular geometry, and clean sans-serif typography.
- 推荐配色：#FCF8F5、#C56B52、#A2361B、#DCAA9D、#6A6A6A

【不可丢失的风格锚点】
- Overlapping solid and striped circular primitives placed at edges and corners
- Pill-shaped (fully rounded) buttons and section labels
- Soft, warm terracotta and cream color blocking
- Organic, overlapping 'mountain-like' shapes for data visualization

【字体】
- Primary titles are centered and use prominent uppercase (for alphanumeric characters)
- Subtitles are slightly lighter and placed directly beneath titles for consistent lockups
- Body text is small, breathable, and aligned to its immediate container (left-aligned in sidebars, centered in columns)

【封面页构图】
- Centered title lockup surrounded by scattered geometric shapes

【内容页构图】
- Split layout inside a solid container, featuring an asymmetrical image grid on one side and text on the other

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title lockup surrounded by scattered geometric shapes","zones":["Centered title lockup surrounded by scattered geometric shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["centered","geometric-border","minimal"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation transitions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered dual-language title block with a pill-shaped section tag below","zones":["Centered dual-language title block with a pill-shaped section tag below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["centered","pill-tag","corner-accents"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Agenda introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout inside a solid container, featuring an asymmetrical image grid on one side and text on the other","zones":["Split layout inside a solid container, featuring an asymmetrical image grid on one side and text on the other"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["split-layout","image-grid","block-container"],"avoid":["Complex data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Project showcases","Product feature overviews"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"mosaic-grid","purpose":"Replaceable clustered image grid","bbox":[0.08,0.3,0.5,0.6],"priority":1}]},{"id":"content-comparison","composition":"Top half two-column image split, bottom half three-column icon/text grid","zones":["Top half two-column image split, bottom half three-column icon/text grid"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["horizontal-split","top-media","3-column-features"],"avoid":["Single narrative points","copying source assets, source text, or an exact source arrangement"],"best_for":["Service breakdowns","Product capabilities","Case study summaries"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"top-left-img","purpose":"Contextual photo","bbox":[0.08,0.28,0.4,0.3],"priority":1},{"id":"top-right-img","purpose":"Contextual photo","bbox":[0.5,0.28,0.4,0.3],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Four-column vertical card grid with overlapping central icons","zones":["Four-column vertical card grid with overlapping central icons"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["4-column","cards","split-color"],"avoid":["Lengthy explanatory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Four-step processes","Core feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered dual-language title block with a pill-shaped section tag below","zones":["Centered dual-language title block with a pill-shaped section tag below"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["centered","pill-tag","corner-accents"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Agenda introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Split background with oversized decorative quote marks on the solid half, intersected by a realistic device mockup on the other","zones":["Split background with oversized decorative quote marks on the solid half, intersected by a realistic device mockup on the other"],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["mockup","oversized-quote","split-background"],"avoid":["Text-heavy technical specs","copying source assets, source text, or an exact source arrangement"],"best_for":["Software demonstrations","Client testimonials","Platform features"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"device-screen","purpose":"Software or website UI placement","bbox":[0.55,0.3,0.35,0.4],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered title lockup surrounded by scattered geometric shapes (identical to cover)","zones":["Centered title lockup surrounded by scattered geometric shapes (identical to cover)"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Overlapping solid and striped circular primitives placed at edges and corners","Pill-shaped (fully rounded) buttons and section labels","Soft, warm terracotta and cream color blocking"],"optional_variants":["bookend","centered","minimal"],"avoid":["Any core content","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are consistently contained within sharp rectangular masks or device frames
- Multiple images are often grouped with thick internal grid borders matching the background color to form unified blocks
- Edge-to-edge bleed is used horizontally when spanning columns

【图标与装饰】
- Icons are flat, solid white, and contained within perfect circular colored badges
- Icon badges frequently overlap horizontal dividing lines or block boundaries to bridge layout zones

【数据页构图】
- Four-column vertical card grid with overlapping central icons

【图表风格】
- Data is represented organically using overlapping, soft-peaked area shapes (mountain chart style)
- Data points are highlighted with small, arrow-tailed tooltips floating above the shapes

【章节页构图】
- Centered dual-language title block with a pill-shaped section tag below

【收尾页构图】
- Centered title lockup surrounded by scattered geometric shapes (identical to cover)

【禁止】
- Avoid harsh primary colors (neon greens, bright blues) that break the muted Morandi palette
- Avoid sharp, aggressive angular geometry or triangles
- Do not use heavy gradients, bevels, or 3D effects on UI/vector elements
- Avoid unconstrained, unmasked free-floating imagery
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Boutique brand guidelines、Quarterly business reviews for lifestyle or fashion brands、Modern HR onboarding or culture decks。
