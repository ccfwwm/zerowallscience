# 4131 · FG11【朋克酷风】 / linzi-punk-fg11-4131-8afefaed

## 风格ID
linzi-punk-fg11-4131-8afefaed

## 风格名称
4131 · FG11【朋克酷风】 / linzi-punk-fg11-4131-8afefaed

## 风格描述
A bold, brutalist presentation template featuring strong primary color blocking, oversized decorative typography, and striking asymmetrical layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: High-contrast primary triad acting as massive solid structural blocks, balanced by stark white.
- fonts: Bold, geometric sans-serif for display and architectural elements; clean legible sans-serif for functional body copy.
- spacing: Extreme contrasts between densely packed typographical textures and vast, empty solid color blocks.
- shape_language: Strict orthogonal rectangles and harsh structural lines, disrupted by organic, raw brush stroke vectors.
- texture: Flat, matte vector color planes juxtaposed against high-contrast, edgy photographic elements.
- grid: Irregular, asymmetrical block grid utilizing extreme fractional splits (e.g., 1/4 vertical strips, off-center horizontal horizons).
- motion_or_depth: Strictly flat hierarchy where depth is achieved solely through stark layer overlapping (e.g., text directly over images, or brush strokes bridging two color zones).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「4131 · FG11【朋克酷风】 / linzi-punk-fg11-4131-8afefaed」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A bold, brutalist presentation template featuring strong primary color blocking, oversized decorative typography, and striking asymmetrical layouts.
- 推荐配色：#313B93、#FCCC1B、#E62B28、#FFFFFF

【不可丢失的风格锚点】
- Primary color quadrant blocking (Blue, Yellow, Red)
- Oversized, repeating, and rotated background typography
- Hard-edge rectangular layout splits
- Expressive painted brush stroke accents

【字体】
- Treat text as a structural texture by repeating key words vertically or horizontally to fill empty zones.
- Utilize extreme scale contrasts between hero text and body copy.
- Rotate display text 90 degrees to create strong vertical visual borders.
- Always use high-contrast color pairings for text (e.g., yellow on blue, white on blue).

【封面页构图】
- Full-bleed background with dominant centered typography and minimal top-corner geometric accents.

【内容页构图】
- Vertical bi-color split background with scattered image slots, brush accents, and massive repeating background text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with dominant centered typography and minimal top-corner geometric accents.","zones":["Full-bleed background with dominant centered typography and minimal top-corner geometric accents."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["hero-cover","full-bleed","centered-text"],"avoid":["Detailed agendas or text-heavy summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact visual introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-bg","purpose":"Dark, moody, or highly stylized background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Color-blocked quadrant layout with a vertical text margin and a right-aligned half-bleed image slot.","zones":["Color-blocked quadrant layout with a vertical text margin and a right-aligned half-bleed image slot."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["color-block","split-screen","vertical-text"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Executive summaries paired with a strong visual"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-half-image","purpose":"Conceptual structural image","bbox":[0.6,0.15,0.4,0.85],"priority":1}]}
- content: [{"id":"content-content","composition":"Vertical bi-color split background with scattered image slots, brush accents, and massive repeating background text.","zones":["Vertical bi-color split background with scattered image slots, brush accents, and massive repeating background text."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["gallery","split-background","typographic-texture"],"avoid":["Long form reading material","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Product galleries","Visual storytelling"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"gallery-img-1","purpose":"Small accent image","bbox":[0.08,0.1,0.25,0.25],"priority":2},{"id":"gallery-img-2","purpose":"Central focus image","bbox":[0.2,0.38,0.25,0.25],"priority":1},{"id":"gallery-img-3","purpose":"Lower accent image","bbox":[0.35,0.65,0.25,0.25],"priority":3}]},{"id":"content-comparison","composition":"Asymmetrical layout dominated by a large overlapping left image, contrasting corner blocks, and layered typography.","zones":["Asymmetrical layout dominated by a large overlapping left image, contrasting corner blocks, and layered typography."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["hero-image","overlapping-layers","asymmetrical"],"avoid":["Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Hero product features"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"main-portrait","purpose":"Dominant subject portrait or product","bbox":[0.12,0.18,0.4,0.82],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Complex modular grid using a vertical typography divider to separate dense left-side copy from a right-side hero product and large price typography.","zones":["Complex modular grid using a vertical typography divider to separate dense left-side copy from a right-side hero product and large price typography."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["product-feature","data-spotlight","structural-divider"],"avoid":["High-level strategic overviews without specific data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Product spotlights","Pricing announcements","Key metric highlights"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"product-image","purpose":"Clear image of the product or item being detailed","bbox":[0.6,0.13,0.25,0.52],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Color-blocked quadrant layout with a vertical text margin and a right-aligned half-bleed image slot.","zones":["Color-blocked quadrant layout with a vertical text margin and a right-aligned half-bleed image slot."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["color-block","split-screen","vertical-text"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Executive summaries paired with a strong visual"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-half-image","purpose":"Conceptual structural image","bbox":[0.6,0.15,0.4,0.85],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Horizontal block layout featuring strong vertical left anchor text, a centered highlighted quote, and a right-aligned overlapping image.","zones":["Horizontal block layout featuring strong vertical left anchor text, a centered highlighted quote, and a right-aligned overlapping image."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["quote-focus","horizontal-flow","mixed-media"],"avoid":["Detailed step-by-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Key testimonials","Core philosophy"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"small-left-portrait","purpose":"Author or supporting conceptual face","bbox":[0.12,0.32,0.15,0.35],"priority":2},{"id":"right-abstract","purpose":"Abstract texture or contextual image","bbox":[0.6,0.32,0.4,0.35],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Asymmetrical composition with large geometric patterns on the edge, off-center overlapping text, and staggered contrasting image blocks.","zones":["Asymmetrical composition with large geometric patterns on the edge, off-center overlapping text, and staggered contrasting image blocks."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Primary color quadrant blocking (Blue, Yellow, Red)","Oversized, repeating, and rotated background typography","Hard-edge rectangular layout splits"],"optional_variants":["closing","geometric-border","overlapping-text"],"avoid":["Any complex data or multi-point summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Call to action","Final thank you slide","Contact information display"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"left-center-image","purpose":"Atmospheric background for final text","bbox":[0.12,0.3,0.25,0.38],"priority":2},{"id":"right-vertical-image","purpose":"Moody, structural, or abstract vertical image","bbox":[0.58,0,0.28,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Maintain harsh, unrounded rectangular crops.
- Intentionally overlap images with bold text elements or painted brush strokes.
- Position images so they bleed off the edge or align perfectly flush with internal color block boundaries.

【图标与装饰】
- Keep extremely sparse; when necessary, use thin, monoline, geometric icons with no fills or background shapes.

【数据页构图】
- Complex modular grid using a vertical typography divider to separate dense left-side copy from a right-side hero product and large price typography.

【图表风格】
- Construct charts using solid, hard-edged color blocks from the primary palette.
- Avoid outlines, gradients, and 3D effects; maintain a flat, constructivist aesthetic.

【章节页构图】
- Color-blocked quadrant layout with a vertical text margin and a right-aligned half-bleed image slot.

【收尾页构图】
- Asymmetrical composition with large geometric patterns on the edge, off-center overlapping text, and staggered contrasting image blocks.

【禁止】
- Drop shadows of any kind.
- Gradients in backgrounds or text.
- Rounded corners on images or shapes.
- Delicate, high-contrast serif fonts.
- Muted, pastel, or low-contrast color combinations.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Streetwear fashion pitch decks、Creative agency and studio portfolios、Disruptive tech or youth-oriented product launches、Modern art or exhibition proposals。
