# 43 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-43-28d038bb

## 风格ID
linzi-morandi-2-21-ppt-ppt-43-28d038bb

## 风格名称
43 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-43-28d038bb

## 风格描述
An elegant, minimalist presentation featuring a central elevated card layout, Morandi color palette, botanical shadow overlays, and organic line art accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted sage and dusty rose as primary background/accent colors; vibrant ochre for key highlights; dark charcoal for text.
- fonts: Elegant serif for primary headings to convey sophistication; clean sans-serif for body copy to ensure readability.
- spacing: Generous outer margins establishing the card frame; structured multi-column grids within the card.
- shape_language: Contrast between strict rectangular image masks and fluid, organic background shapes and line art.
- texture: Simulated natural sunlight filtering through leaves (shadow overlay) applied globally over the slide.
- grid: Modular system operating strictly within the inner elevated card container.
- motion_or_depth: Depth established by the drop shadow of the central card and the overlaid cast shadow simulating an external light source.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「43 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-43-28d038bb」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation featuring a central elevated card layout, Morandi color palette, botanical shadow overlays, and organic line art accents.
- 推荐配色：#D4A397、#97AA8E、#E27917、#F4F4F4、#333333

【不可丢失的风格锚点】
- Global botanical light/shadow overlay across the entire slide
- Content contained within an elevated white card with a drop shadow
- Organic background blobs contrasting with the sharp central card
- Delicate, abstract botanical line art used as accent elements
- Minimalist pill-shaped buttons and circular icon containers

【字体】
- Headings use a high-contrast serif font, sometimes italicized for artistic effect.
- Body text is small, sans-serif, with generous line spacing.
- Bilingual support integrated seamlessly with clear hierarchy.

【封面页构图】
- Central rectangular image flanked by asymmetrical typography and overlapping botanical line art.

【内容页构图】
- Four-column grid with uniform square portrait images and brief descriptive text below.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central rectangular image flanked by asymmetrical typography and overlapping botanical line art.","zones":["Central rectangular image flanked by asymmetrical typography and overlapping botanical line art."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["hero-image","asymmetrical","line-art"],"avoid":["Heavy text","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"replaceable real image","bbox":[0.35,0.28,0.4,0.43],"priority":1}]}
- section: {"id":"section-primary","composition":"Split vertical layout; top half text, bottom half split between a wide landscape image and a solid color block.","zones":["Split vertical layout; top half text, bottom half split between a wide landscape image and a solid color block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["split-layout","color-block","asymmetrical"],"avoid":["Bullet lists","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Highlighting a single key message"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"landscape-hero","purpose":"replaceable real image","bbox":[0.13,0.5,0.51,0.35],"priority":1}]}
- content: [{"id":"content-content","composition":"Four-column grid with uniform square portrait images and brief descriptive text below.","zones":["Four-column grid with uniform square portrait images and brief descriptive text below."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["4-column","grid","portraits"],"avoid":["Long paragraphs","Complex workflows","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product galleries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img1","purpose":"replaceable real image","bbox":[0.15,0.4,0.16,0.3],"priority":1},{"id":"img2","purpose":"replaceable real image","bbox":[0.33,0.4,0.16,0.3],"priority":2},{"id":"img3","purpose":"replaceable real image","bbox":[0.51,0.4,0.16,0.3],"priority":3},{"id":"img4","purpose":"replaceable real image","bbox":[0.68,0.4,0.16,0.3],"priority":4}]},{"id":"content-comparison","composition":"Three equal columns featuring top-aligned landscape images, central text, and bottom-aligned pill buttons.","zones":["Three equal columns featuring top-aligned landscape images, central text, and bottom-aligned pill buttons."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["3-column","cards","buttons"],"avoid":["Detailed financial data","Single narrative flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Service offerings","Feature highlights","Pricing tiers"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"card-img-1","purpose":"replaceable real image","bbox":[0.11,0.18,0.2,0.22],"priority":1},{"id":"card-img-2","purpose":"replaceable real image","bbox":[0.4,0.18,0.2,0.22],"priority":2},{"id":"card-img-3","purpose":"replaceable real image","bbox":[0.69,0.18,0.2,0.22],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Four-column icon grid centrally placed, framed by corner color blocks and line art.","zones":["Four-column icon grid centrally placed, framed by corner color blocks and line art."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["icon-grid","4-column","corner-accents"],"avoid":["Large photography displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Core capabilities","Key statistics"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Four-column grid with uniform square portrait images and brief descriptive text below.","zones":["Four-column grid with uniform square portrait images and brief descriptive text below."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["4-column","grid","portraits"],"avoid":["Long paragraphs","Complex workflows","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product galleries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img1","purpose":"replaceable real image","bbox":[0.15,0.4,0.16,0.3],"priority":1},{"id":"img2","purpose":"replaceable real image","bbox":[0.33,0.4,0.16,0.3],"priority":2},{"id":"img3","purpose":"replaceable real image","bbox":[0.51,0.4,0.16,0.3],"priority":3},{"id":"img4","purpose":"replaceable real image","bbox":[0.68,0.4,0.16,0.3],"priority":4}]}]
- closing: {"id":"closing-primary","composition":"Reiteration of the cover layout: central image, large typographical focal point, and line art accents.","zones":["Reiteration of the cover layout: central image, large typographical focal point, and line art accents."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Global botanical light/shadow overlay across the entire slide","Content contained within an elevated white card with a drop shadow","Organic background blobs contrasting with the sharp central card"],"optional_variants":["closing","hero-image","bookend"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-hero","purpose":"replaceable real image","bbox":[0.35,0.28,0.4,0.43],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Strict rectangular framing with no border radius.
- Images are subjected to the global shadow overlay, embedding them into the scene.
- Photography favors muted, vintage, or soft natural lighting.

【图标与装饰】
- Thin white line icons centered within solid, muted-color circular backgrounds.
- Used primarily in structural multi-column layouts.

【数据页构图】
- Four-column icon grid centrally placed, framed by corner color blocks and line art.

【图表风格】
- No traditional data charts present; relies on modular text blocks and icon columns for data/concept visualization.

【章节页构图】
- Split vertical layout; top half text, bottom half split between a wide landscape image and a solid color block.

【收尾页构图】
- Reiteration of the cover layout: central image, large typographical focal point, and line art accents.

【禁止】
- Avoid removing the shadow overlay, as it breaks the primary aesthetic theme.
- Do not use bright, saturated neon colors; stick to the muted Morandi palette.
- Avoid placing content outside the central white card boundary.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios、Boutique brand proposals、Lifestyle or fashion pitch decks、Lookbooks。
