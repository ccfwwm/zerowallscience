# 抽象艺术ppt（白桃素材） · ppt模板 / linzi-morandi-ppt-ppt-f631ce31

## 风格ID
linzi-morandi-ppt-ppt-f631ce31

## 风格名称
抽象艺术ppt（白桃素材） · ppt模板 / linzi-morandi-ppt-ppt-f631ce31

## 风格描述
An artistic, Morandi-toned presentation system featuring asymmetrical color blocking, delicate vertical typography, and overlapping geometric layers.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Terracotta (#A65E44) and Beige (#F1EEE9) act as dominant backgrounds. Olive (#6A7363), Gold (#B2914F), and Dusty Pink (#D6B5A6) serve as overlapping block accents. Dark warm brown (#4A3D38) is used for high-legibility text.
- fonts: Elegant, thin sans-serif for primary English text. Traditional or stylized serif/calligraphy fallbacks for large vertical Asian characters. High tracking/letter-spacing for small horizontal text.
- spacing: Generous margins, fluid asymmetrical spacing. Elements deliberately break traditional grid lines to overlap adjacent shapes.
- shape_language: Strict orthogonal geometry. Sharp-edged rectangles and squares combined with perfect circles for data nodes. Thin outline frames used as accents.
- texture: Flat, matte finish. No gradients, drop shadows, or glossy effects. Relies entirely on solid color contrast for depth.
- grid: Deconstructed, fluid 3-column or asymmetrical split grids. Content often anchored to alternating corners rather than centered.
- motion_or_depth: Depth is strictly established through the 2.5D overlapping of flat colored rectangles, images, and outline frames.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「抽象艺术ppt（白桃素材） · ppt模板 / linzi-morandi-ppt-ppt-f631ce31」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An artistic, Morandi-toned presentation system featuring asymmetrical color blocking, delicate vertical typography, and overlapping geometric layers.
- 推荐配色：#A65E44、#F1EEE9、#6A7363、#B2914F、#D6B5A6、#4A3D38

【不可丢失的风格锚点】
- Asymmetrical overlapping solid color rectangles
- Vertical typography for prominent titles and accents
- Muted, earthy Morandi color palette
- Integration of minimalist continuous-line illustrations
- Edge-anchored corner blocks in contrasting colors

【字体】
- Primary section headers are typically oriented vertically and positioned asymmetrically on the page
- Horizontal body text is kept short, utilizing high line height and often placed inside colored backing shapes
- Mixing sizes drastically: extremely large hero typography paired with very small, spaced-out secondary text
- Use of diagonal or staggered dashed lines (```) as typographic decorative accents

【封面页构图】
- Asymmetrical split background with large vertical typography and staggered floating corner rectangles

【内容页构图】
- Diagonal balance between a top-right image block and a bottom-left text block on a colored shape

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split background with large vertical typography and staggered floating corner rectangles","zones":["Asymmetrical split background with large vertical typography and staggered floating corner rectangles"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["vertical-title","split-background","line-art"],"avoid":["Data-heavy introductions","Corporate standard covers","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Chapter title slides"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Card-in-card layout with a thick border, large hero character, and edge-anchored geometric tabs","zones":["Card-in-card layout with a thick border, large hero character, and edge-anchored geometric tabs"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["card-in-card","oversized-type","floating-tabs"],"avoid":["Standard content slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Major quotes or themes"],"evidence_pages":["page-06"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Diagonal balance between a top-right image block and a bottom-left text block on a colored shape","zones":["Diagonal balance between a top-right image block and a bottom-left text block on a colored shape"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["image-top-right","colored-text-box","diagonal-balance"],"avoid":["Complex data points","Long-form paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction to a concept","Image and description pairing"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero","purpose":"Conceptual desaturated landscape or architecture","bbox":[0.54,0.09,0.31,0.49],"priority":1}]},{"id":"content-comparison","composition":"Multi-column layout with a vertical pillar image, centralized text, and an overlapping secondary image","zones":["Multi-column layout with a vertical pillar image, centralized text, and an overlapping secondary image"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["multi-column","overlapping-images","vertical-pillar"],"avoid":["Minimalist single-statement slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Multi-image mood boards","Detailed product or concept features"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img1","purpose":"Vertical pillar image","bbox":[0.08,0.22,0.15,0.51],"priority":1},{"id":"img2","purpose":"Supporting accent photo","bbox":[0.68,0.36,0.31,0.51],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Central cluster of varying-height vertical arrows with dispersed text labels","zones":["Central cluster of varying-height vertical arrows with dispersed text labels"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["trend-arrows","central-graphic","scattered-labels"],"avoid":["Precise numerical data comparisons","Complex flowcharts","copying source assets, source text, or an exact source arrangement"],"best_for":["Growth trends","Future projections","Categorical milestones"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Diagonal balance between a top-right image block and a bottom-left text block on a colored shape","zones":["Diagonal balance between a top-right image block and a bottom-left text block on a colored shape"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["image-top-right","colored-text-box","diagonal-balance"],"avoid":["Complex data points","Long-form paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction to a concept","Image and description pairing"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero","purpose":"Conceptual desaturated landscape or architecture","bbox":[0.54,0.09,0.31,0.49],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Mirrored cover layout with vertical typography on the right and overlapping rectangular zones","zones":["Mirrored cover layout with vertical typography on the right and overlapping rectangular zones"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical overlapping solid color rectangles","Vertical typography for prominent titles and accents","Muted, earthy Morandi color palette"],"optional_variants":["mirrored-cover","vertical-closing","layered-blocks"],"avoid":["Any new information or data","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information","Final thought/quote"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be heavily desaturated or color-graded to match the muted, warm earthy palette
- Photographs are often cropped into strict rectangles that touch at least one edge of the slide
- Images frequently overlap with solid color blocks or text containers to integrate them into the slide hierarchy

【图标与装饰】
- Rejects traditional functional icons in favor of abstract, continuous-line art illustrations
- Line art should use thin, consistent stroke weights in dark brown or black

【数据页构图】
- Central cluster of varying-height vertical arrows with dispersed text labels

【图表风格】
- Data visualization is highly simplified, utilizing flat geometric shapes (e.g., overlapping circles, stylized flat arrows)
- White or highly contrasting text placed directly inside muted colored nodes
- Avoid standard Excel/PPT chart defaults; build data displays from basic vector shapes to match the flat aesthetic

【章节页构图】
- Card-in-card layout with a thick border, large hero character, and edge-anchored geometric tabs

【收尾页构图】
- Mirrored cover layout with vertical typography on the right and overlapping rectangular zones

【禁止】
- No drop shadows, bevels, or 3D effects
- No highly saturated, bright, or neon colors
- No centered, symmetrical, rigid traditional corporate layouts
- No heavy, bold, blocky sans-serif fonts for large titles
- Avoid standard bullet points; use spatial grouping instead
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios or lookbooks、Lifestyle, fashion, or interior design proposals、Cultural or humanities-focused academic presentations、Brand identity pitch decks emphasizing calm, elegant aesthetics。
