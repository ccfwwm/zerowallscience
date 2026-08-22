# 25 · 3.07更新高级色25 / linzi-morandi-3-0725-25-26a8efe1

## 风格ID
linzi-morandi-3-0725-25-26a8efe1

## 风格名称
25 · 3.07更新高级色25 / linzi-morandi-3-0725-25-26a8efe1

## 风格描述
An elegant, minimalist presentation template featuring a Morandi color palette, fluid organic background shapes, and delicate botanical line art.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white background for canvas, dark brown for primary text and icons, sage and blush for background vector blobs.
- fonts: Sophisticated serif or elegant transitional fonts for titles, paired with clean, readable sans-serif or soft rounded fonts for body text.
- spacing: Generous margins with wide, airy gutters between evenly distributed multi-column content.
- shape_language: Contrast between fluid, organic background elements and strict, geometric content containers (squares, circles).
- texture: Flat color fields layered with thin, mono-weight illustrative botanical lines.
- grid: Symmetrical, center-aligned macro structures with rigid 3- and 4-column horizontal divisions.
- motion_or_depth: Strictly flat 2D layering with background shapes resting behind distinct text and image blocks.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「25 · 3.07更新高级色25 / linzi-morandi-3-0725-25-26a8efe1」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template featuring a Morandi color palette, fluid organic background shapes, and delicate botanical line art.
- 推荐配色：#F4F3EF、#3A2723、#929E8D、#D99C8D

【不可丢失的风格锚点】
- Muted, earthy Morandi color scheme
- Asymmetrical fluid background blobs
- Delicate, hand-drawn botanical line art accents
- Deep brown high-contrast primary text

【字体】
- Center-align titles and subtitles on cover and section slides
- Use deep brown instead of pure black for softer but highly legible contrast
- Apply generous line-height to body text to maintain an airy, elegant feel

【封面页构图】
- Centered dominant title and subtitle framed by asymmetrical organic shapes and delicate line art in the corners

【内容页构图】
- Four evenly spaced vertical cards connected by a horizontal timeline axis with numbered nodes at the bottom

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered dominant title and subtitle framed by asymmetrical organic shapes and delicate line art in the corners","zones":["Centered dominant title and subtitle framed by asymmetrical organic shapes and delicate line art in the corners"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["minimal-cover","centered-text","organic-frame"],"avoid":["Detailed agendas","Content lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation openings","Title slides"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered numeric badge above a prominent section title, flanked by large organic edge blobs","zones":["Centered numeric badge above a prominent section title, flanked by large organic edge blobs"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["section-break","numeric-badge","clean-center"],"avoid":["Body content","Data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Transition slides"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four evenly spaced vertical cards connected by a horizontal timeline axis with numbered nodes at the bottom","zones":["Four evenly spaced vertical cards connected by a horizontal timeline axis with numbered nodes at the bottom"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["4-step-process","bottom-timeline","vertical-cards"],"avoid":["Complex data comparisons","Paragraph-heavy descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Timelines","Sequential phases"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Two-column layout featuring an image anchored on a dark text block on the left, and a vertical list of icons and text on the right","zones":["Two-column layout featuring an image anchored on a dark text block on the left, and a vertical list of icons and text on the right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["image-overlap","vertical-list","2-column-split"],"avoid":["Process flows","Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Service descriptions"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"editorial_image","purpose":"Thematic illustration","bbox":[0.12,0.2,0.2,0.35],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split upper layout with an image and a framed statistic callout, resting above a three-column numbered text row","zones":["Split upper layout with an image and a framed statistic callout, resting above a three-column numbered text row"],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["split-top","stat-callout","3-column-bottom"],"avoid":["Single narrative flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Key performance indicators","Mixed media summaries"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"context_image","purpose":"Visual anchor for the statistic","bbox":[0.1,0.2,0.3,0.3],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered numeric badge above a prominent section title, flanked by large organic edge blobs","zones":["Centered numeric badge above a prominent section title, flanked by large organic edge blobs"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["section-break","numeric-badge","clean-center"],"avoid":["Body content","Data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Transition slides"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Minimalist centered text block resting in an open canvas framed by subtle edge graphics","zones":["Minimalist centered text block resting in an open canvas framed by subtle edge graphics"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy Morandi color scheme","Asymmetrical fluid background blobs","Delicate, hand-drawn botanical line art accents"],"optional_variants":["minimal-closing","centered-text","subtle-frame"],"avoid":["Data presentation","Complex structural content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Colophons","Final remarks"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use hard-edged geometric crops (squares or wide rectangles)
- Embed images within or layered over solid dark brown foundational blocks or thick frames
- Avoid full-bleed backgrounds to preserve the organic vector framing

【图标与装饰】
- Use solid, minimalist dark brown icons
- Enclose icons or sequence numbers in geometric shapes (circles or squares) for structure

【数据页构图】
- Split upper layout with an image and a framed statistic callout, resting above a three-column numbered text row

【图表风格】
- Rely on large, isolated typographic callouts or framed statistic blocks instead of dense data visualizations

【章节页构图】
- Centered numeric badge above a prominent section title, flanked by large organic edge blobs

【收尾页构图】
- Minimalist centered text block resting in an open canvas framed by subtle edge graphics

【禁止】
- Do not use bright neon or primary colors
- Avoid heavy drop shadows or 3D effects
- Do not place images edge-to-edge covering the entire slide canvas
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Brand guidelines and aesthetic overviews、Creative agency pitches、Wedding or event planning proposals、Soft-skills training or wellness presentations。
