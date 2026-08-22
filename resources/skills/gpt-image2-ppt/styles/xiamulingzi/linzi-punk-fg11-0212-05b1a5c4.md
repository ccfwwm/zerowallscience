# 0212 · FG11【朋克酷风】 / linzi-punk-fg11-0212-05b1a5c4

## 风格ID
linzi-punk-fg11-0212-05b1a5c4

## 风格名称
0212 · FG11【朋克酷风】 / linzi-punk-fg11-0212-05b1a5c4

## 风格描述
An edgy, brutalist-inspired magazine-style layout featuring stark black and white contrasts, vivid orange-red accents, and bold typographic arrangements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Black and white used for macro structural blocks; orange-red reserved for call-to-actions, highlight panels, and typographic accents.
- fonts: Heavy geometric/grotesque sans-serif for headings; clean, highly legible sans-serif for body copy.
- spacing: Asymmetrical, magazine-editorial grid with tight content clusters and expansive contrasting negative space.
- shape_language: Strictly orthogonal with sharp 90-degree corners; perfect circles used exclusively as text paths.
- texture: Flat, matte vector color blocks contrasted strictly against desaturated, high-contrast monochrome photography.
- grid: Modular, unbalanced but strictly aligned to a rigid underlying framework. Relies heavily on thick vertical/horizontal dividing zones.
- motion_or_depth: Completely flat and graphic. Depth is implied only through stark color blocking and overlapping text layers without shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「0212 · FG11【朋克酷风】 / linzi-punk-fg11-0212-05b1a5c4」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An edgy, brutalist-inspired magazine-style layout featuring stark black and white contrasts, vivid orange-red accents, and bold typographic arrangements.
- 推荐配色：#FFFFFF、#000000、#F04D30

【不可丢失的风格锚点】
- High-contrast monochromatic blocks with selective vibrant accents
- Brutalist, oversized geometric sans-serif typography
- Text set on circular paths forming graphic badges
- Frequent 90-degree rotated structural text framing the canvas edges

【字体】
- Headings must be strictly uppercase and highly tracked or tightly stacked.
- Utilize 90-degree rotated text along canvas margins as structural framing devices.
- Employ circular text paths as decorative graphic elements to balance heavy rectangular blocks.
- Body copy should be modest in size, creating extreme scale contrast with headings.

【封面页构图】
- Asymmetrical split with oversized center-left typography, edge-aligned rotated text, and a bottom-right structural image block.

