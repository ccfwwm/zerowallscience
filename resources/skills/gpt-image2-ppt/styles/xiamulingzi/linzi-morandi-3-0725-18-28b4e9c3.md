# 18 · 3.07更新高级色25 / linzi-morandi-3-0725-18-28b4e9c3

## 风格ID
linzi-morandi-3-0725-18-28b4e9c3

## 风格名称
18 · 3.07更新高级色25 / linzi-morandi-3-0725-18-28b4e9c3

## 风格描述
A minimalist presentation template featuring a muted pastel color palette, clean geometric content blocks, and soft organic background accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white background; dark brown for primary typography; muted pink and taupe used for major structural blocks and accents.
- fonts: Clean, modern sans-serif typography with distinct size contrast between titles and body text.
- spacing: Generous margins with tight, structured alignment within individual content groups or columns.
- shape_language: Organic fluid blobs for background framing; strict rectangles and sharp geometric shapes (chevrons, circles) for content framing.
- texture: Completely flat solid fills; no textures or material effects.
- grid: Frequent use of 2, 3, and 4-column edge-to-edge layouts using color blocking to define sections.
- motion_or_depth: Strictly 2D flat hierarchy; emphasis is created through color contrast and scale rather than depth or overlap.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「18 · 3.07更新高级色25 / linzi-morandi-3-0725-18-28b4e9c3」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist presentation template featuring a muted pastel color palette, clean geometric content blocks, and soft organic background accents.
- 推荐配色：#FAF7F5、#6B5349、#F9A494、#C1AE9F、#FCE6E1

【不可丢失的风格锚点】
- Muted, warm pastel 'Morandi' color scheme
- Strict flat design with no gradients or drop shadows
- Mix of fluid background shapes and sharp rectangular content blocks
- High-contrast color blocking for layout structuring

【字体】
- Primary titles use large, heavy dark brown sans-serif
- Body text is rendered in a lighter, thinner weight to establish hierarchy
- Numbers and key data points are often enlarged and centered within colored blocks

【封面页构图】
- Fluid organic shapes framing the corners; central stacked typography with subtitle and presenter meta-info blocks.

【内容页构图】
- Three-column edge-to-edge layout: image left, solid color block center with icon/text, solid color block right with numbered list.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Fluid organic shapes framing the corners; central stacked typography with subtitle and presenter meta-info blocks.","zones":["Fluid organic shapes framing the corners; central stacked typography with subtitle and presenter meta-info blocks."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["title-slide","organic-frame","minimalist"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Event introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Horizontal process flow using connected chevron arrows spanning the middle, with explanatory text blocks staggered above and below.","zones":["Horizontal process flow using connected chevron arrows spanning the middle, with explanatory text blocks staggered above and below."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["timeline","process-flow","chevrons"],"avoid":["Non-linear relationships","Large bodies of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Linear processes","Timelines","Step-by-step methodologies"],"evidence_pages":["page-06"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three-column edge-to-edge layout: image left, solid color block center with icon/text, solid color block right with numbered list.","zones":["Three-column edge-to-edge layout: image left, solid color block center with icon/text, solid color block right with numbered list."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["3-column","color-blocking","image-text-split"],"avoid":["Long continuous paragraphs","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda introduction","Multi-faceted concepts","Numbered lists"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-col-1","purpose":"Contextual photography","bbox":[0.0,0.15,0.33,0.7],"priority":1}]},{"id":"content-comparison","composition":"Asymmetrical split: left side features an image layered over an offset background block; right side features a vertical list anchored by circular icons.","zones":["Asymmetrical split: left side features an image layered over an offset background block; right side features a vertical list anchored by circular icons."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["icon-list","offset-image","vertical-rhythm"],"avoid":["Heavy data","Single large narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Feature lists","Process steps"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-left","purpose":"Subject photography","bbox":[0.05,0.1,0.3,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four-column vertical layout alternating between cropped images and solid color blocks containing large statistical numbers.","zones":["Four-column vertical layout alternating between cropped images and solid color blocks containing large statistical numbers."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["stat-callouts","4-column","alternating-grid"],"avoid":["Complex charts","Lengthy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Highlighting key metrics","Portfolio showcases","Impact statements"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"image-col-1","purpose":"Supporting visuals","bbox":[0.05,0.15,0.2,0.4],"priority":1},{"id":"image-col-3","purpose":"Supporting visuals","bbox":[0.55,0.15,0.2,0.4],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-column edge-to-edge layout: image left, solid color block center with icon/text, solid color block right with numbered list.","zones":["Three-column edge-to-edge layout: image left, solid color block center with icon/text, solid color block right with numbered list."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["3-column","color-blocking","image-text-split"],"avoid":["Long continuous paragraphs","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda introduction","Multi-faceted concepts","Numbered lists"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-col-1","purpose":"Contextual photography","bbox":[0.0,0.15,0.33,0.7],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Fluid organic shapes framing the corners; central stacked typography for closing remarks and presenter info.","zones":["Fluid organic shapes framing the corners; central stacked typography for closing remarks and presenter info."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, warm pastel 'Morandi' color scheme","Strict flat design with no gradients or drop shadows","Mix of fluid background shapes and sharp rectangular content blocks"],"optional_variants":["closing","organic-frame","bookend"],"avoid":["New information","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are typically cropped into strict rectangular aspect ratios
- Edge-to-edge placement within designated grid columns
- Occasional creative cropping, such as vertical slicing
- No borders, frames, or shadow effects applied to images

【图标与装饰】
- Simple, monochromatic line icons
- Icons are consistently housed within solid-colored circular containers
- Used sparingly to anchor list items or top-level concepts

【数据页构图】
- Four-column vertical layout alternating between cropped images and solid color blocks containing large statistical numbers.

【图表风格】
- Diagrams are built using flat, opaque vector shapes
- Color alternating is used to denote sequence or distinct parts (e.g., alternating pink and taupe arrows)
- Avoidance of 3D effects or complex data visualizations

【章节页构图】
- Horizontal process flow using connected chevron arrows spanning the middle, with explanatory text blocks staggered above and below.

【收尾页构图】
- Fluid organic shapes framing the corners; central stacked typography for closing remarks and presenter info.

【禁止】
- Using highly saturated or neon colors that break the muted palette
- Adding drop shadows, bevels, or 3D formatting to shapes
- Overcrowding slides with text, breaking the minimalist layout
- Using overly detailed, multi-colored icons
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic presentations and thesis defenses、Minimalist corporate profiles or agency decks、Creative portfolios emphasizing a soft aesthetic、HR or onboarding presentations needing a calm tone。
