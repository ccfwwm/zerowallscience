# 个性朋克（05）---木七设计 · ppt模板 / linzi-punk-ppt-05-d2c90fc1

## 风格ID
linzi-punk-ppt-05-d2c90fc1

## 风格名称
个性朋克（05）---木七设计 · ppt模板 / linzi-punk-ppt-05-d2c90fc1

## 风格描述
An urban, brutalist editorial presentation style featuring oversized overlapping typography, neon-lit photography, and stark geometric color blocking.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark, moody backgrounds (black, deep blue, brown) punctuated by intense warning colors (red-orange, mustard yellow).
- fonts: Ultra-bold, geometric sans-serif for display headers (often all-caps). Clean, legible sans-serif for body copy.
- spacing: Tight, intersecting, and overlapping. Margins are often intentionally violated for a bleed effect.
- shape_language: Strictly orthogonal and sharp-edged. Perfect rectangles and circles, no rounded corners.
- texture: Flat vector geometry contrasting heavily with deep, grainy, neon-lit photographic textures.
- grid: Brutalist and asymmetric. Alignment is often broken intentionally to create dynamic tension.
- motion_or_depth: High depth created by aggressive layering: text behind images, images behind text, and solid blocks intersecting both.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「个性朋克（05）---木七设计 · ppt模板 / linzi-punk-ppt-05-d2c90fc1」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An urban, brutalist editorial presentation style featuring oversized overlapping typography, neon-lit photography, and stark geometric color blocking.
- 推荐配色：#FFFFFF、#000000、#1A2B4C、#E64A33、#5C4D45、#F4B42A、#1D636B

【不可丢失的风格锚点】
- Oversized, broken-word typography overlapping images
- High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography
- Circular stamp/badge accents
- Vertical rotated text used as structural margins or frames
- Edge-bleeding text and imagery

【字体】
- Break large display words across multiple lines to force rectangular text blocks.
- Allow primary headers to aggressively overlap underlying imagery.
- Use 90-degree rotated text to frame content zones or fill empty vertical space.
- Contrast massive primary headers with distinctly small, tightly packed paragraph blocks.

【封面页构图】
- Central hero landscape image flanked by vertical text margins and oversized background text bleeding off edges.

【内容页构图】
- Left-aligned vertical image overlapped heavily by staggered, broken-word typography, with minimal body text on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central hero landscape image flanked by vertical text margins and oversized background text bleeding off edges.","zones":["Central hero landscape image flanked by vertical text margins and oversized background text bleeding off edges."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["magazine-cover","brutalist-hero"],"avoid":["Information-heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_center","purpose":"Primary visual anchor","bbox":[0.1,0.15,0.8,0.7],"priority":1}]}
- section: {"id":"section-primary","composition":"Three vertical image strips (partial left/right, wide center) creating a cinematic sequence.","zones":["Three vertical image strips (partial left/right, wide center) creating a cinematic sequence."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["image-sequence","cinematic-pan"],"avoid":["Text content","copying source assets, source text, or an exact source arrangement"],"best_for":["Visual transitions","Moodboards"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"strip_left","purpose":"Peripheral context","bbox":[0.0,0.08,0.05,0.84],"priority":3},{"id":"hero_center","purpose":"Main focal point","bbox":[0.08,0.08,0.84,0.84],"priority":1},{"id":"strip_right","purpose":"Peripheral context","bbox":[0.95,0.08,0.05,0.84],"priority":2}]}
- content: [{"id":"content-content","composition":"Left-aligned vertical image overlapped heavily by staggered, broken-word typography, with minimal body text on the right.","zones":["Left-aligned vertical image overlapped heavily by staggered, broken-word typography, with minimal body text on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["broken-typography","overlapping-text"],"avoid":["Long titles","Logographic languages (Chinese/Japanese) where word-breaking rules differ","copying source assets, source text, or an exact source arrangement"],"best_for":["Bold section titles","Single concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_portrait","purpose":"Moody structural column","bbox":[0.05,0.08,0.35,0.84],"priority":1}]},{"id":"content-comparison","composition":"Asymmetric masonry grid mixing portrait images, square images, text blocks, and solid color rectangles.","zones":["Asymmetric masonry grid mixing portrait images, square images, text blocks, and solid color rectangles."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["masonry-grid","mixed-media"],"avoid":["Linear narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Gallery grids","Team introductions","Feature lists"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"top_center","purpose":"Grid item","bbox":[0.37,0.0,0.26,0.38],"priority":2},{"id":"top_right","purpose":"Grid item","bbox":[0.67,0.0,0.26,0.65],"priority":1},{"id":"bottom_left","purpose":"Grid item","bbox":[0.12,0.55,0.22,0.45],"priority":3},{"id":"bottom_right","purpose":"Grid item","bbox":[0.67,0.7,0.26,0.3],"priority":4}]}]
- data: [{"id":"data-metrics","composition":"Dark blue vertical sidebar containing text and a progress bar, paired with a large high-contrast map vector.","zones":["Dark blue vertical sidebar containing text and a progress bar, paired with a large high-contrast map vector."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["map-layout","sidebar-split"],"avoid":["Complex multi-axis charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Geographic data","Location highlights","Stat callouts"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned vertical image overlapped heavily by staggered, broken-word typography, with minimal body text on the right.","zones":["Left-aligned vertical image overlapped heavily by staggered, broken-word typography, with minimal body text on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["broken-typography","overlapping-text"],"avoid":["Long titles","Logographic languages (Chinese/Japanese) where word-breaking rules differ","copying source assets, source text, or an exact source arrangement"],"best_for":["Bold section titles","Single concept highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_portrait","purpose":"Moody structural column","bbox":[0.05,0.08,0.35,0.84],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Central framed image with vertical title, flanked by bleeding massive background text and small descriptive blocks.","zones":["Central framed image with vertical title, flanked by bleeding massive background text and small descriptive blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Oversized, broken-word typography overlapping images","High-contrast solid color blocks (blue, red, yellow) juxtaposed with busy photography","Circular stamp/badge accents"],"optional_variants":["framed-image","bleeding-type"],"avoid":["Dense data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Project showcases","Case studies","Quotes"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"center_image","purpose":"Subject focus","bbox":[0.38,0.18,0.25,0.47],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use highly saturated, high-contrast photography (cyberpunk/neon aesthetics).
- Images should bleed off the edges of the canvas to create a cinematic scale.
- Use solid color rectangles as framing devices behind or partially covering images.

【图标与装饰】
- Minimal use of traditional icons. Rely on circular typographic stamps/badges instead.

【数据页构图】
- Dark blue vertical sidebar containing text and a progress bar, paired with a large high-contrast map vector.

【图表风格】
- Minimalist and flat. Use high-contrast accent colors (e.g., bright red) against deep backgrounds (e.g., navy) for data points/maps.
- Integrate simple progress bars into clean, white bounding boxes.

【章节页构图】
- Three vertical image strips (partial left/right, wide center) creating a cinematic sequence.

【收尾页构图】
- Central hero landscape image flanked by vertical text margins and oversized background text bleeding off edges.

【禁止】
- Avoid centered, standard margins; layout must push edge boundaries.
- Do not use rounded corners or soft drop shadows.
- Avoid subtle, low-contrast, or corporate-style stock imagery; relies on striking, moody visuals.
- Do not constrain header text to a single line if it can be broken structurally.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Music/Event pitch decks、Creative agency portfolios、Trend reports and editorial magazines。
