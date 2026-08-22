# 优雅线条（49）---木七设计 · ppt模板 / linzi-morandi-ppt-49-c1187294

## 风格ID
linzi-morandi-ppt-49-c1187294

## 风格名称
优雅线条（49）---木七设计 · ppt模板 / linzi-morandi-ppt-49-c1187294

## 风格描述
An elegant, minimalist template utilizing Morandi purple tones, geometric circle motifs, and structured grids, ideal for academic or artistic presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary dark muted purple for text and major emphasis blocks; lighter lavender for backgrounds, secondary shapes, and overlapping motifs; off-white for the main slide background.
- fonts: Elegant Serif (Songti/Mincho) for primary titles, section headers, and quotes. Clean Sans-serif for body copy and data labels.
- spacing: Generous outer margins to accommodate the persistent corner geometric motifs. Content is usually heavily padded within colored blocks.
- shape_language: Primarily circular (both solid and striped) combined with sharp rectangles and occasional trapezoidal/perspective forms.
- texture: Flat vector geometry combined with diagonal stripe patterns to simulate a lightweight texture.
- grid: Symmetrical centered alignments for covers/sections; strict 3-column and 4-column horizontal divisions for content.
- motion_or_depth: Depth is created purely through 2D overlapping of shapes with varying opacity and the interplay of striped vs. solid elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（49）---木七设计 · ppt模板 / linzi-morandi-ppt-49-c1187294」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist template utilizing Morandi purple tones, geometric circle motifs, and structured grids, ideal for academic or artistic presentations.
- 推荐配色：#F7F6F5、#766683、#B1A5BF、#9889A7

【不可丢失的风格锚点】
- Opposing corner decorations featuring overlapping solid and diagonally striped circles
- Large central circular frames for section transitions
- Muted Morandi purple color scheme with low-contrast, calming aesthetic
- Use of elegant Serif typography for primary headings to establish a formal tone

【字体】
- Headings: Serif, high-contrast, centered or left-aligned depending on layout, often using all-caps for English subtitles.
- Body text: Sans-serif, small, medium weight, usually in white or dark purple depending on the background shape.
- Alignment: Text blocks within structural cards are strictly centered or left-justified.

【封面页构图】
- Centered title and subtitles flanked by top-left and bottom-right overlapping striped and solid circle clusters.

【内容页构图】
- Three-column vertical split: left solid color column for context, middle vertical image bleed, right white column for icon-driven list items.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitles flanked by top-left and bottom-right overlapping striped and solid circle clusters.","zones":["Centered title and subtitles flanked by top-left and bottom-right overlapping striped and solid circle clusters."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["minimal","centered","geometric-corners"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Welcome screens"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Giant central solid-colored circle containing white centered text, acting as a section break, framed by standard corner geometry.","zones":["Giant central solid-colored circle containing white centered text, acting as a section break, framed by standard corner geometry."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["big-circle","section-break","minimal"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three-column vertical split: left solid color column for context, middle vertical image bleed, right white column for icon-driven list items.","zones":["Three-column vertical split: left solid color column for context, middle vertical image bleed, right white column for icon-driven list items."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["vertical-split","three-column","image-divider"],"avoid":["Single continuous narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Process overview","Feature comparison","Context setting"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"split-image","purpose":"contextual separator","bbox":[0.34,0.0,0.33,1.0],"priority":1}]},{"id":"content-comparison","composition":"Central vertical image bounded by left and right columns containing stacked, solid-colored text cards with top-aligned icons.","zones":["Central vertical image bounded by left and right columns containing stacked, solid-colored text cards with top-aligned icons."],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["symmetrical","image-center","card-grid"],"avoid":["Chronological timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Methodology breakdown","Core feature lists","Quad-chart concepts"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"center-image","purpose":"core visual focus","bbox":[0.28,0.23,0.44,0.67],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four equidistant columns. The upper row features solid colored trapezoidal blocks containing icons. The lower row features corresponding titles and paragraphs.","zones":["Four equidistant columns. The upper row features solid colored trapezoidal blocks containing icons. The lower row features corresponding titles and paragraphs."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["four-columns","trapezoid-headers","icon-list"],"avoid":["Long paragraphs of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Sequential steps","Value propositions","Category overviews"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: A large, centralized rectangular card with rounded edges, containing a centered heading, a paragraph block, and bottom-aligned pill-shaped buttons.","zones":["A large, centralized rectangular card with rounded edges, containing a centered heading, a paragraph block, and bottom-aligned pill-shaped buttons."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["card-layout","framed-text","summary"],"avoid":["Multiple distinct lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Abstracts","Executive summaries","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"A large, centralized rectangular card with rounded edges, containing a centered heading, a paragraph block, and bottom-aligned pill-shaped buttons.","zones":["A large, centralized rectangular card with rounded edges, containing a centered heading, a paragraph block, and bottom-aligned pill-shaped buttons."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["card-layout","framed-text","summary"],"avoid":["Multiple distinct lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Abstracts","Executive summaries","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[]}
- quote: {"id":"quote-primary","composition":"A large horizontal rectangular banner stretching across the middle right, overlapped on the left by a prominent circular image frame. Contains a large quote mark graphic.","zones":["A large horizontal rectangular banner stretching across the middle right, overlapped on the left by a prominent circular image frame. Contains a large quote mark graphic."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["overlap-layout","circular-image","quote-banner"],"avoid":["Complex data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Pull quotes","Team member introductions"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"avatar-or-focus","purpose":"visual anchor for the quote","bbox":[0.08,0.23,0.3,0.53],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered title and subtitles flanked by top-left and bottom-right overlapping striped and solid circle clusters. Mirrors the cover slide.","zones":["Centered title and subtitles flanked by top-left and bottom-right overlapping striped and solid circle clusters. Mirrors the cover slide."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Opposing corner decorations featuring overlapping solid and diagonally striped circles","Large central circular frames for section transitions","Muted Morandi purple color scheme with low-contrast, calming aesthetic"],"optional_variants":["minimal","centered","closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A slides","Thank you slides"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used as edge-to-edge vertical bleeds in column layouts.
- Images are masked into perfect circles with thick solid-color borders when used as focal points or avatars.

【图标与装饰】
- Simple, mostly white line-art or minimalist solid icons.
- Placed centrally inside circular or rectangular colored background nodes.
- Used systematically to anchor list items or columns.

【数据页构图】
- Four equidistant columns. The upper row features solid colored trapezoidal blocks containing icons. The lower row features corresponding titles and paragraphs.

【图表风格】
- No traditional data charts present. Data/lists are represented via abstract geometric containers (e.g., trapezoidal perspective blocks) and icon arrays.

【章节页构图】
- Giant central solid-colored circle containing white centered text, acting as a section break, framed by standard corner geometry.

【收尾页构图】
- Centered title and subtitles flanked by top-left and bottom-right overlapping striped and solid circle clusters. Mirrors the cover slide.

【禁止】
- Avoid high-saturation neon colors; it breaks the Morandi harmony.
- Avoid placing text directly over the striped circle corner motifs to prevent readability issues.
- Do not use overly complex or playful fonts; stick to formal Serif/Sans-serif pairings.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic thesis defenses、Art and design portfolios、Elegant corporate summaries、Minimalist lifestyle brand presentations。
