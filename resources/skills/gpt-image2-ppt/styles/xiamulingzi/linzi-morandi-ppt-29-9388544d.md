# 优雅线条（29）---木七设计 · ppt模板 / linzi-morandi-ppt-29-9388544d

## 风格ID
linzi-morandi-ppt-29-9388544d

## 风格名称
优雅线条（29）---木七设计 · ppt模板 / linzi-morandi-ppt-29-9388544d

## 风格描述
An elegant, minimalist presentation template using a 'Morandi' color palette and overlapping flat circular geometries to frame content.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Base background is off-white (#F7F5F0). Primary structural elements use dark blue (#43709B) and light blue (#72AEE5). Warmth is injected via muted gold/yellow (#EBCD85) accents.
- fonts: Elegant serif for large headings and English accents; clean sans-serif for body copy. Typographic mood is sophisticated and calm.
- spacing: Generous negative space on text sides, contrasting with heavy graphic weight on the opposite edges.
- shape_language: Perfect circles, semi-circles, and sharp rectangular color blocks.
- texture: Completely flat vector shapes with no gradients, drop shadows, or outlines.
- grid: Asymmetrical compositions for covers/sections; strict orthogonal 50/50 horizontal or 60/40 vertical splits for content pages.
- motion_or_depth: Visual depth is achieved purely through the overlapping order of flat, opaque circular shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（29）---木七设计 · ppt模板 / linzi-morandi-ppt-29-9388544d」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template using a 'Morandi' color palette and overlapping flat circular geometries to frame content.
- 推荐配色：#F7F5F0、#43709B、#72AEE5、#EBCD85

【不可丢失的风格锚点】
- Overlapping flat circular segments anchored to edges
- Scattered small circular dots for asymmetrical balance
- Muted, low-saturation 'Morandi' color palette
- High-contrast solid color blocking for text containers

【字体】
- Left-align primary titles to establish a strong reading axis.
- Use a vertical thin line alongside title blocks to emphasize alignment.
- Overlay text on pale yellow highlight rectangles to emphasize section numbers or key phrases.

【封面页构图】
- Left-aligned title block with vertical separator line, right/bottom edges framed by overlapping geometric circles.

【内容页构图】
- Horizontal split layout. Top half contains an image and a small accent block; bottom half is a solid colored text container with a multi-column layout.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Left-aligned title block with vertical separator line, right/bottom edges framed by overlapping geometric circles.","zones":["Left-aligned title block with vertical separator line, right/bottom edges framed by overlapping geometric circles."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["geometric-cover","asymmetrical","minimalist"],"avoid":["Detailed agendas","Heavy data","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Main topic introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Large section number and subtitle anchored left, with a solid colored highlight box behind the subtitle. Graphic frame identical to cover.","zones":["Large section number and subtitle anchored left, with a solid colored highlight box behind the subtitle. Graphic frame identical to cover."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["section-header","highlight-box"],"avoid":["Paragraph content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Horizontal split layout. Top half contains an image and a small accent block; bottom half is a solid colored text container with a multi-column layout.","zones":["Horizontal split layout. Top half contains an image and a small accent block; bottom half is a solid colored text container with a multi-column layout."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["horizontal-split","multi-column","image-top"],"avoid":["Complex charts","Single large paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature overviews","Team introductions","Services list"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-banner","purpose":"contextual background or lifestyle image","bbox":[0.12,0.0,0.88,0.4],"priority":1}]},{"id":"content-comparison","composition":"Vertical split layout. Left side is a solid background block containing hierarchical text; right side is a full-bleed vertical image.","zones":["Vertical split layout. Left side is a solid background block containing hierarchical text; right side is a full-bleed vertical image."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["vertical-split","text-heavy","side-image"],"avoid":["Large data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Detailed content","Case studies","Product descriptions"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"right-panel","purpose":"supporting contextual image","bbox":[0.68,0.1,0.32,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Centered top title. Left side features a large pie chart; right side features vertical list items with circular icons.","zones":["Centered top title. Left side features a large pie chart; right side features vertical list items with circular icons."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["pie-chart","icon-list","data-display"],"avoid":["Heavy text","Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Data visualization","Proportions","Market share"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large section number and subtitle anchored left, with a solid colored highlight box behind the subtitle. Graphic frame identical to cover.","zones":["Large section number and subtitle anchored left, with a solid colored highlight box behind the subtitle. Graphic frame identical to cover."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["section-header","highlight-box"],"avoid":["Paragraph content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Background matches cover. Large concluding text aligned left.","zones":["Background matches cover. Large concluding text aligned left."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Overlapping flat circular segments anchored to edges","Scattered small circular dots for asymmetrical balance","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["closing","bookend"],"avoid":["New content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Crop images into strict rectangles that run full-bleed within their designated grid sections.
- Do not use rounded corners or borders on photographs.
- Use images with muted, neutral, or workspace themes to match the calm palette.

【图标与装饰】
- Use simple, thin-line stroke icons enclosed in circular borders for list items.
- Match icon stroke color to the primary dark blue.

【数据页构图】
- Centered top title. Left side features a large pie chart; right side features vertical list items with circular icons.

【图表风格】
- Use flat, 2D charts without 3D effects.
- Map chart segments directly to the presentation palette (Dark Blue, Light Blue, Yellow) to maintain harmony.

【章节页构图】
- Large section number and subtitle anchored left, with a solid colored highlight box behind the subtitle. Graphic frame identical to cover.

【收尾页构图】
- Background matches cover. Large concluding text aligned left.

【禁止】
- Avoid overlapping text boxes where dummy text layers crash into each other (as seen on the closing slide).
- Do not use drop shadows, gradients, or 3D bevels.
- Avoid heavily saturated or neon colors that break the 'Morandi' aesthetic.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Corporate summaries and business plans needing a refined touch、Art, design, or lifestyle brand portfolios、Academic or minimalist research presentations。
