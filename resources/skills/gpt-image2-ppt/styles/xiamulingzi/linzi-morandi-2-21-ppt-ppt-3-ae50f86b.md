# 3 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-3-ae50f86b

## 风格ID
linzi-morandi-2-21-ppt-ppt-3-ae50f86b

## 风格名称
3 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-3-ae50f86b

## 风格描述
An elegant, editorial-style presentation design system featuring a muted earthy palette, overlapping geometric shapes, and a sophisticated serif/sans-serif typography mix.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominant, dark grey for text and contrast backgrounds, sage green tones for accent shapes and highlights.
- fonts: High-contrast Serif for primary display headings; clean, readable Sans-serif for body copy, subheadings, and UI elements.
- spacing: Loose, editorial rhythm with wide margins and intentional use of negative space to isolate content blocks.
- shape_language: Strictly geometric; sharp rectangles for color blocks and image crops, perfect circles or soft rounded squares for icon containers.
- texture: Flat, matte finish on all vector elements. Reliance on photographic content to introduce organic texture.
- grid: Flexible multi-column grid, often favoring asymmetrical splits (e.g., 40/60) to create dynamic tension.
- motion_or_depth: Shallow depth achieved entirely through 2D overlap of solid color blocks, text, and images; no traditional drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「3 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-3-ae50f86b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style presentation design system featuring a muted earthy palette, overlapping geometric shapes, and a sophisticated serif/sans-serif typography mix.
- 推荐配色：#FFFFFF、#4D4D4D、#B0B386、#D9DBC6、#EAEAEA

【不可丢失的风格锚点】
- Muted, natural color palette anchored by sage green
- Elegant serif typography for main headings
- Overlapping solid or semi-transparent rectangular color blocks behind text or images
- Asymmetrical, magazine-style layouts with generous whitespace
- Prominent but subtle slide numbering in large light grey serif type

【字体】
- Primary titles use a large, elegant serif font, often overlapping a colored background block.
- Body copy is sans-serif, set small with comfortable line height for legibility.
- Subtitles or tags are sans-serif, uppercase, and slightly tracked out.
- Large, muted serif numerals serve as graphic elements for slide numbers.

【封面页构图】
- Full bleed background image with dark overlay, left-aligned title overlapping a prominent central translucent color block.

【内容页构图】
- Asymmetrical layout: center-left vertical image, text broken into top-left background block and right-aligned main block.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full bleed background image with dark overlay, left-aligned title overlapping a prominent central translucent color block.","zones":["Full bleed background image with dark overlay, left-aligned title overlapping a prominent central translucent color block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["hero-image","overlay","layered-title"],"avoid":["Data-heavy content","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Major section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-image","purpose":"Full bleed background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Split layout: left text column, right image column overlapping an offset background color block.","zones":["Split layout: left text column, right image column overlapping an offset background color block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["split-layout","image-right","offset-background"],"avoid":["Multi-step processes","Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member introductions","Product highlights","Key concept with visual aid"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-right","purpose":"Feature image supporting text","bbox":[0.54,0.12,0.36,0.75],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetrical layout: center-left vertical image, text broken into top-left background block and right-aligned main block.","zones":["Asymmetrical layout: center-left vertical image, text broken into top-left background block and right-aligned main block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["asymmetrical","image-left","floating-block"],"avoid":["Dense data display","Simple bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Editorial content","Case studies","Quotes with context"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-left-center","purpose":"Primary visual subject","bbox":[0.22,0.29,0.3,0.71],"priority":1}]},{"id":"content-comparison","composition":"Left-heavy layout: left image anchored to bottom, right column text with an overlapping right-edge background block.","zones":["Left-heavy layout: left image anchored to bottom, right column text with an overlapping right-edge background block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["image-left","text-right","overlapping-title"],"avoid":["Comparison tables","Timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter introductions","Vision/Mission statements","Product showcases"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"image-left","purpose":"Dominant visual","bbox":[0.16,0.17,0.35,0.83],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split layout: left text column, right image column overlapping an offset background color block.","zones":["Split layout: left text column, right image column overlapping an offset background color block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["split-layout","image-right","offset-background"],"avoid":["Multi-step processes","Quantitative data","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member introductions","Product highlights","Key concept with visual aid"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image-right","purpose":"Feature image supporting text","bbox":[0.54,0.12,0.36,0.75],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered header over a 2x3 grid of text items separated by small directional icons.","zones":["Centered header over a 2x3 grid of text items separated by small directional icons."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["grid-layout","text-heavy","list-view"],"avoid":["Image-driven narratives","Single impactful statements","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Tables of contents","Feature matrices"],"evidence_pages":["page-06"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Centered header over a 2x3 grid of text items separated by small directional icons.","zones":["Centered header over a 2x3 grid of text items separated by small directional icons."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["grid-layout","text-heavy","list-view"],"avoid":["Image-driven narratives","Single impactful statements","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Tables of contents","Feature matrices"],"evidence_pages":["page-06"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Dark background, left-aligned minimal text, centered accent color block overlapping the main title.","zones":["Dark background, left-aligned minimal text, centered accent color block overlapping the main title."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, natural color palette anchored by sage green","Elegant serif typography for main headings","Overlapping solid or semi-transparent rectangular color blocks behind text or images"],"optional_variants":["dark-mode","minimalist","overlapping-title"],"avoid":["Introducing new information","Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information","Final quotes"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into sharp-edged rectangles.
- Images frequently overlap or underlap solid colored geometric background shapes to create layered compositions.
- Use of full-bleed imagery for covers with dark overlays for text legibility.

【图标与装饰】
- Solid white flat icons placed centrally within colored geometric containers (circles or rounded squares).
- Icon containers use varying shades from the core palette to create subtle sequence or grouping.

【数据页构图】
- Split layout: left text column, right image column overlapping an offset background color block.

【图表风格】
- No complex data charts present, but styling implies flat, unstyled geometric representations using the core palette.

【章节页构图】
- Split layout: left text column, right image column overlapping an offset background color block.

【收尾页构图】
- Dark background, left-aligned minimal text, centered accent color block overlapping the main title.

【禁止】
- Avoid bright, saturated, or neon colors.
- Do not use drop shadows, gradients, or 3D effects on shapes.
- Avoid cluttered layouts; maintain high whitespace ratios.
- Do not use heavy or overly bold sans-serif fonts for large titles.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle brand lookbooks.、Boutique agency portfolios or pitch decks.、Wellness, beauty, or organic product presentations.、High-end real estate or interior design proposals.。
