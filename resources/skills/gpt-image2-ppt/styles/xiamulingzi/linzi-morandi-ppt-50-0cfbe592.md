# 优雅线条（50）---木七设计 · ppt模板 / linzi-morandi-ppt-50-0cfbe592

## 风格ID
linzi-morandi-ppt-50-0cfbe592

## 风格名称
优雅线条（50）---木七设计 · ppt模板 / linzi-morandi-ppt-50-0cfbe592

## 风格描述
Minimalist Morandi-inspired design system using slate blue, muted tan, and geometric circle motifs for elegant corporate or academic presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white (#FAF8F5) background, slate blue (#8392B7) as the dominant structural and typographic color, tan (#D1BBAA) and navy (#5A6B90) for subtle accents.
- fonts: Clean geometric sans-serif for headings, highly legible high-line-height sans-serif for body text.
- spacing: Generous outer margins, high line-height in body paragraphs, comfortable padding inside colored text blocks.
- shape_language: Primarily circular for covers/decorations, sharp rectangles for content blocking, and diamonds for process diagrams.
- texture: Completely flat and matte, relying on color contrast rather than shadows or depth.
- grid: Center-aligned for markers/covers, asymmetric 2-column or structured 3-column splits for content pages.
- motion_or_depth: Strictly 2D flatness with occasional overlapping elements (e.g., icons breaking the edge of an image) to create a single step of depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（50）---木七设计 · ppt模板 / linzi-morandi-ppt-50-0cfbe592」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist Morandi-inspired design system using slate blue, muted tan, and geometric circle motifs for elegant corporate or academic presentations.
- 推荐配色：#FAF8F5、#8392B7、#D1BBAA、#5A6B90

【不可丢失的风格锚点】
- Central massive circular anchor with concentric outline rings
- Floating asymmetric decorative dots in primary and accent colors
- Flat matte color blocks without gradients or shadows
- Sharp rectangular image masking contrasted with circular motifs

【字体】
- Center large titles inside geometric shapes for high impact
- Use lighter, smaller contrasting subtitles underneath main headers
- Body text should contrast with background (white on slate blue, dark gray on off-white)
- Maintain high line spacing for paragraph readability

【封面页构图】
- Centered massive circular focal point with text, framed by concentric rings and floating corner dots

【内容页构图】
- Large right/bottom background image heavily overlapped by a floating left-aligned solid color text block

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered massive circular focal point with text, framed by concentric rings and floating corner dots","zones":["Centered massive circular focal point with text, framed by concentric rings and floating corner dots"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["cover","circular-focus","minimal"],"avoid":["Data-heavy content","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation sections"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered massive circular focal point with section numbers, framed by concentric rings and floating corner dots","zones":["Centered massive circular focal point with section numbers, framed by concentric rings and floating corner dots"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["section-divider","circular-focus","minimal"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter titles"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Large right/bottom background image heavily overlapped by a floating left-aligned solid color text block","zones":["Large right/bottom background image heavily overlapped by a floating left-aligned solid color text block"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["overlap","image-heavy","text-block"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Introductions","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-bg","purpose":"contextual background image","bbox":[0.35,0.15,0.6,0.7],"priority":1}]},{"id":"content-comparison","composition":"Centered header above a two-column split, with one column bisected horizontally into image and color block, and the other plain text","zones":["Centered header above a two-column split, with one column bisected horizontally into image and color block, and the other plain text"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["two-column","split-grid","text-heavy"],"avoid":["Single-focus dramatic quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Context and background","Detailed descriptions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-img","purpose":"supporting photo","bbox":[0.08,0.25,0.38,0.32],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Central vertical spine formed by stacked, touching diamond shapes containing icons, with text alternating sides","zones":["Central vertical spine formed by stacked, touching diamond shapes containing icons, with text alternating sides"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["vertical-timeline","diamond-spine","alternating-layout"],"avoid":["Long paragraphs","Large image displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Step-by-step processes","Vertical lists"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large right/bottom background image heavily overlapped by a floating left-aligned solid color text block","zones":["Large right/bottom background image heavily overlapped by a floating left-aligned solid color text block"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["overlap","image-heavy","text-block"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Introductions","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-bg","purpose":"contextual background image","bbox":[0.35,0.15,0.6,0.7],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered massive circular focal point with closing text, framed by concentric rings and floating corner dots","zones":["Centered massive circular focal point with closing text, framed by concentric rings and floating corner dots"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Central massive circular anchor with concentric outline rings","Floating asymmetric decorative dots in primary and accent colors","Flat matte color blocks without gradients or shadows"],"optional_variants":["closing","circular-focus","minimal"],"avoid":["Content summaries","Data","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use edge-to-edge unstyled rectangular masks
- Crop images to align exactly with adjacent text blocks to form continuous horizontal or vertical bands

【图标与装饰】
- Simple flat white icons inside solid geometric shapes
- Use oversized graphic icons (like quote marks) overlapping structural blocks as visual anchors

【数据页构图】
- Central vertical spine formed by stacked, touching diamond shapes containing icons, with text alternating sides

【图表风格】
- Use vertically stacked geometric nodes (e.g., diamonds) as a central timeline/process spine
- Alternate text blocks on either side of the vertical spine for balance

【章节页构图】
- Centered massive circular focal point with section numbers, framed by concentric rings and floating corner dots

【收尾页构图】
- Centered massive circular focal point with closing text, framed by concentric rings and floating corner dots

【禁止】
- Avoid gradients, drop shadows, or 3D effects
- Do not clutter the central focal shapes with excessive text
- Avoid harsh primary colors; stick to the muted, desaturated Morandi palette
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic defenses、Consulting reports、Elegant corporate profiles、Minimalist project proposals。
