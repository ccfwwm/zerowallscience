# 精选科技风16 · 模板 / linzi-tech-16-48e9caad

## 风格ID
linzi-tech-16-48e9caad

## 风格名称
精选科技风16 · 模板 / linzi-tech-16-48e9caad

## 风格描述
A sophisticated, dark-themed presentation template optimized for mobile app demos, digital product showcases, and minimal portfolio presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Deep charcoal/black backgrounds (#1A1A1A) with white primary text (#FFFFFF), grey secondary text (#A0A0A0), and rose-gold/bronze accents (#D8A7A7, #C89F70) for branding elements.
- fonts: Clean geometric sans-serif for body; uppercase tracking applied to headers and navigational labels.
- spacing: Generous margins; left column strictly aligned to a consistent vertical axis, with large gutters between text and media.
- shape_language: Minimalist geometric shapes: sharp squares for branding outlines, rounded rectangles for UI cards and device bezels, perfect circles for avatars.
- texture: Smooth, flat, matte backgrounds paired with high-gloss or vibrant photographic inserts confined to screen mockups.
- grid: Two-column grid system (approx 35% left / 65% right) used consistently across most content slides.
- motion_or_depth: Primarily flat layout with depth introduced exclusively through drop shadows on device mockups or floating UI elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风16 · 模板 / linzi-tech-16-48e9caad」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, dark-themed presentation template optimized for mobile app demos, digital product showcases, and minimal portfolio presentations.
- 推荐配色：#1A1A1A、#D8A7A7、#FFFFFF、#A0A0A0、#C89F70

【不可丢失的风格锚点】
- Persistent top-left outlined square acting as a logo/hashtag container.
- Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.
- High-contrast, device-centric visual hierarchy.

【字体】
- Primary headers: Uppercase, wide letter-spacing, often stacked.
- Body text: Sentence case, regular weight, high line-height for readability.
- Highlight text: Subtle color shift to accent colors (rose gold) rather than relying purely on bold weights.

【封面页构图】
- Left-aligned boxed branding and title with a large, right-aligned vertical device mockup.

【内容页构图】
- Left text column contrasting with a right-aligned vertical mobile device mockup displaying a content card.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned boxed branding and title with a large, right-aligned vertical device mockup.","zones":["Left-aligned boxed branding and title with a large, right-aligned vertical device mockup."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["hero-device","dark-cover","split-layout"],"avoid":["Heavy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Deck introductions","App reveals"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-screen","purpose":"Mobile app UI or vibrant feature image","bbox":[0.55,0.15,0.35,0.7],"priority":1}]}
- section: {"id":"section-primary","composition":"Standard left text column with a large, square-cropped atmospheric image on the right featuring an icon overlay.","zones":["Standard left text column with a large, square-cropped atmospheric image on the right featuring an icon overlay."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["square-media","image-overlay","split-layout"],"avoid":["Detailed data display","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Core concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-media","purpose":"Atmospheric, thematic background image","bbox":[0.55,0.1,0.4,0.8],"priority":1}]}
- content: [{"id":"content-content","composition":"Left text column contrasting with a right-aligned vertical mobile device mockup displaying a content card.","zones":["Left text column contrasting with a right-aligned vertical mobile device mockup displaying a content card."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["device-mockup","feature-callout"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Single feature highlight","UI demonstration"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"ui-screen-1","purpose":"App interface or screenshot","bbox":[0.6,0.1,0.28,0.8],"priority":1}]},{"id":"content-comparison","composition":"Left column featuring icon-paired list items, paired with a right-aligned vertical mobile device mockup.","zones":["Left column featuring icon-paired list items, paired with a right-aligned vertical mobile device mockup."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["icon-list","device-mockup"],"avoid":["Hero introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Navigation breakdowns"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"ui-screen-2","purpose":"App interface showing a grid or list","bbox":[0.6,0.1,0.28,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left text column with a right-side hierarchical diagram composed of aligned, rounded-rectangle cards.","zones":["Left text column with a right-side hierarchical diagram composed of aligned, rounded-rectangle cards."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["card-grid","diagram","architecture"],"avoid":["Photographic portfolios","copying source assets, source text, or an exact source arrangement"],"best_for":["System architecture","Feature categorization","Sitemaps"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Standard left text column with a large, square-cropped atmospheric image on the right featuring an icon overlay.","zones":["Standard left text column with a large, square-cropped atmospheric image on the right featuring an icon overlay."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["square-media","image-overlay","split-layout"],"avoid":["Detailed data display","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Core concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-media","purpose":"Atmospheric, thematic background image","bbox":[0.55,0.1,0.4,0.8],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background image with a dark overlay, centrally aligned square branding box, and minimalist footer text.","zones":["Full-bleed background image with a dark overlay, centrally aligned square branding box, and minimalist footer text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Persistent top-left outlined square acting as a logo/hashtag container.","Strict 1/3 to 2/3 split layouts where text consistently anchors to the left column.","High-contrast, device-centric visual hierarchy."],"optional_variants":["full-bleed-background","centered-branding"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact information display"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Atmospheric closing background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Background images: Desaturated, darkened, or heavily blurred to maintain contrast with overlaying text.
- Content images: Constrained within sharp device frames (mockups) or clean geometric shapes (squares/circles).
- Avatars: Cropped to perfect circles or neat uniform squares.

【图标与装饰】
- Line-art style icons for UI elements and lists.
- Highly detailed, semi-realistic icon renders used sparingly as full-slide section dividers.

【数据页构图】
- Left text column with a right-side hierarchical diagram composed of aligned, rounded-rectangle cards.

【图表风格】
- Flowcharts and data structures rendered as flat, rounded-rectangle cards.
- Card borders are thin, matching the primary accent colors, with structured, list-based text inside.

【章节页构图】
- Standard left text column with a large, square-cropped atmospheric image on the right featuring an icon overlay.

【收尾页构图】
- Full-bleed background image with a dark overlay, centrally aligned square branding box, and minimalist footer text.

【禁止】
- Avoid centering body text; strict left alignment is required for layout integrity.
- Do not use bright or neon background colors; the template relies on a dark, moody foundation.
- Avoid raw edge-to-edge content imagery without container frames or heavy darkening.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Mobile application pitch decks、Digital product feature walkthroughs、Creative agency portfolios、SaaS platform user flow demonstrations。
