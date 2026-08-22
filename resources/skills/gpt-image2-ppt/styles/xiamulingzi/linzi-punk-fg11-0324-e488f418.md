# 0324 · FG11【朋克酷风】 / linzi-punk-fg11-0324-e488f418

## 风格ID
linzi-punk-fg11-0324-e488f418

## 风格名称
0324 · FG11【朋克酷风】 / linzi-punk-fg11-0324-e488f418

## 风格描述
Vibrant, brutalist punk presentation style featuring high-contrast colors, oversized typography, overlapping layouts, and signature chamfered geometric shapes.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Electric blue acts as the primary anchor, paired with high-contrast vibrant accents (red, yellow, mint) over cream or solid backgrounds.
- fonts: Heavy, wide geometric sans-serif for display headings; clean, standard sans-serif for highly legible body copy.
- spacing: Tight, overlapping elements utilizing intentional collisions, balanced by large areas of bold negative space.
- shape_language: Sharp geometric solids, dominated by rectangles featuring a single prominent diagonal cut (chamfer).
- texture: Predominantly flat, solid color blocks; occasionally contrasted with noisy, glitchy, or highly textured photographic elements.
- grid: Deconstructed modular grid; elements frequently span across column gutters and break outer bounding margins.
- motion_or_depth: Depth is achieved through flat, hard-edged layering and overlapping without the use of soft drop shadows or gradients.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「0324 · FG11【朋克酷风】 / linzi-punk-fg11-0324-e488f418」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Vibrant, brutalist punk presentation style featuring high-contrast colors, oversized typography, overlapping layouts, and signature chamfered geometric shapes.
- 推荐配色：#3D14FF、#F03C32、#FFF3E1、#FFC32D、#0A6E46、#6EE6D2

【不可丢失的风格锚点】
- Oversized, widely-spaced typography intersecting and overlapping images
- Solid rectangular containers with a single pronounced chamfered/cut corner
- Asymmetrical, layered brutalist composition breaking standard grid alignments
- Persistent branding badge anchored to the bottom-left corner across all slides

【字体】
- Headings act as structural graphic elements, often cropped at slide edges or layered behind/in front of images.
- Use extreme tracking (letter spacing) to force alignment or create dynamic tension.
- Body text is always housed within solid color containers or contrasting blank space for legibility.

【封面页构图】
- Full-bleed textured background with central layered typography (solid and outline) and a horizontal separator line.

【内容页构图】
- Left-weighted text blocks balanced by a right-aligned image with an offset solid-color backing rectangle.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed textured background with central layered typography (solid and outline) and a horizontal separator line.","zones":["Full-bleed textured background with central layered typography (solid and outline) and a horizontal separator line."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["hero-title","textured-bg","layered-text"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full bleed atmospheric background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical layout with cropped background typography, central floating image, and an offset chamfered text container.","zones":["Asymmetrical layout with cropped background typography, central floating image, and an offset chamfered text container."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["asymmetrical","floating-image","chamfer-callout"],"avoid":["Bullet-heavy lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Image paired with a key message","Profile highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-portrait","purpose":"Focal image anchoring the composition","bbox":[0.33,0.11,0.34,0.77],"priority":1}]}
- content: [{"id":"content-content","composition":"Left-weighted text blocks balanced by a right-aligned image with an offset solid-color backing rectangle.","zones":["Left-weighted text blocks balanced by a right-aligned image with an offset solid-color backing rectangle."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["two-column","image-shadow-block","heavy-typography"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Statement quotes paired with imagery","Product feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-image","purpose":"Supporting visual context","bbox":[0.49,0,0.42,0.54],"priority":1}]},{"id":"content-comparison","composition":"Split composition: left image spanning vertically, right heavy typography with twin chamfered text boxes.","zones":["Split composition: left image spanning vertically, right heavy typography with twin chamfered text boxes."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["split-screen","twin-callouts","vertical-image"],"avoid":["Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Core value propositions","Mission statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-vertical","purpose":"High-impact supporting visual","bbox":[0,0,0.41,1],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Strict vertical split: clean bar chart on neutral left, stacked chamfered text boxes on solid colored right.","zones":["Strict vertical split: clean bar chart on neutral left, stacked chamfered text boxes on solid colored right."],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["bar-chart","split-layout","data-takeaways"],"avoid":["Emotional or narrative storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Data visualization","Metric summaries"],"evidence_pages":["page-09"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical layout with cropped background typography, central floating image, and an offset chamfered text container.","zones":["Asymmetrical layout with cropped background typography, central floating image, and an offset chamfered text container."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["asymmetrical","floating-image","chamfer-callout"],"avoid":["Bullet-heavy lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Image paired with a key message","Profile highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-portrait","purpose":"Focal image anchoring the composition","bbox":[0.33,0.11,0.34,0.77],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Wide panoramic image container heavily overlapped by massive cropped typography and a solid chamfered text block.","zones":["Wide panoramic image container heavily overlapped by massive cropped typography and a solid chamfered text block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Oversized, widely-spaced typography intersecting and overlapping images","Solid rectangular containers with a single pronounced chamfered/cut corner","Asymmetrical, layered brutalist composition breaking standard grid alignments"],"optional_variants":["panoramic-image","macro-typography","text-overlay"],"avoid":["Complex explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Manifesto statements","Impactful quotes"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"pano-background","purpose":"Immersive thematic visual","bbox":[0.08,0.13,0.83,0.73],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are treated as solid structural blocks with hard, unfeathered edges.
- Frequently offset against solid color background rectangles to create faux-framing.
- Integration into device mockups (phones, laptops) is clean and borderless.

【图标与装饰】
- Iconography is largely absent, relying instead on bold typography and strong color blocking for visual hierarchy.

【数据页构图】
- Strict vertical split: clean bar chart on neutral left, stacked chamfered text boxes on solid colored right.

【图表风格】
- Minimalist 2D bar charts using the vibrant primary palette.
- Thin, subtle horizontal grid lines with no 3D effects, gradients, or extraneous chart junk.

【章节页构图】
- Asymmetrical layout with cropped background typography, central floating image, and an offset chamfered text container.

【收尾页构图】
- Full-bleed textured background with central layered typography (solid and outline) and a horizontal separator line.

【禁止】
- Soft drop shadows or glowing effects.
- Rounded corners (except for intentional sharp chamfers).
- Delicate, thin fonts for primary headings.
- Centered, perfectly symmetrical, conservative layouts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Youth-oriented marketing campaigns、Edgy tech or fashion product launches、Trend forecasting reports。
