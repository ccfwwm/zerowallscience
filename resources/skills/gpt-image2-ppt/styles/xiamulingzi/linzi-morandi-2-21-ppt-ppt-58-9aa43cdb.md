# 58 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-58-9aa43cdb

## 风格ID
linzi-morandi-2-21-ppt-ppt-58-9aa43cdb

## 风格名称
58 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-58-9aa43cdb

## 风格描述
Earthy, Morandi-inspired presentation template utilizing organic background shapes framing elevated white content cards.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background with olive green, terracotta, and ochre used for large organic framing shapes and accent elements.
- fonts: Elegant transitional or modern Serif (e.g., Playfair Display) for primary titles; clean geometric Sans-Serif for body copy.
- spacing: Generous outer padding to reveal background framing; 30-40px internal padding within the white content cards.
- shape_language: High contrast between organic, fluid background blobs and rigid, sharp-edged rectangular content cards and image masks.
- texture: Matte, flat vector shapes layered with subtle drop shadows to create a paper-cut or layered canvas effect.
- grid: Predominantly constrained to a central 16:9 safe zone box that is visually represented by the white elevated card.
- motion_or_depth: Distinct two-layer depth model: background is flat and pushed back, content card is elevated forward via uniform drop shadow.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「58 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-58-9aa43cdb」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Earthy, Morandi-inspired presentation template utilizing organic background shapes framing elevated white content cards.
- 推荐配色：#EBE6E0、#595C38、#C66537、#C99B29、#FFFFFF

【不可丢失的风格锚点】
- Organic, oversized fluid shapes in muted earthy tones serving as a background frame
- Central elevated white rectangular canvas with subtle drop shadow for content hosting
- Use of twin colored circular dots flanking slide titles as a recurring motif
- High-contrast elegant serif typography for large display headings

【字体】
- Use large Serif fonts for standalone cover/closing titles, centered.
- Content slide titles should be Sans-Serif, centered at the top of the white card, flanked by two primary-colored dots on each side.
- Body copy should be legible, medium-weight Sans-Serif with ample line height.

【封面页构图】
- Large fluid background shapes framing a centered serif title and sans-serif subtitle

【内容页构图】
- Elevated white card hosting a 2x2 text grid with top-centered title and minimal outline icons

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Large fluid background shapes framing a centered serif title and sans-serif subtitle","zones":["Large fluid background shapes framing a centered serif title and sans-serif subtitle"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["cover","minimal","organic-frame"],"avoid":["data display","detailed text","copying source assets, source text, or an exact source arrangement"],"best_for":["presentation title","section introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Direct text placement on organic background without a white card, featuring offset square accents","zones":["Direct text placement on organic background without a white card, featuring offset square accents"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["transition","no-card","minimalist"],"avoid":["detailed content","images","copying source assets, source text, or an exact source arrangement"],"best_for":["quotes","section breaks","key takeaways"],"evidence_pages":["page-05"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Elevated white card hosting a 2x2 text grid with top-centered title and minimal outline icons","zones":["Elevated white card hosting a 2x2 text grid with top-centered title and minimal outline icons"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["2x2-grid","text-heavy","card-layout"],"avoid":["complex charts","large images","copying source assets, source text, or an exact source arrangement"],"best_for":["key features","services overview","summaries"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"White card divided horizontally: top half contains two side-by-side images, bottom half contains two corresponding text columns","zones":["White card divided horizontally: top half contains two side-by-side images, bottom half contains two corresponding text columns"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["split-layout","image-heavy","side-by-side"],"avoid":["single focus narratives","heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["product comparisons","case studies","before/after scenarios"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-half-image","purpose":"primary context image","bbox":[0.06,0.24,0.44,0.38],"priority":1},{"id":"right-half-image","purpose":"secondary context image","bbox":[0.5,0.24,0.44,0.38],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Vertical dotted timeline centered on a white card, with alternating text/image nodes","zones":["Vertical dotted timeline centered on a white card, with alternating text/image nodes"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["timeline","vertical-flow","alternating"],"avoid":["large continuous text","dense data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["process steps","company history","roadmaps"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"node-image-1","purpose":"small square illustrative thumbnail","bbox":[0.38,0.35,0.07,0.12],"priority":2},{"id":"node-image-2","purpose":"small square illustrative thumbnail","bbox":[0.54,0.53,0.07,0.12],"priority":2},{"id":"node-image-3","purpose":"small square illustrative thumbnail","bbox":[0.38,0.71,0.07,0.12],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Elevated white card hosting a 2x2 text grid with top-centered title and minimal outline icons","zones":["Elevated white card hosting a 2x2 text grid with top-centered title and minimal outline icons"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["2x2-grid","text-heavy","card-layout"],"avoid":["complex charts","large images","copying source assets, source text, or an exact source arrangement"],"best_for":["key features","services overview","summaries"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Large fluid background shapes framing a centered serif 'Thanks' message","zones":["Large fluid background shapes framing a centered serif 'Thanks' message"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, oversized fluid shapes in muted earthy tones serving as a background frame","Central elevated white rectangular canvas with subtle drop shadow for content hosting","Use of twin colored circular dots flanking slide titles as a recurring motif"],"optional_variants":["closing","bookend","organic-frame"],"avoid":["new information","summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","contact information","presentation end"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Place images inside sharp, un-rounded rectangular masks.
- Use offset layering (overlapping a photo with a solid colored rectangle) to add depth.
- Avoid using full-bleed images that obscure the organic background framing.

【图标与装饰】
- Use minimal, thin-line geometric icons sparsely, positioned to the left of secondary headings.

【数据页构图】
- Vertical dotted timeline centered on a white card, with alternating text/image nodes

【图表风格】
- Use abstract geometric shapes (like chevrons or lines) in solid brand colors to represent timelines or sequential data.

【章节页构图】
- Direct text placement on organic background without a white card, featuring offset square accents

【收尾页构图】
- Large fluid background shapes framing a centered serif 'Thanks' message

【禁止】
- Do not break the 'white card on organic background' framing system for standard content slides.
- Avoid placing text directly over busy images without a protective text pane or darkening gradient (as failing in page-06).
- Do not introduce neon or cool colors (e.g., bright blue) that clash with the warm, earthy Morandi palette.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Art, design, or lifestyle proposals、Boutique brand introductions。
