# 82 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-82-0f71568d

## 风格ID
linzi-morandi-2-21-ppt-ppt-82-0f71568d

## 风格名称
82 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-82-0f71568d

## 风格描述
An elegant, minimalist presentation template utilizing a muted 'Morandi' color palette, overlapping geometries, and generous whitespace.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Deep muted green as the primary anchor, dusty rose as the primary accent, beige for subtle framing, and white for negative space.
- fonts: Brush script or handwriting style for display titles to add artistic flair; light, clean sans-serif for body copy.
- spacing: Wide margins, ample padding between distinct content blocks, and intentional use of empty quadrants.
- shape_language: Strictly geometric with sharp rectangular framing, contrasting with perfectly circular icons and charts.
- texture: Flat, matte color blocks with zero gradients or drop shadows, relying entirely on color contrast and overlap.
- grid: Asymmetric modular grids, frequently using 1/3 to 2/3 horizontal splits and half-page vertical splits.
- motion_or_depth: Depth is achieved purely through 2D layer overlapping (e.g., images crossing over background color boundaries) without 3D effects.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「82 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-82-0f71568d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template utilizing a muted 'Morandi' color palette, overlapping geometries, and generous whitespace.
- 推荐配色：#4e6759、#c9887d、#e8ded3、#ffffff、#333333

【不可丢失的风格锚点】
- Muted, earthy 'Morandi' color tones
- Brush script typography for primary headers
- Overlapping images and solid color blocks
- Generous negative space and asymmetric balance

【字体】
- Use script fonts sparingly for main section titles or artistic anchors
- Body text must remain small, light, and in a legible sans-serif
- Maintain high line height for body paragraphs to ensure an airy aesthetic

【封面页构图】
- Left-aligned square image on dark background, right-aligned script text with solid underline accent, bottom edge border

【内容页构图】
- Centered header, three horizontally aligned circular icons with corresponding text blocks beneath, white background

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned square image on dark background, right-aligned script text with solid underline accent, bottom edge border","zones":["Left-aligned square image on dark background, right-aligned script text with solid underline accent, bottom edge border"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["dark-theme","asymmetric","minimal"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation cover","Major chapter break"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_image","purpose":"Main visual anchor","bbox":[0.14,0.17,0.31,0.55],"priority":1}]}
- section: {"id":"section-primary","composition":"Vertical image on left edge, white background, overlapping interactive/arrow button, large script title and text block right, colored edge strip right","zones":["Vertical image on left edge, white background, overlapping interactive/arrow button, large script title and text block right, colored edge strip right"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["split-layout","overlap","light-theme"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introduction","Agenda overview"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section_image","purpose":"Section visual theme","bbox":[0.06,0.24,0.28,0.64],"priority":1}]}
- content: [{"id":"content-content","composition":"Centered header, three horizontally aligned circular icons with corresponding text blocks beneath, white background","zones":["Centered header, three horizontally aligned circular icons with corresponding text blocks beneath, white background"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["three-column","iconography","centered"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key features","Core values","Service offerings"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Horizontal color split (top dark, bottom light), left-aligned square image overlapping the boundary, right-aligned three-column text grid with dates","zones":["Horizontal color split (top dark, bottom light), left-aligned square image overlapping the boundary, right-aligned three-column text grid with dates"],"content_capacity":{"density":"medium","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["timeline","overlap","horizontal-split"],"avoid":["Single main message","copying source assets, source text, or an exact source arrangement"],"best_for":["Timeline events","Step-by-step processes","Team profiles"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"timeline_image","purpose":"Visual context for timeline","bbox":[0.1,0.45,0.17,0.31],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Centered header, split lower half: left side contains an outlined text box and three small donut charts, right side contains a vertical line accent and a bulleted list","zones":["Centered header, split lower half: left side contains an outlined text box and three small donut charts, right side contains a vertical line accent and a bulleted list"],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["split-content","charts","mixed-media"],"avoid":["Full screen image display","copying source assets, source text, or an exact source arrangement"],"best_for":["Mixed data and text summaries","Progress tracking"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Vertical image on left edge, white background, overlapping interactive/arrow button, large script title and text block right, colored edge strip right","zones":["Vertical image on left edge, white background, overlapping interactive/arrow button, large script title and text block right, colored edge strip right"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["split-layout","overlap","light-theme"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introduction","Agenda overview"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section_image","purpose":"Section visual theme","bbox":[0.06,0.24,0.28,0.64],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Left-aligned square image on dark background, right-aligned large script text, colored accent bar, and bottom beige edge strip (mirroring the cover).","zones":["Left-aligned square image on dark background, right-aligned large script text, colored accent bar, and bottom beige edge strip (mirroring the cover)."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy 'Morandi' color tones","Brush script typography for primary headers","Overlapping images and solid color blocks"],"optional_variants":["closing","dark-theme","minimal"],"avoid":["Standard content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_image","purpose":"Final visual impression","bbox":[0.09,0.17,0.31,0.55],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be cropped to strict geometric shapes (squares or vertical rectangles)
- Images often intentionally overlap background block boundaries to break the grid
- Use desaturated, minimalist, or airy photography to match the muted template colors

【图标与装饰】
- Minimalist line-art icons housed inside solid circular background shapes
- Icon background colors should strictly rotate through the template's accent palette

【数据页构图】
- Centered header, split lower half: left side contains an outlined text box and three small donut charts, right side contains a vertical line accent and a bulleted list

【图表风格】
- Simple, thin-line donut charts or ring progress indicators
- Charts avoid complex axes, using clean typography for internal values

【章节页构图】
- Vertical image on left edge, white background, overlapping interactive/arrow button, large script title and text block right, colored edge strip right

【收尾页构图】
- Left-aligned square image on dark background, right-aligned large script text, colored accent bar, and bottom beige edge strip (mirroring the cover).

【禁止】
- Do not use highly saturated primary colors
- Avoid drop shadows, glows, or bevel effects
- Do not clutter pages; maintain at least 40% negative space
- Avoid mixing multiple display/script fonts
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Lifestyle or boutique brand decks、Minimalist corporate overviews、Architectural or interior design proposals。