【内容页构图】
- Dominant asymmetrical image block spanning the top left, thick vertical marginal block, and segmented white spaces for stacked typography.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with oversized center-left typography, edge-aligned rotated text, and a bottom-right structural image block.","zones":["Asymmetrical split with oversized center-left typography, edge-aligned rotated text, and a bottom-right structural image block."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["High-contrast monochromatic blocks with selective vibrant accents","Brutalist, oversized geometric sans-serif typography","Text set on circular paths forming graphic badges"],"optional_variants":["cover-asymmetrical","brutalist-intro"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","High-impact introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bottom-right","purpose":"Abstract monochrome hero image","bbox":[0.52,0.2,0.48,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Dark mode 50/50 split layout. Large layered typography overlapping a half-bleed image on one side, paired with a stark dark text column on the other.","zones":["Dark mode 50/50 split layout. Large layered typography overlapping a half-bleed image on one side, paired with a stark dark text column on the other."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["High-contrast monochromatic blocks with selective vibrant accents","Brutalist, oversized geometric sans-serif typography","Text set on circular paths forming graphic badges"],"optional_variants":["dark-split","text-over-image"],"avoid":["Detailed charts","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Major chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-half-bleed","purpose":"Textured background for section title","bbox":[0.07,0.14,0.37,0.72],"priority":1}]}
- content: [{"id":"content-content","composition":"Dominant asymmetrical image block spanning the top left, thick vertical marginal block, and segmented white spaces for stacked typography.","zones":["Dominant asymmetrical image block spanning the top left, thick vertical marginal block, and segmented white spaces for stacked typography."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["High-contrast monochromatic blocks with selective vibrant accents","Brutalist, oversized geometric sans-serif typography","Text set on circular paths forming graphic badges"],"optional_variants":["asymmetrical-hero","stacked-typography"],"avoid":["Lists and bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Manifesto statements","Hero image showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-top-left","purpose":"Dominant thematic image","bbox":[0.07,0.0,0.63,0.74],"priority":1},{"id":"accent-bottom-right","purpose":"Secondary supporting texture","bbox":[0.7,0.74,0.3,0.26],"priority":2}]},{"id":"content-comparison","composition":"White canvas dominated by massive central typographic lockup, accented by a circular text badge and floating disconnected square image blocks.","zones":["White canvas dominated by massive central typographic lockup, accented by a circular text badge and floating disconnected square image blocks."],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["High-contrast monochromatic blocks with selective vibrant accents","Brutalist, oversized geometric sans-serif typography","Text set on circular paths forming graphic badges"],"optional_variants":["type-as-image","floating-blocks"],"avoid":["Complex data","Long-form reading","copying source assets, source text, or an exact source arrangement"],"best_for":["Key messaging","Project titles"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"top-left-square","purpose":"Abstract visual anchor","bbox":[0.06,0.04,0.19,0.38],"priority":2},{"id":"bottom-right-large","purpose":"Main visual focus","bbox":[0.66,0.55,0.3,0.4],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Dark mode 50/50 split layout. Large layered typography overlapping a half-bleed image on one side, paired with a stark dark text column on the other.","zones":["Dark mode 50/50 split layout. Large layered typography overlapping a half-bleed image on one side, paired with a stark dark text column on the other."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["High-contrast monochromatic blocks with selective vibrant accents","Brutalist, oversized geometric sans-serif typography","Text set on circular paths forming graphic badges"],"optional_variants":["dark-split","text-over-image"],"avoid":["Detailed charts","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Major chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left-half-bleed","purpose":"Textured background for section title","bbox":[0.07,0.14,0.37,0.72],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Dominant asymmetrical image block spanning the top left, thick vertical marginal block, and segmented white spaces for stacked typography.","zones":["Dominant asymmetrical image block spanning the top left, thick vertical marginal block, and segmented white spaces for stacked typography."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["High-contrast monochromatic blocks with selective vibrant accents","Brutalist, oversized geometric sans-serif typography","Text set on circular paths forming graphic badges"],"optional_variants":["asymmetrical-hero","stacked-typography"],"avoid":["Lists and bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Manifesto statements","Hero image showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-top-left","purpose":"Dominant thematic image","bbox":[0.07,0.0,0.63,0.74],"priority":1},{"id":"accent-bottom-right","purpose":"Secondary supporting texture","bbox":[0.7,0.74,0.3,0.26],"priority":2}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- All photography must be desaturated (black and white or highly muted) and high-contrast.
- Images must be cropped into sharp, hard-edged rectangles or squares.
- Never use rounded corners on image masks.

【图标与装饰】
- Strictly monoline, uniform stroke width.
- Geometric and unembellished, rendering clearly against solid backgrounds.

【数据页构图】
- Dark mode 50/50 split layout. Large layered typography overlapping a half-bleed image on one side, paired with a stark dark text column on the other.

【图表风格】
- Minimalist UI-card style visualization.
- Data bars use flat color fills without gradients, using the accent color for active states.

【章节页构图】
- Dark mode 50/50 split layout. Large layered typography overlapping a half-bleed image on one side, paired with a stark dark text column on the other.

【收尾页构图】
- Asymmetrical split with oversized center-left typography, edge-aligned rotated text, and a bottom-right structural image block.

【禁止】
- Full-color photography that competes with the accent color
- Drop shadows, glows, or gradients
- Rounded corners on primary structural shapes or image masks
- Script, serif, or low-weight fonts for primary headings
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Edgy creative agency credentials、Avant-garde architectural or design pitches、High-impact, visually disruptive marketing decks。
