# 个性朋克（11）---木七设计 · ppt模板 / linzi-punk-ppt-11-c01a353e

## 风格ID
linzi-punk-ppt-11-c01a353e

## 风格名称
个性朋克（11）---木七设计 · ppt模板 / linzi-punk-ppt-11-c01a353e

## 风格描述
Urban brutalist presentation style featuring high-contrast colors, foil textures, overlapping oversized translucent typography, and edgy asymmetrical layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Deep charcoal/navy backgrounds contrasting with vibrant warning yellow, pure white, and intense red-orange accents
- fonts: Brutalist, ultra-heavy sans-serif for headings; clean, standard sans-serif for body copy
- spacing: Intentional overlap of elements with tight framing; edge-to-edge full bleed backgrounds
- shape_language: Primarily sharp rectangles paired with perfect circles for accent stamps
- texture: High-gloss metallic foil paired with flat, matte color blocks
- grid: Asymmetrical, layered grids featuring vertical split-screens and center-aligned floating containers
- motion_or_depth: Shallow depth established through flat solid shapes overlapping translucent background layers and textured imagery

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「个性朋克（11）---木七设计 · ppt模板 / linzi-punk-ppt-11-c01a353e」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Urban brutalist presentation style featuring high-contrast colors, foil textures, overlapping oversized translucent typography, and edgy asymmetrical layouts.
- 推荐配色：#111A1F、#F5B925、#EE4B39、#FFFFFF

【不可丢失的风格锚点】
- Crumpled metallic/holographic background textures
- Oversized, translucent background typography
- Circular typographic stamps acting as graphic accents
- Sharp-edged floating geometric cards in high-contrast colors

【字体】
- Use ultra-bold, tightly tracked sans-serif fonts for primary headings and wordmarks
- Deploy oversized, low-opacity text layers in the background as a structural texture
- Keep body text small, highly legible, and contained within contrasting color blocks

【封面页构图】
- Textured background, central solid rectangular mask containing a portrait, oversized background text, circular stamp accent

【内容页构图】
- Textured full-bleed background, three scattered rectangular image blocks with bold white typography overlaid

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Textured background, central solid rectangular mask containing a portrait, oversized background text, circular stamp accent","zones":["Textured background, central solid rectangular mask containing a portrait, oversized background text, circular stamp accent"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["hero-cover","centered-portrait","bold-intro"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Hero introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_portrait","purpose":"Central subject portrait","bbox":[0.3,0.2,0.4,0.6],"priority":1},{"id":"bg_texture","purpose":"Highly textured abstract background","bbox":[0.0,0.0,1.0,1.0],"priority":2}]}
- section: {"id":"section-primary","composition":"50/50 vertical split layout, textured background on left, dark solid right with overlapping bright floating text card","zones":["50/50 vertical split layout, textured background on left, dark solid right with overlapping bright floating text card"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["split-screen","floating-card","progress-bars"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key takeaways with progress metrics"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_split_image","purpose":"Textured or artistic visual anchor on left","bbox":[0.1,0.2,0.25,0.6],"priority":1}]}
- content: [{"id":"content-content","composition":"Textured full-bleed background, three scattered rectangular image blocks with bold white typography overlaid","zones":["Textured full-bleed background, three scattered rectangular image blocks with bold white typography overlaid"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["asymmetrical-gallery","scattered-images","bold-overlay"],"avoid":["Text-heavy descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Visual galleries","Core value statements paired with imagery"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"gallery_img_1","purpose":"Abstract or thematic image","bbox":[0.35,0.45,0.25,0.35],"priority":1},{"id":"gallery_img_2","purpose":"Abstract or thematic image","bbox":[0.65,0.1,0.25,0.3],"priority":2}]},{"id":"content-comparison","composition":"Textured background on left overlapping dark right panel, wide landscape image slot, floating brightly colored text card overlapping the image","zones":["Textured background on left overlapping dark right panel, wide landscape image slot, floating brightly colored text card overlapping the image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["overlap-card","landscape-feature","split-backdrop"],"avoid":["Multiple distinct data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Highlighting a specific project or metric"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"feature_image","purpose":"Wide landscape contextual image","bbox":[0.5,0.15,0.4,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Dark solid background, large translucent background typography, two contrasting rounded chart cards (one light, one bright color)","zones":["Dark solid background, large translucent background typography, two contrasting rounded chart cards (one light, one bright color)"],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["dashboard","two-charts","contrasting-cards"],"avoid":["Text-heavy narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Dashboard overviews","Comparing two distinct data sets"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: 50/50 vertical split layout, textured background on left, dark solid right with overlapping bright floating text card","zones":["50/50 vertical split layout, textured background on left, dark solid right with overlapping bright floating text card"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["split-screen","floating-card","progress-bars"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key takeaways with progress metrics"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_split_image","purpose":"Textured or artistic visual anchor on left","bbox":[0.1,0.2,0.25,0.6],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Full-bleed dual image split background, massive translucent typographic wordmark spanning across both halves, centered small text","zones":["Full-bleed dual image split background, massive translucent typographic wordmark spanning across both halves, centered small text"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["split-background","giant-wordmark","quote-slide"],"avoid":["Detailed lists or data","copying source assets, source text, or an exact source arrangement"],"best_for":["Impactful quotes","Thematic section headers"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"bg_left","purpose":"Left half visual context","bbox":[0.0,0.0,0.5,1.0],"priority":1},{"id":"bg_right","purpose":"Right half visual context","bbox":[0.5,0.0,0.5,1.0],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Textured background, central floating stylized wordmark/graphic container, overlapping circular stamp, translucent background text","zones":["Textured background, central floating stylized wordmark/graphic container, overlapping circular stamp, translucent background text"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Crumpled metallic/holographic background textures","Oversized, translucent background typography","Circular typographic stamps acting as graphic accents"],"optional_variants":["closing-slide","hero-graphic","central-focus"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Closing statements","Big reveals"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"central_graphic","purpose":"Primary stylized graphic or logo","bbox":[0.3,0.25,0.4,0.5],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Utilize bold, high-contrast photography (urban, abstract, or street-style)
- Frame primary subject matter in sharp-edged rectangular containers
- Allow images to deliberately underlap floating solid color cards

【图标与装饰】
- Minimize standard vector icons; rely instead on bold typographic stamps and simple geometric shapes
- Use clean, minimalist data visualization elements (lines, dots) within dashboard cards

【数据页构图】
- Dark solid background, large translucent background typography, two contrasting rounded chart cards (one light, one bright color)

【图表风格】
- Enclose charts within distinct, solid-colored cards (white or bright red)
- Use high-contrast minimal lines and data points without heavy axis grids
- Incorporate bold, oversized numeric summaries alongside standard charts

【章节页构图】
- 50/50 vertical split layout, textured background on left, dark solid right with overlapping bright floating text card

【收尾页构图】
- Textured background, central floating stylized wordmark/graphic container, overlapping circular stamp, translucent background text

【禁止】
- Avoid delicate, thin serif typography which clashes with the brutalist vibe
- Do not use soft drop shadows; rely on stark, flat overlaps for depth
- Avoid pastel or low-contrast color palettes
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Streetwear or fashion brand pitches、Music, arts, or cultural festival proposals、Disruptive tech startup decks、Creative agency portfolios。
