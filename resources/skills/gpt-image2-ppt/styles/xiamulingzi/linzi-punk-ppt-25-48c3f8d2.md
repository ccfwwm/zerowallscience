# 大理石 (25) · ppt模板 / linzi-punk-ppt-25-48c3f8d2

## 风格ID
linzi-punk-ppt-25-48c3f8d2

## 风格名称
大理石 (25) · ppt模板 / linzi-punk-ppt-25-48c3f8d2

## 风格描述
Modern vaporwave presentation featuring holographic 3D graphics, geometric primitives, pastel gradients, and split layouts with bold sans-serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white backgrounds with vibrant purple, pink, and indigo accents; dark charcoal for text.
- fonts: Bold, extended sans-serif for headers; clean, legible sans-serif for body text. Title text occasionally adopts the primary purple color.
- spacing: Generous margins with clear 50/50 or 40/60 vertical splits. Minimal text clustering.
- shape_language: Fluid organic shapes contrasting with strict geometric primitives (circles, triangles, lines).
- texture: Smooth, glossy 3D surfaces and soft iridescent gradients.
- grid: Primarily 2-column layouts with asymmetrical masonry grids for image collages.
- motion_or_depth: High depth achieved through overlapping 3D elements, varied scales, and blurred background accents simulating depth of field.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「大理石 (25) · ppt模板 / linzi-punk-ppt-25-48c3f8d2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Modern vaporwave presentation featuring holographic 3D graphics, geometric primitives, pastel gradients, and split layouts with bold sans-serif typography.
- 推荐配色：#F4F6F6、#A569BD、#F48FB1、#5C6BC0、#1E1E1E

【不可丢失的风格锚点】
- Holographic and iridescent gradients
- Floating 3D geometric primitives (torus, sphere, pyramid)
- Thin white intersecting lines and geometric wireframes
- High-contrast split layouts (text vs graphic/image)

【字体】
- Titles should be bold, tracked out slightly, and can occasionally overlap graphic elements.
- Body text is kept relatively small, left-aligned, and restricted to narrow columns to ensure readability.
- Use uppercase tracking for small subheadings or labels.

【封面页构图】
- Central massive abstract graphic with overlapping centered large title and subtle corner decorations.

【内容页构图】
- Left-aligned vertical graphic block, right-aligned text block, bottom right CTA button.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central massive abstract graphic with overlapping centered large title and subtle corner decorations.","zones":["Central massive abstract graphic with overlapping centered large title and subtle corner decorations."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["hero-graphic","centered-text"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-graphic","purpose":"Central abstract composition","bbox":[0.2,0.1,0.6,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Central large text over a faded abstract background with concentric circular wireframes.","zones":["Central large text over a faded abstract background with concentric circular wireframes."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["section-break","centered"],"avoid":["Body content","Images","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Quotes"],"evidence_pages":["page-04"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left-aligned vertical graphic block, right-aligned text block, bottom right CTA button.","zones":["Left-aligned vertical graphic block, right-aligned text block, bottom right CTA button."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["left-graphic","right-text","cta-button"],"avoid":["Complex data","Full-screen images","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Service introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-graphic","purpose":"Illustrative graphic or image","bbox":[0.05,0.1,0.25,0.8],"priority":1}]},{"id":"content-comparison","composition":"Diagonal layout balance: top-right graphic block, bottom-left text block.","zones":["Diagonal layout balance: top-right graphic block, bottom-left text block."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["diagonal-balance","top-right-image"],"avoid":["Heavy text","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-graphic","purpose":"Abstract visual","bbox":[0.5,0.0,0.5,0.5],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned vertical graphic block, right-aligned text block, bottom right CTA button.","zones":["Left-aligned vertical graphic block, right-aligned text block, bottom right CTA button."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["left-graphic","right-text","cta-button"],"avoid":["Complex data","Full-screen images","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Service introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-graphic","purpose":"Illustrative graphic or image","bbox":[0.05,0.1,0.25,0.8],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Diagonal layout balance: top-right graphic block, bottom-left text block.","zones":["Diagonal layout balance: top-right graphic block, bottom-left text block."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["diagonal-balance","top-right-image"],"avoid":["Heavy text","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-graphic","purpose":"Abstract visual","bbox":[0.5,0.0,0.5,0.5],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Identical layout to the cover slide, functioning as a bookend.","zones":["Identical layout to the cover slide, functioning as a bookend."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Holographic and iridescent gradients","Floating 3D geometric primitives (torus, sphere, pyramid)","Thin white intersecting lines and geometric wireframes"],"optional_variants":["bookend","centered-text"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Thank you pages"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero-graphic-closing","purpose":"Central abstract composition","bbox":[0.2,0.1,0.6,0.8],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are embedded into clean rectangular collages or displayed inside device mockups.
- Abstract graphics are used as massive focal points rather than traditional photography in text slides.

【图标与装饰】
- Minimal iconography; relies instead on small geometric glyphs (zig-zags, chevrons, crosses) as decorative accents.

【数据页构图】
- Left-aligned vertical graphic block, right-aligned text block, bottom right CTA button.

【图表风格】
- No traditional data charts present. Data should adopt the holographic 3D aesthetic if introduced.

【章节页构图】
- Central large text over a faded abstract background with concentric circular wireframes.

【收尾页构图】
- Identical layout to the cover slide, functioning as a bookend.

【禁止】
- Avoid flat, 2D vector illustrations that clash with the glossy 3D aesthetic.
- Do not center-align long blocks of body text.
- Avoid dense walls of text; keep content sparse to let graphics breathe.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Trendy product pitches、Design and art presentations、Youth-oriented brand decks。
