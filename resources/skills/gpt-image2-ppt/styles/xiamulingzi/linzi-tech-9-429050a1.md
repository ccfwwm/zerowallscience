# 精选科技风9 · 模板 / linzi-tech-9-429050a1

## 风格ID
linzi-tech-9-429050a1

## 风格名称
精选科技风9 · 模板 / linzi-tech-9-429050a1

## 风格描述
A sophisticated dark-mode tech template featuring vibrant neon gradients, particle abstractions, and an elegant serif typography mix.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark primary backgrounds with bright, saturated neon gradients for interactive cues, buttons, and active tabs.
- fonts: Transitional or modern serif for large headers to convey premium quality; clean sans-serif for body text and UI components.
- spacing: Generous negative space to emphasize background textures, with structured 16/9 grid alignments for content blocks.
- shape_language: Primarily orthogonal shapes with sharp or very slightly rounded corners; frequent use of thin border outlines.
- texture: Smooth gradients paired with complex, granular 3D particle dust and glowing light streaks.
- grid: Modular grids with frequent use of asymmetric splits (e.g., 70/30 or 50/50) and horizontal card arrays.
- motion_or_depth: Depth achieved through brightly colored floating cards over dark, deep abstract backgrounds and subtle drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风9 · 模板 / linzi-tech-9-429050a1」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated dark-mode tech template featuring vibrant neon gradients, particle abstractions, and an elegant serif typography mix.
- 推荐配色：#12103E、#00FFFF、#A832FF、#FF3385、#FFA700

【不可丢失的风格锚点】
- Deep violet/navy dark backgrounds with dynamic 3D particle graphics
- Elegant serif fonts for primary headings contrasting with tech visuals
- Vibrant cyan, magenta, and orange gradients used as functional highlights
- Thin glowing borders for inactive elements and full color for active elements

【字体】
- Use elegant serif fonts for primary slide titles to create a premium contrast against the tech theme.
- Use legible, light-weight sans-serif fonts for paragraphs and metadata.
- Apply cyan or gradient fills to emphasis words within serif titles.

【封面页构图】
- Centered typographic hierarchy over a dominant central abstract spherical graphic.

【内容页构图】
- Asymmetric 70/30 split with a left-aligned image/quote and a right-side vertical interactive tab menu.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typographic hierarchy over a dominant central abstract spherical graphic.","zones":["Centered typographic hierarchy over a dominant central abstract spherical graphic."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["centered","minimal","hero-graphic"],"avoid":["Heavy text descriptions","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Main title slides","Section transitions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered header above a horizontal row of uniform interactive cards over an ambient background.","zones":["Centered header above a horizontal row of uniform interactive cards over an ambient background."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["horizontal-cards","centered-header","menu"],"avoid":["Deep technical details","Complex narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Service overviews","Core feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetric 70/30 split with a left-aligned image/quote and a right-side vertical interactive tab menu.","zones":["Asymmetric 70/30 split with a left-aligned image/quote and a right-side vertical interactive tab menu."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["split-layout","vertical-tabs","quote"],"avoid":["Large datasets","Gallery grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Process steps","Key quotes with context"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-image","purpose":"Author or subject context image","bbox":[0.0,0.2,0.25,0.6],"priority":1}]},{"id":"content-comparison","composition":"50/50 split with text on a solid dark background on one side and an edge-to-edge image with a floating info card on the other.","zones":["50/50 split with text on a solid dark background on one side and an edge-to-edge image with a floating info card on the other."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["50-50-split","floating-card","profile"],"avoid":["Comparisons of multiple items","Statistical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member profiles","Case study intros","Product highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"half-page-image","purpose":"Immersive contextual photography","bbox":[0.5,0.0,0.5,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Top text summary above a horizontal array of brightly colored vertical metric cards with watermark icons.","zones":["Top text summary above a horizontal array of brightly colored vertical metric cards with watermark icons."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["metric-cards","vibrant-gradients","data-row"],"avoid":["Trend lines over time","Complex analytical charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key performance indicators (KPIs)","Promotional statistics","Milestones"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetric 70/30 split with a left-aligned image/quote and a right-side vertical interactive tab menu.","zones":["Asymmetric 70/30 split with a left-aligned image/quote and a right-side vertical interactive tab menu."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["split-layout","vertical-tabs","quote"],"avoid":["Large datasets","Gallery grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Process steps","Key quotes with context"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-image","purpose":"Author or subject context image","bbox":[0.0,0.2,0.25,0.6],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Large, centered typography over a dynamic perspective background that converges to a bright focal point.","zones":["Large, centered typography over a dynamic perspective background that converges to a bright focal point."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Deep violet/navy dark backgrounds with dynamic 3D particle graphics","Elegant serif fonts for primary headings contrasting with tech visuals","Vibrant cyan, magenta, and orange gradients used as functional highlights"],"optional_variants":["closing","centered-focus","high-impact"],"avoid":["Content delivery","Multi-element layouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts","Major announcements"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Apply strong duotone or purple/magenta color overlays to photography to integrate with the dark tech theme.
- Use edge-to-edge bleeding for large hero images, often overlaid with floating opaque content cards.

【图标与装饰】
- Use simple, thin white line icons.
- Scale icons up and crop them as low-opacity watermarks in the background of metric cards.

【数据页构图】
- Top text summary above a horizontal array of brightly colored vertical metric cards with watermark icons.

【图表风格】
- Present data via large, minimalist typographic metrics inside distinct, vibrantly colored gradient cards.
- Avoid complex axes in favor of bold, singular numbers paired with thin line icons.

【章节页构图】
- Centered header above a horizontal row of uniform interactive cards over an ambient background.

【收尾页构图】
- Large, centered typography over a dynamic perspective background that converges to a bright focal point.

【禁止】
- Do not use stark white backgrounds, which break the dark tech immersion.
- Avoid heavy blocky icons; stick to delicate linework.
- Do not mix highly saturated standard colors (like pure red/green); stick to the curated neon gradient palette.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Technology product launches、Digital agency portfolios、Creative direction proposals、Data-driven marketing reports。
