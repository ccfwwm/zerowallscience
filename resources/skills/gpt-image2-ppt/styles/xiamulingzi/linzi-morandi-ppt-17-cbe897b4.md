# 优雅线条（17）---木七设计 · ppt模板 / linzi-morandi-ppt-17-cbe897b4

## 风格ID
linzi-morandi-ppt-17-cbe897b4

## 风格名称
优雅线条（17）---木七设计 · ppt模板 / linzi-morandi-ppt-17-cbe897b4

## 风格描述
An elegant, editorial-style presentation template featuring organic shapes, warm terracotta tones, and a sophisticated magazine layout aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Textured off-white base with terracotta and mustard acting as bold accents and secondary background fills. Taupe used for softer support shapes.
- fonts: High-contrast classic Serif for headings (evoking fashion magazines); clean, lightweight Sans-serif for body copy.
- spacing: Loose, asymmetrical margins with varying gutters to create a collage-like, freeform rhythm.
- shape_language: Soft, fluid, organic blobs paired with sharp rectangular image frames.
- texture: Prominent use of a tactile, woven linen or watercolor paper texture across the background.
- grid: Deconstructed, asymmetrical multi-column grid heavily relying on overlapping layers rather than strict alignment.
- motion_or_depth: Flat layering with depth achieved through overlapping elements (text over images, shapes over images) rather than drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（17）---木七设计 · ppt模板 / linzi-morandi-ppt-17-cbe897b4」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style presentation template featuring organic shapes, warm terracotta tones, and a sophisticated magazine layout aesthetic.
- 推荐配色：#F2EBE5、#AF3E23、#DF8E3A、#C4AE96、#E5B67A

【不可丢失的风格锚点】
- Textured linen/paper background
- Fluid, organic 'amoeba' shapes in warm tones
- Thin, flowing contour line overlays
- Editorial-style oversized serif typography
- Asymmetrical, collage-like image framing

【字体】
- Use oversized, elegant serif fonts for headings, often breaking words across lines or shifting baselines for stylistic effect.
- Rotate large text elements 90 degrees to act as visual dividers.
- Use large, stylized numerals for section markers or pagination.
- Keep body text in a highly legible sans-serif, arranged in neat, justified or left-aligned blocks to contrast with fluid headings.

【封面页构图】
- Centralized typography anchored by large corner organic shapes and scattered geometric dots.

【内容页构图】
- Asymmetrical split with a staggered heading on the left and a right-aligned bleeding image.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centralized typography anchored by large corner organic shapes and scattered geometric dots.","zones":["Centralized typography anchored by large corner organic shapes and scattered geometric dots."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["minimal","abstract","textured"],"avoid":["Data heavy content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Vertical rotated text divider between a left-side image and a right-side solid text block.","zones":["Vertical rotated text divider between a left-side image and a right-side solid text block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["vertical-text","color-block"],"avoid":["Image galleries","Dense data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section intros","Key takeaways"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"hero_left_half","purpose":"Mood or section imagery","bbox":[0.0,0.0,0.4,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetrical split with a staggered heading on the left and a right-aligned bleeding image.","zones":["Asymmetrical split with a staggered heading on the left and a right-aligned bleeding image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["split-layout","staggered-text"],"avoid":["Timelines","Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Team profiles"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_right","purpose":"Showcase subject or lifestyle imagery","bbox":[0.62,0.0,0.38,1.0],"priority":1}]},{"id":"content-comparison","composition":"Top-right dominant image overlapped by organic shapes, with stacked text on the left and an oversized section number.","zones":["Top-right dominant image overlapped by organic shapes, with stacked text on the left and an oversized section number."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["quadrant-layout","overlapping-shapes"],"avoid":["Dense lists","Data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Project highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero_top_right","purpose":"Primary visual context","bbox":[0.36,0.05,0.6,0.65],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Asymmetrical split with a staggered heading on the left and a right-aligned bleeding image.","zones":["Asymmetrical split with a staggered heading on the left and a right-aligned bleeding image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["split-layout","staggered-text"],"avoid":["Timelines","Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Team profiles"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_right","purpose":"Showcase subject or lifestyle imagery","bbox":[0.62,0.0,0.38,1.0],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top-right dominant image overlapped by organic shapes, with stacked text on the left and an oversized section number.","zones":["Top-right dominant image overlapped by organic shapes, with stacked text on the left and an oversized section number."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["quadrant-layout","overlapping-shapes"],"avoid":["Dense lists","Data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Project highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero_top_right","purpose":"Primary visual context","bbox":[0.36,0.05,0.6,0.65],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Solid colored background with a prominent left-aligned image and large quotation/heading text overlaid with contour lines.","zones":["Solid colored background with a prominent left-aligned image and large quotation/heading text overlaid with contour lines."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["solid-background","quote-layout"],"avoid":["Data charts","Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Pull quotes","Key statements","Values/Mission"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"hero_left_block","purpose":"Subject portrait","bbox":[0.0,0.0,0.58,0.82],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-bleed background image with a solid colored border frame and large central overlapping typography.","zones":["Full-bleed background image with a solid colored border frame and large central overlapping typography."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Textured linen/paper background","Fluid, organic 'amoeba' shapes in warm tones","Thin, flowing contour line overlays"],"optional_variants":["full-bleed","framed-image"],"avoid":["Content delivery","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Thank you slides"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero_background","purpose":"Closing atmospheric image","bbox":[0.06,0.09,0.88,0.82],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Maintain images in strict rectangular or square frames to contrast with the organic background shapes.
- Allow images to bleed off the edges of the slide.
- Layer fluid abstract shapes over the corners or edges of images to integrate them into the background.

【图标与装饰】
- Minimal to no traditional iconography; rely on abstract geometric shapes and contour lines as decorative elements.

【数据页构图】
- Asymmetrical split with a staggered heading on the left and a right-aligned bleeding image.

【图表风格】
- Not present in the sample, but should adapt the organic shape language and warm color palette if introduced.

【章节页构图】
- Vertical rotated text divider between a left-side image and a right-side solid text block.

【收尾页构图】
- Full-bleed background image with a solid colored border frame and large central overlapping typography.

【禁止】
- Do not use harsh, rigid geometric backgrounds that clash with the organic fluid shapes.
- Avoid heavily saturated neon colors; stick to muted, earthy 'Morandi' tones.
- Do not use standard, bulky sans-serifs for primary headings, as it breaks the elegant editorial vibe.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle lookbooks、Creative agency portfolios、Editorial-style brand guidelines、Photography showcases。
