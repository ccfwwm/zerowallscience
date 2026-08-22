# 优雅线条（53）---木七设计 · ppt模板 / linzi-morandi-ppt-53-df43f6ed

## 风格ID
linzi-morandi-ppt-53-df43f6ed

## 风格名称
优雅线条（53）---木七设计 · ppt模板 / linzi-morandi-ppt-53-df43f6ed

## 风格描述
A minimalist, elegant presentation template featuring a muted Morandi color palette, organic background shapes, and clean overlapping layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Beige serves as the universal background. Dusty blue and maroon are primary accents for shapes, headers, and emphasis. White is used strictly for high-contrast text and icons on dark backgrounds.
- fonts: Serif font reserved for large aesthetic display text. Bold sans-serif for primary headings and numbers. Regular weight sans-serif for body text.
- spacing: Ample outer margins. Symmetrical and centered alignments are favored for section breaks, while content slides use structured grid spacing with comfortable padding inside text boxes.
- shape_language: A mix of fluid, organic background blobs and strict geometric foreground shapes (circles, rounded rectangles, diamonds).
- texture: Predominantly flat and matte. Minimal depth introduced via very subtle, soft drop shadows on content cards and solid overlapping elements.
- grid: Flexible modular grid. Supports 1-column centered setups, 2-column split views, and up to 4-column equal-width card layouts.
- motion_or_depth: Largely 2D. Depth is implied through z-index layering (e.g., text blocks overlapping images, patterned circles overlapping solid circles).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（53）---木七设计 · ppt模板 / linzi-morandi-ppt-53-df43f6ed」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, elegant presentation template featuring a muted Morandi color palette, organic background shapes, and clean overlapping layouts.
- 推荐配色：#EBE9E4、#487C9E、#8B5762

【不可丢失的风格锚点】
- Muted beige background with dusty blue and maroon organic corner blobs.
- Wireframe circle accents with diagonal stripe patterns.
- Perfect circles used as prominent central framing devices for numbers or titles.
- Overlapping rectangular text blocks on image layouts.

【字体】
- Use elegant serif styling for isolated display keywords to establish mood.
- Employ heavy sans-serif for structural numbers and main headers to ensure legibility.
- Keep body text low-contrast (gray) on light backgrounds, and high-contrast (white) on dark backgrounds.
- Maintain strict center alignment for cover and section slides, and left alignment for heavy content blocks.

【封面页构图】
- Centered typographic lockup framed by organic corner shapes and overlapping striped circles.

【内容页构图】
- Diagonal sequence of connected rounded squares acting as a process timeline or list.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typographic lockup framed by organic corner shapes and overlapping striped circles.","zones":["Centered typographic lockup framed by organic corner shapes and overlapping striped circles."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["minimal","centered","organic-frame"],"avoid":["Detailed content","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","High-impact minimal introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Large central circle acting as a focal container for numbering, flanked by smaller patterned circles.","zones":["Large central circle acting as a focal container for numbering, flanked by smaller patterned circles."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["focal-point","geometric","numbered"],"avoid":["Long text blocks","Multiple distinct ideas","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Transition slides"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Diagonal sequence of connected rounded squares acting as a process timeline or list.","zones":["Diagonal sequence of connected rounded squares acting as a process timeline or list."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["timeline","diagonal","process"],"avoid":["Heavy data","Unrelated items","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","Timelines","Sequential steps"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"content-comparison","composition":"Left-anchored image partially overlaid by a wide, horizontal colored block containing multi-column text.","zones":["Left-anchored image partially overlaid by a wide, horizontal colored block containing multi-column text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["overlap","split-layout","multi-column"],"avoid":["Full-screen imagery","Simple bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Contextualizing data with an image","Team or project overviews"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"image-left","purpose":"contextual background","bbox":[0.0,0.0,0.38,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four equal-width vertical cards, each featuring a colored top header with overlapping circular icon badges.","zones":["Four equal-width vertical cards, each featuring a colored top header with overlapping circular icon badges."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["four-column","cards","metrics"],"avoid":["Deep narrative text","Large images","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Key metrics","Comparative points"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large central circle acting as a focal container for numbering, flanked by smaller patterned circles.","zones":["Large central circle acting as a focal container for numbering, flanked by smaller patterned circles."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["focal-point","geometric","numbered"],"avoid":["Long text blocks","Multiple distinct ideas","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Transition slides"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Split layout featuring a large image on the left and heavy, stacked colored typography blocks on the right.","zones":["Split layout featuring a large image on the left and heavy, stacked colored typography blocks on the right."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["split-screen","quote-block","stacked-containers"],"avoid":["Complex data","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key takeaways","Important statements"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"image-left-main","purpose":"thematic imagery","bbox":[0.04,0.26,0.56,0.58],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Massive central circular container for closing text, surrounded by fluid corner shapes.","zones":["Massive central circular container for closing text, surrounded by fluid corner shapes."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted beige background with dusty blue and maroon organic corner blobs.","Wireframe circle accents with diagonal stripe patterns.","Perfect circles used as prominent central framing devices for numbers or titles."],"optional_variants":["closing","centered","minimal"],"avoid":["Any complex content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Thank you pages","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be constrained to rigid rectangular bounding boxes.
- Allow solid color text containers to partially overlap image edges to create integrated compositions.
- Select images with muted tones to harmonize with the overarching Morandi palette.

【图标与装饰】
- Use solid, flat white icons inside brightly colored container shapes (circles, rounded squares, diamonds).
- Maintain consistent line weight and style across all icon usage.

【数据页构图】
- Four equal-width vertical cards, each featuring a colored top header with overlapping circular icon badges.

【图表风格】
- Present key metrics as large typography within dedicated colored container blocks rather than traditional graphs.
- Pair data points with thematic icons for quick visual comprehension.

【章节页构图】
- Large central circle acting as a focal container for numbering, flanked by smaller patterned circles.

【收尾页构图】
- Massive central circular container for closing text, surrounded by fluid corner shapes.

【禁止】
- Avoid bright, highly saturated neon or primary colors.
- Do not use complex 3D effects, gradients, or heavy bevels.
- Avoid placing complex text directly over busy, high-contrast imagery without a solid backing shape.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Minimalist corporate overviews、Design or lifestyle brand portfolios、Annual reviews requiring a calm, professional tone、Artistic or creative project proposals。
