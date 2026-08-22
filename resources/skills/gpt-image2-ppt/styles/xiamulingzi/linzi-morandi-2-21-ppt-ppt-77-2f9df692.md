# 77 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-77-2f9df692

## 风格ID
linzi-morandi-2-21-ppt-ppt-77-2f9df692

## 风格名称
77 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-77-2f9df692

## 风格描述
Minimalist editorial presentation featuring asymmetrical overlapping blocks, muted beige accents, light textured structural panels, and generous whitespace.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White dominates as negative space, muted beige acts as the primary focal accent, black for primary headings, and medium gray for secondary body text.
- fonts: Bold geometric sans-serif for display and headers; clean, legible neutral sans-serif for body copy.
- spacing: Generous margins with asymmetrical padding. Spacing is driven by the arrangement of structural blocks rather than a strict traditional grid.
- shape_language: Strictly orthogonal: sharp-cornered rectangles, squares, and clean device mockups. No rounded corners.
- texture: Heavy reliance on light, organic textures (like white marble) used as full-bleed backgrounds or large structural vertical/horizontal bands.
- grid: Modular, asymmetrical grid where elements deliberately overlap adjacent panels to break rigid alignment lines.
- motion_or_depth: Mostly flat layered planes, utilizing subtle drop shadows on specific focal elements (like photos or floating text boxes) to create shallow depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「77 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-77-2f9df692」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist editorial presentation featuring asymmetrical overlapping blocks, muted beige accents, light textured structural panels, and generous whitespace.
- 推荐配色：#FFFFFF、#C4AF8B、#111111、#7A7A7A、#E8E8E8

【不可丢失的风格锚点】
- Asymmetrical overlapping geometric blocks
- Prominent use of light textured panels (e.g., marble) as structural backgrounds
- Muted, desaturated aesthetic with beige/khaki accents
- High contrast bold sans-serif typography paired with ample whitespace

【字体】
- Headings in bold, often uppercase, with tight tracking
- Body text set in muted gray to lower contrast and maintain a soft aesthetic
- Use of oversized numerals for section markers
- Integration of distinct text boxes that physically overlap images or textured backgrounds

【封面页构图】
- Full-width textured horizontal band with a centered, overlapping colored text box.

【内容页构图】
- Left thin vertical textured strip, large central landscape image, right floating colored text box overlapping the image edge.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-width textured horizontal band with a centered, overlapping colored text box.","zones":["Full-width textured horizontal band with a centered, overlapping colored text box."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["centered","horizontal-band","high-impact"],"avoid":["Data-heavy content","Multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned text column, right floating image card overlapping a split color/texture background.","zones":["Left-aligned text column, right floating image card overlapping a split color/texture background."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["split-background","floating-card","asymmetrical"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Topic introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-feature","purpose":"Focus image or portrait","bbox":[0.2,0.57,0.27,0.53],"priority":1}]}
- content: [{"id":"content-content","composition":"Left thin vertical textured strip, large central landscape image, right floating colored text box overlapping the image edge.","zones":["Left thin vertical textured strip, large central landscape image, right floating colored text box overlapping the image edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["image-heavy","floating-title","minimalist"],"avoid":["Detailed explanations","Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Visual transitions","Striking singular statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"hero-landscape","purpose":"Primary background or feature image","bbox":[0.18,0.27,0.65,0.64],"priority":1}]},{"id":"content-comparison","composition":"Laptop mockup framing an image, an overlapping colored text block, and right-aligned text with an oversized quote icon.","zones":["Laptop mockup framing an image, an overlapping colored text block, and right-aligned text with an oversized quote icon."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["device-mockup","overlapping-elements","digital-portfolio"],"avoid":["Physical product specs","copying source assets, source text, or an exact source arrangement"],"best_for":["Digital product showcases","Website portfolio pieces"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"screen-content","purpose":"Image displayed inside the laptop mockup","bbox":[0.26,0.08,0.4,0.48],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned text column, right floating image card overlapping a split color/texture background.","zones":["Left-aligned text column, right floating image card overlapping a split color/texture background."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["split-background","floating-card","asymmetrical"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Topic introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-feature","purpose":"Focus image or portrait","bbox":[0.2,0.57,0.27,0.53],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left large image with an overlapping colored text block, vertical textured divider, right text block with oversized quotation mark.","zones":["Left large image with an overlapping colored text block, vertical textured divider, right text block with oversized quotation mark."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["quote","vertical-divider","overlapping-text"],"avoid":["Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Client testimonials","Core values","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"quote-image","purpose":"Contextual image for the quote or section","bbox":[0.15,0.19,0.3,0.7],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Left large image with an overlapping colored text block, vertical textured divider, right text block with oversized quotation mark.","zones":["Left large image with an overlapping colored text block, vertical textured divider, right text block with oversized quotation mark."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["quote","vertical-divider","overlapping-text"],"avoid":["Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Client testimonials","Core values","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"quote-image","purpose":"Contextual image for the quote or section","bbox":[0.15,0.19,0.3,0.7],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-width textured horizontal band with a centered overlapping accent text box (similar to cover).","zones":["Full-width textured horizontal band with a centered overlapping accent text box (similar to cover)."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical overlapping geometric blocks","Prominent use of light textured panels (e.g., marble) as structural backgrounds","Muted, desaturated aesthetic with beige/khaki accents"],"optional_variants":["closing","symmetrical","centered-box"],"avoid":["Content summaries","Q&A details","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Photos are desaturated, black-and-white, or color-graded to match the muted warm palette
- Images placed in sharp rectangular frames or integrated into photorealistic device mockups
- Bleeding edges mixed with floating, shadow-casted 'polaroid-style' frames

【图标与装饰】
- Minimalist line icons in beige accent color
- Oversized decorative quotation marks used as graphic elements
- Circular checkmarks for lists

【数据页构图】
- Left-aligned text column, right floating image card overlapping a split color/texture background.

【图表风格】
- Relies on typography, layout hierarchy, and image blocks for information density rather than traditional data visualizations

【章节页构图】
- Left-aligned text column, right floating image card overlapping a split color/texture background.

【收尾页构图】
- Full-width textured horizontal band with a centered overlapping accent text box (similar to cover).

【禁止】
- Avoid bright, saturated, or neon colors
- Avoid rounded corners on shapes and images
- Avoid cluttered, dense text blocks that eliminate whitespace
- Do not use heavy 3D bevels or gradients
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or editorial lookbooks、Architecture and interior design portfolios、Premium brand identity pitches、Creative agency credentials。
