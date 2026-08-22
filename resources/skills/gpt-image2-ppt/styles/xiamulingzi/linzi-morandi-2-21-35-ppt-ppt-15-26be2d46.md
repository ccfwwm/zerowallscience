# 莫兰迪风格PPT (15) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-15-26be2d46

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-15-26be2d46

## 风格名称
莫兰迪风格PPT (15) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-15-26be2d46

## 风格描述
Minimalist, Morandi-inspired corporate presentation with high-contrast coral and teal color blocking, clean typography, and asymmetrical layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light gray background (#F7F7F7) provides a canvas for high-contrast Coral (#F86065) and Teal (#137F85) structural elements. Body text is a muted medium gray (#8B8B8B).
- fonts: Modern, geometric sans-serif. Headings are exclusively uppercase to form solid typographic blocks.
- spacing: Wide, generous margins. Content blocks often occupy only 40-50% of the slide width, leaving massive functional white space.
- shape_language: Strictly orthogonal. Sharp 90-degree corners for all text boxes, image crops, and graphic shapes. No curves.
- texture: Completely flat. No shadows, gradients, or overlays. Material definition comes entirely from the inserted photography.
- grid: Primarily a 2-column or 3-column vertical split, heavily favoring left-aligned content.
- motion_or_depth: Flat 2D layer stacking. Highlights sit perfectly flat behind text.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (15) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-15-26be2d46」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist, Morandi-inspired corporate presentation with high-contrast coral and teal color blocking, clean typography, and asymmetrical layouts.
- 推荐配色：#F86065、#137F85、#F7F7F7、#8B8B8B

【不可丢失的风格锚点】
- Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.
- Solid rectangular highlight boxes placed directly behind specific heading words.
- Sharp, unbordered, rectangular image crops with generous negative space.
- Asymmetrical two-column macro layouts.

【字体】
- Primary headings: Uppercase, heavily color-coded (alternating lines of coral and teal).
- Heading emphasis: Use a solid teal or coral rectangular shape behind white uppercase text for select words.
- Body text: Sentence case, regular weight, muted gray, generous line height (approx 1.5).
- Alignment: Strictly left-aligned within distinct bounding boxes.

【封面页构图】
- Left-aligned dual-colored title block, large rectangular image anchoring the right.

【内容页构图】
- Left text block with inline highlighted heading, right side square image.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned dual-colored title block, large rectangular image anchoring the right.","zones":["Left-aligned dual-colored title block, large rectangular image anchoring the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["cover","split-layout","minimal"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major section transitions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_right","purpose":"Primary visual hook","bbox":[0.41,0.2,0.5,0.6],"priority":1}]}
- section: {"id":"section-primary","composition":"Tall vertical image on left, right side horizontally split into white space and a solid color block containing multi-column content.","zones":["Tall vertical image on left, right side horizontally split into white space and a solid color block containing multi-column content."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["tall-image","color-block","split-content"],"avoid":["Long continuous text","copying source assets, source text, or an exact source arrangement"],"best_for":["Service overviews","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"tall_left_image","purpose":"Section anchor","bbox":[0.07,0.1,0.26,0.8],"priority":1}]}
- content: [{"id":"content-content","composition":"Left text block with inline highlighted heading, right side square image.","zones":["Left text block with inline highlighted heading, right side square image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["text-left","image-right","highlight-heading"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content_image","purpose":"Supporting visual","bbox":[0.5,0.24,0.5,0.67],"priority":1}]},{"id":"content-comparison","composition":"Horizontal split: Top half solid color with centered header, bottom half three vertical columns with alternating background colors.","zones":["Horizontal split: Top half solid color with centered header, bottom half three vertical columns with alternating background colors."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["horizontal-split","three-columns","alternating-colors"],"avoid":["Single narrative paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Pricing tiers","Three-pillar concepts"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Left aligned flat bar chart, right aligned text and icon block.","zones":["Left aligned flat bar chart, right aligned text and icon block."],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["chart","data-viz","split-layout"],"avoid":["Complex datasets requiring deep analysis","copying source assets, source text, or an exact source arrangement"],"best_for":["Statistics","Performance metrics","Comparisons"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left text block with inline highlighted heading, right side square image.","zones":["Left text block with inline highlighted heading, right side square image."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["text-left","image-right","highlight-heading"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"content_image","purpose":"Supporting visual","bbox":[0.5,0.24,0.5,0.67],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Left aligned thank you text, right aligned clean image crop.","zones":["Left aligned thank you text, right aligned clean image crop."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Thin, dual-color (coral/teal) vertical band permanently fixed to the left screen edge.","Solid rectangular highlight boxes placed directly behind specific heading words.","Sharp, unbordered, rectangular image crops with generous negative space."],"optional_variants":["closing","minimal","bookend"],"avoid":["New information","copying source assets, source text, or an exact source arrangement"],"best_for":["Contact info","Q&A prompts","Deck conclusion"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_image","purpose":"Final visual impression","bbox":[0.47,0.2,0.39,0.6],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images must have straight, unrounded edges.
- Images should ideally feature clean, minimalist subjects on light/white backgrounds to blend with the slide canvas.
- Maintain high structural contrast: square or tall vertical rectangular crops.

【图标与装饰】
- Monoline, minimalist vector icons.
- Typically rendered in white or dark gray depending on the background block.

【数据页构图】
- Left aligned flat bar chart, right aligned text and icon block.

【图表风格】
- Flat bar charts.
- Bars use the brand colors (coral, teal, dark gray) without borders, 3D effects, or gradients.
- Minimal grid lines (horizontal only, very faint gray).

【章节页构图】
- Tall vertical image on left, right side horizontally split into white space and a solid color block containing multi-column content.

【收尾页构图】
- Left aligned thank you text, right aligned clean image crop.

【禁止】
- Do not use rounded corners on any element.
- Avoid drop shadows, bevels, or any 3D effects.
- Do not center-align body text paragraphs.
- Avoid edge-to-edge full bleed backgrounds except for specific section dividers.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Design agency portfolios、Minimalist brand pitches、Lookbooks and aesthetic-driven reports、Modern corporate overviews。
