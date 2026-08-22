# 33 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-33-29053078

## 风格ID
linzi-morandi-2-21-ppt-ppt-33-29053078

## 风格名称
33 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-33-29053078

## 风格描述
A minimalist, artistic presentation template featuring Morandi tones, organic blob backgrounds, and a global dappled leaf shadow effect.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light grey base with dusty terracotta, slate teal, and sand organic background shapes; charcoal black for primary text.
- fonts: Modern, elegant sans-serif for all text; prominent use of uppercase and wide tracking in titles.
- spacing: Airy, open layouts leveraging negative space around organic background curves.
- shape_language: Contrast between organic, fluid background forms and strict geometric foreground elements (rounded rectangles, perfect circles).
- texture: Smooth, matte vector shapes contrasted with a soft, photorealistic dappled shadow overlay.
- grid: Loose, asymmetrical grid guided by the curves of the background shapes.
- motion_or_depth: Depth is primarily achieved through the global faux-shadow overlay, making the slides feel like physical paper lit through foliage.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「33 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-33-29053078」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, artistic presentation template featuring Morandi tones, organic blob backgrounds, and a global dappled leaf shadow effect.
- 推荐配色：#E2E4E6、#C8988C、#3F5E5C、#D9B484、#1A1A1A

【不可丢失的风格锚点】
- Global dappled lighting/shadow overlay
- Fluid, organic background color blocking
- Large, occasionally angled typography for structural markers
- Generously rounded corners on media elements

【字体】
- Titles use high-contrast sizes, sometimes dynamically broken (e.g., dropped letters) or angled.
- Body copy is kept small and tightly grouped.
- Subtitles and small labels use muted slate teal.

【封面页构图】
- Centered macro typography with a deliberately offset single character, positioned over organic fluid background.

【内容页构图】
- Split asymmetric layout with a full-width dark horizontal banner behind a prominent, rounded-corner image container.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered macro typography with a deliberately offset single character, positioned over organic fluid background.","zones":["Centered macro typography with a deliberately offset single character, positioned over organic fluid background."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["macro-typography","offset-text","artistic-cover"],"avoid":["Dense corporate title pages","copying source assets, source text, or an exact source arrangement"],"best_for":["Impactful title slides","Minimalist artistic intros"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Large, tilted numbering in the top left, with centered title and subtitle block.","zones":["Large, tilted numbering in the top left, with centered title and subtitle block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["angled-text","section-divider","minimal-center"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter intros"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split asymmetric layout with a full-width dark horizontal banner behind a prominent, rounded-corner image container.","zones":["Split asymmetric layout with a full-width dark horizontal banner behind a prominent, rounded-corner image container."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["split-layout","image-overlap","banner-background"],"avoid":["Heavy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Case study introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-image-right","purpose":"Primary subject showcase","bbox":["0.58","0.26","0.33","0.39"],"priority":1}]},{"id":"content-comparison","composition":"Large left-aligned vertical image container with highly rounded corners, paired with right-aligned title and body content.","zones":["Large left-aligned vertical image container with highly rounded corners, paired with right-aligned title and body content."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["image-left","text-right","rounded-media"],"avoid":["Dense comparative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Product feature deep-dives","Team member profiles"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"vertical-hero","purpose":"Main visual anchor","bbox":["0.12","0.15","0.28","0.66"],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Horizontal flow of four circular nodes connected by a thin line, alternating between filled and outlined styles.","zones":["Horizontal flow of four circular nodes connected by a thin line, alternating between filled and outlined styles."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["process-nodes","horizontal-flow","circle-diagram"],"avoid":["Hierarchical org charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Key metrics row","Feature comparisons"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split asymmetric layout with a full-width dark horizontal banner behind a prominent, rounded-corner image container.","zones":["Split asymmetric layout with a full-width dark horizontal banner behind a prominent, rounded-corner image container."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["split-layout","image-overlap","banner-background"],"avoid":["Heavy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Case study introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content-image-right","purpose":"Primary subject showcase","bbox":["0.58","0.26","0.33","0.39"],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered large closing message over organic background, with dual signature/date fields at the bottom.","zones":["Centered large closing message over organic background, with dual signature/date fields at the bottom."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Global dappled lighting/shadow overlay","Fluid, organic background color blocking","Large, occasionally angled typography for structural markers"],"optional_variants":["thank-you","centered","meta-footer"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact info slides"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are contained within heavily rounded rectangles.
- No borders or strokes; images blend softly with the background elements.

【图标与装饰】
- Thin, clean, stroke-based icons.
- Placed within prominent geometric containers (circles, layered folders).

【数据页构图】
- Horizontal flow of four circular nodes connected by a thin line, alternating between filled and outlined styles.

【图表风格】
- Non-standard, highly customized data visualization (e.g., stylized folder stacks representing progress or volume).
- Data points use alternating transparent and filled colored bars.

【章节页构图】
- Large, tilted numbering in the top left, with centered title and subtitle block.

【收尾页构图】
- Centered large closing message over organic background, with dual signature/date fields at the bottom.

【禁止】
- Avoid placing small body text over the darkest parts of the background shadow effect to maintain legibility.
- Do not use sharp-cornered images or harsh borders, which break the soft aesthetic.
- Avoid primary bright/neon colors; stick to muted, desaturated tones.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios、Art and design proposals、Lifestyle or wellness brand pitches、Minimalist lookbooks。
