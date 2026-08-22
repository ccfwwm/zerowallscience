# CO16粉色潮流PPT模版 · FG11【朋克酷风】 / linzi-punk-fg11-co16ppt-a9951c03

## 风格ID
linzi-punk-fg11-co16ppt-a9951c03

## 风格名称
CO16粉色潮流PPT模版 · FG11【朋克酷风】 / linzi-punk-fg11-co16ppt-a9951c03

## 风格描述
A high-contrast, cyberpunk-inspired template featuring vibrant neon accents, stark geometric framing, and asymmetrical layout structures.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Navy (#0a045c) as dominant grounding color, Hot Pink (#fa117d) and Purple (#5911fa) as primary vibrant accents, White (#ffffff) backgrounds, medium Grey (#777777) for body copy.
- fonts: Heavy, extended geometric sans-serif for prominent headings; clean, readable standard sans-serif for body text.
- spacing: Generous interior margins, with a fixed left structural column dedicated to global navigation/accents.
- shape_language: Sharp rectangles combined with striking equilateral triangles and circular nodes.
- texture: Flat graphics contrasted against 'glowing' neon stroke effects and rich photographic backgrounds.
- grid: Asymmetrical vertical splits (typically 30/70, 40/60, or full-width edge-to-edge).
- motion_or_depth: Depth created by layering vibrant floating images over solid dark background blocks and overlapping text elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「CO16粉色潮流PPT模版 · FG11【朋克酷风】 / linzi-punk-fg11-co16ppt-a9951c03」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A high-contrast, cyberpunk-inspired template featuring vibrant neon accents, stark geometric framing, and asymmetrical layout structures.
- 推荐配色：#0a045c、#fa117d、#5911fa、#ffffff、#777777

【不可丢失的风格锚点】
- Recurring left-margin vertical text rotated 90 degrees with three alignment dots.
- Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.
- High-contrast solid navy color blocks used to frame or anchor floating images and text.
- Neon-style glowing outlines on large central geometric shapes (triangles, circles).

【字体】
- Headings use massive weight and combine dark grey with hot pink words for emphasis.
- Body text is low-contrast (medium grey on white) to recede behind strong graphical elements.
- Small functional text (footers, sidebars) uses high tracking (letter-spacing) for a technical feel.

【封面页构图】
- Full-bleed background image with a large, glowing central geometric shape framing centralized typography.

【内容页构图】
- Two-thirds white space on left with text, one-third dark block on right, overlaid with staggered vertical images.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with a large, glowing central geometric shape framing centralized typography.","zones":["Full-bleed background image with a large, glowing central geometric shape framing centralized typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["neon-cover","full-bleed","centered"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_bg","purpose":"Full bleed thematic background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Left half contains a dark background framing multiple overlapping images, right half is bright with typography.","zones":["Left half contains a dark background framing multiple overlapping images, right half is bright with typography."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["image-collage","split-screen","narrative"],"avoid":["Complex data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Event summaries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img_left_tall","purpose":"Atmospheric tall crop","bbox":[0.29,0.1,0.23,0.8],"priority":1},{"id":"img_left_short","purpose":"Detail crop","bbox":[0.05,0.4,0.23,0.5],"priority":2}]}
- content: [{"id":"content-content","composition":"Two-thirds white space on left with text, one-third dark block on right, overlaid with staggered vertical images.","zones":["Two-thirds white space on left with text, one-third dark block on right, overlaid with staggered vertical images."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["staggered-images","split-layout","asymmetrical"],"avoid":["Extensive text documents","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Product showcases"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img_main","purpose":"Primary vertical showcase","bbox":[0.45,0.1,0.24,0.8],"priority":1},{"id":"img_secondary","purpose":"Supporting context","bbox":[0.7,0.1,0.24,0.55],"priority":2}]},{"id":"content-comparison","composition":"Profile layout with a portrait overlapping an L-shaped background color block, followed by text and skill bars on the right.","zones":["Profile layout with a portrait overlapping an L-shaped background color block, followed by text and skill bars on the right."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["profile","skill-bars","overlap"],"avoid":["General text content","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Speaker bios"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"portrait","purpose":"Subject portrait","bbox":[0.12,0.1,0.3,0.65],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three vibrant, solid-color vertical pricing cards aligned symmetrically on a white background.","zones":["Three vibrant, solid-color vertical pricing cards aligned symmetrically on a white background."],"content_capacity":{"density":"medium","max_items":9},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["pricing-table","three-columns","cards"],"avoid":["Heavy text narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Pricing models","Service tiers","Three-pillar concepts"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Two-thirds white space on left with text, one-third dark block on right, overlaid with staggered vertical images.","zones":["Two-thirds white space on left with text, one-third dark block on right, overlaid with staggered vertical images."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["staggered-images","split-layout","asymmetrical"],"avoid":["Extensive text documents","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Product showcases"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img_main","purpose":"Primary vertical showcase","bbox":[0.45,0.1,0.24,0.8],"priority":1},{"id":"img_secondary","purpose":"Supporting context","bbox":[0.7,0.1,0.24,0.55],"priority":2}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background image, centered typography enclosed in a glowing circle.","zones":["Full-bleed background image, centered typography enclosed in a glowing circle."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Recurring left-margin vertical text rotated 90 degrees with three alignment dots.","Small clustered geometric primitives (triangle, circle, square) used as top-left slide corner accents.","High-contrast solid navy color blocks used to frame or anchor floating images and text."],"optional_variants":["neon-closing","centered-circle","full-bleed"],"avoid":["Body content","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing statements","Q&A prompts","Final quotes"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_bg","purpose":"Thematic full bleed background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are mostly used full-bleed or in stark, un-rounded rectangular blocks.
- Photographs are often layered asynchronously over contrasting solid background blocks.

【图标与装饰】
- Minimal traditional iconography; relies instead on abstract geometric clusters (triangle/square/circle) to denote lists or sections.

【数据页构图】
- Three vibrant, solid-color vertical pricing cards aligned symmetrically on a white background.

【图表风格】
- Charts utilize 3D isometric columns stripped of axes, using vibrant gradients to denote value against a white background.

【章节页构图】
- Left half contains a dark background framing multiple overlapping images, right half is bright with typography.

【收尾页构图】
- Full-bleed background image, centered typography enclosed in a glowing circle.

【禁止】
- Avoid using soft pastels or muted earth tones that break the high-contrast 'neon' aesthetic.
- Do not round image corners; sharp geometry is essential to the theme.
- Avoid removing the left vertical accent, as it anchors the entire deck's layout system.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Entertainment industry pitches、Nightlife or festival event proposals、Trendy fashion or youth-oriented marketing decks、Cyberpunk or tech-focused creative portfolios。
