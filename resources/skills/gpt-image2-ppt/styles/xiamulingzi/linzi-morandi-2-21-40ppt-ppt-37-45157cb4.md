# 莫兰迪风尚 (37) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-37-45157cb4

## 风格ID
linzi-morandi-2-21-40ppt-ppt-37-45157cb4

## 风格名称
莫兰迪风尚 (37) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-37-45157cb4

## 风格描述
A modern, organic presentation template featuring a Morandi pastel color palette, fluid blob shapes, floating UI-style cards, and continuous-line art accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted pastels for backgrounds and shapes; dark slate for high-contrast primary text; off-white for floating cards.
- fonts: Clean, modern sans-serif; strong weight contrast between bold headers and light body copy.
- spacing: Generous whitespace with asymmetric balance driven by the irregular organic shapes.
- shape_language: Highly organic fluid shapes mixed with soft rounded rectangles and pill-shaped tags.
- texture: Flat color vectors with shallow 2.5D drop shadow effects and thin line-art overlays.
- grid: Loose, asymmetric modular grid where content floats within rounded containers rather than strict columns.
- motion_or_depth: Shallow depth achieved by layering floating white cards with soft drop shadows over flat organic background shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (37) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-37-45157cb4」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A modern, organic presentation template featuring a Morandi pastel color palette, fluid blob shapes, floating UI-style cards, and continuous-line art accents.
- 推荐配色：#F5F0EA、#CC8B8D、#7A9B9F、#EAA683、#C3C6A8、#2B3A42

【不可丢失的风格锚点】
- Morandi muted pastel color palette
- Fluid, organic 'blob' background shapes
- Floating white rectangular cards with soft drop shadows
- Minimalist continuous-line art illustrations

【字体】
- Left-aligned body copy in a light weight
- Bold, dark slate headers for clear hierarchy
- Pill-shaped backgrounds for small categorical or date text
- Muted pastel colors applied to subtitles to match background elements

【封面页构图】
- Centered title and floating pill button surrounded by framing organic blobs and line art.

【内容页构图】
- Left-aligned text with custom bullets and a large right-side image heavily masked into a dynamic organic shape.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and floating pill button surrounded by framing organic blobs and line art.","zones":["Centered title and floating pill button surrounded by framing organic blobs and line art."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["centered","minimal","organic-frame"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section transitions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Wavy background split with large cutout subject on one side and a floating organic speech bubble.","zones":["Wavy background split with large cutout subject on one side and a floating organic speech bubble."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["cutout","wavy-split","speech-bubble"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us introductions","Team profiles","Section dividers"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"cutout-subject","purpose":"transparent cutout subject","bbox":[0.45,0.05,0.4,0.95],"priority":1}]}
- content: [{"id":"content-content","composition":"Left-aligned text with custom bullets and a large right-side image heavily masked into a dynamic organic shape.","zones":["Left-aligned text with custom bullets and a large right-side image heavily masked into a dynamic organic shape."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["split-layout","organic-mask","bullet-points"],"avoid":["Dense quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Service descriptions","Core concepts"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"main-image","purpose":"hero visual","bbox":[0.44,0.3,0.56,0.58],"priority":1}]},{"id":"content-comparison","composition":"Overlapping 3D-effect floating cards and images against an organic background blob.","zones":["Overlapping 3D-effect floating cards and images against an organic background blob."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["overlapping-cards","floating-ui","depth"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Showcases","Testimonials","Product highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"card-image-1","purpose":"product or concept image","bbox":[0.55,0.4,0.35,0.45],"priority":1},{"id":"card-image-2","purpose":"supporting image","bbox":[0.7,0.15,0.25,0.3],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Split layout with minimal bar charts on the left and staggered floating image cards on the right.","zones":["Split layout with minimal bar charts on the left and staggered floating image cards on the right."],"content_capacity":{"density":"medium","max_items":7},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["bar-charts","staggered-cards","mixed-media"],"avoid":["Complex, high-precision data","copying source assets, source text, or an exact source arrangement"],"best_for":["Project portfolios","Data mixed with visual evidence","Performance highlights"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"proj-1","purpose":"project thumbnail","bbox":[0.34,0.35,0.18,0.35],"priority":1},{"id":"proj-2","purpose":"project thumbnail","bbox":[0.54,0.35,0.18,0.35],"priority":2},{"id":"proj-3","purpose":"project thumbnail","bbox":[0.75,0.35,0.18,0.35],"priority":3}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Vertical timeline with colored date blocks, rounded image thumbnails, and pill-shaped category tags.","zones":["Vertical timeline with colored date blocks, rounded image thumbnails, and pill-shaped category tags."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["timeline","list","thumbnails"],"avoid":["Single focus messaging","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Schedules","Process timelines"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"thumb-1","purpose":"event thumbnail","bbox":[0.19,0.32,0.12,0.14],"priority":1},{"id":"thumb-2","purpose":"event thumbnail","bbox":[0.19,0.52,0.12,0.14],"priority":2},{"id":"thumb-3","purpose":"event thumbnail","bbox":[0.19,0.72,0.12,0.14],"priority":3}]}]
- agenda: {"id":"agenda-primary","composition":"Vertical timeline with colored date blocks, rounded image thumbnails, and pill-shaped category tags.","zones":["Vertical timeline with colored date blocks, rounded image thumbnails, and pill-shaped category tags."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["timeline","list","thumbnails"],"avoid":["Single focus messaging","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Schedules","Process timelines"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"thumb-1","purpose":"event thumbnail","bbox":[0.19,0.32,0.12,0.14],"priority":1},{"id":"thumb-2","purpose":"event thumbnail","bbox":[0.19,0.52,0.12,0.14],"priority":2},{"id":"thumb-3","purpose":"event thumbnail","bbox":[0.19,0.72,0.12,0.14],"priority":3}]}
- closing: {"id":"closing-primary","composition":"Large wavy split background with two overlapping floating title cards and minimal footer icons.","zones":["Large wavy split background with two overlapping floating title cards and minimal footer icons."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Morandi muted pastel color palette","Fluid, organic 'blob' background shapes","Floating white rectangular cards with soft drop shadows"],"optional_variants":["wavy-split","overlapping-text","closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are aggressively masked into organic fluid shapes or soft rounded rectangles
- Cutout subjects are layered over complex clusters of colored blobs
- Photography is often tinted or balanced to harmonize with the muted pastel palette

【图标与装饰】
- Minimalist, thin outline icons for functional elements
- Continuous-line artistic vectors used as decorative accents

【数据页构图】
- Split layout with minimal bar charts on the left and staggered floating image cards on the right.

【图表风格】
- Highly simplified, flat pastel colors
- No visible axes, tick marks, or gridlines
- Custom horizontal bars and minimalist donut charts with rounded line caps

【章节页构图】
- Wavy background split with large cutout subject on one side and a floating organic speech bubble.

【收尾页构图】
- Large wavy split background with two overlapping floating title cards and minimal footer icons.

【禁止】
- Avoid sharp corners and harsh geometric angles
- Avoid highly saturated primary colors
- Avoid literal use of specific weird stock assets (e.g., headless figure)
- Prevent tight line-heights that cause text overlapping
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Lifestyle, wellness, or fashion brand decks、Soft, modern corporate overviews、Design and art presentations。
