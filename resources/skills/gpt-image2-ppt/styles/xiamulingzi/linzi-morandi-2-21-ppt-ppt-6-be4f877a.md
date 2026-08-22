# 6 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-6-be4f877a

## 风格ID
linzi-morandi-2-21-ppt-ppt-6-be4f877a

## 风格名称
6 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-6-be4f877a

## 风格描述
A soft, approachable presentation template using a Morandi pastel palette and fluid organic shapes, ideal for creative or lifestyle summaries.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream (#F4F3ED) as primary background, Slate Blue (#92B0C0) and Warm Beige (#E0D5C1) for large structural background shapes and accents, Dark Slate (#4A6B7C) for high-contrast text.
- fonts: Heavy geometric sans-serif for structural numbers and primary English headers; standard clean sans-serif for body text and subtitles.
- spacing: Generous margins with centralized focal points for covers/sections; ample padding around text blocks to breathe against organic shapes.
- shape_language: Organic, fluid, curving shapes; rounded rectangles and perfect circles for functional UI elements.
- texture: Predominantly flat vector shapes with very subtle drop shadows on floating icons and images.
- grid: Symmetrical centered alignments for transitions; 2-column balancing for content slides.
- motion_or_depth: 2.5D layering where flat background blobs sit behind content, and functional interactive elements (icons, mockups) float above with soft shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「6 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-6-be4f877a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A soft, approachable presentation template using a Morandi pastel palette and fluid organic shapes, ideal for creative or lifestyle summaries.
- 推荐配色：#F4F3ED、#92B0C0、#E0D5C1、#4A6B7C、#D9E3E8

【不可丢失的风格锚点】
- Fluid, organic blob background framing
- Scattered soft dot motifs (stars/snow)
- Muted, low-saturation 'Morandi' color palette
- Soft rounded containers for iconography

【字体】
- Stack large structural identifiers (e.g., section numbers) in a heavy font above primary local-language titles.
- Center align titles on cover, section, and closing slides.
- Use dark slate color for primary text to maintain legibility against cream backgrounds without the harshness of pure black.

【封面页构图】
- Centered title and subtitle text surrounded by overlapping organic corner blobs.

【内容页构图】
- Top title, left text column, right rectangular image, bottom row of four icon-text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle text surrounded by overlapping organic corner blobs.","zones":["Centered title and subtitle text surrounded by overlapping organic corner blobs."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["minimal","centered","organic-frame"],"avoid":["Data heavy content","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered section number/title with a subtitle, framed by organic background shapes.","zones":["Centered section number/title with a subtitle, framed by organic background shapes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["section-break","centered-text"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Agenda transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Top title, left text column, right rectangular image, bottom row of four icon-text blocks.","zones":["Top title, left text column, right rectangular image, bottom row of four icon-text blocks."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["split-layout","bottom-icons","image-right"],"avoid":["Full screen data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Project overviews","Feature highlights with supporting categorizations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-project-image","purpose":"Showcase project or contextual photography","bbox":[0.62,0.2,0.38,0.38],"priority":1}]},{"id":"content-comparison","composition":"Centered device mockup framing an image, flanked symmetrically by text blocks, with bottom footer text.","zones":["Centered device mockup framing an image, flanked symmetrically by text blocks, with bottom footer text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["device-mockup","symmetrical","center-focus"],"avoid":["Lengthy text explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Software demos","Website showcases","Key product features"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"device-screen","purpose":"Screen content for device mockup","bbox":[0.25,0.2,0.5,0.55],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Centered section number/title with a subtitle, framed by organic background shapes.","zones":["Centered section number/title with a subtitle, framed by organic background shapes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["section-break","centered-text"],"avoid":["Detailed content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter breaks","Agenda transitions"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top title, left text column, right rectangular image, bottom row of four icon-text blocks.","zones":["Top title, left text column, right rectangular image, bottom row of four icon-text blocks."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["split-layout","bottom-icons","image-right"],"avoid":["Full screen data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Project overviews","Feature highlights with supporting categorizations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-project-image","purpose":"Showcase project or contextual photography","bbox":[0.62,0.2,0.38,0.38],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered closing text over the standard organic background frame.","zones":["Centered closing text over the standard organic background frame."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, organic blob background framing","Scattered soft dot motifs (stars/snow)","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["closing","centered-text","bookend"],"avoid":["Adding new information","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Mask images into clean rectangles for standard content, realistic device mockups for digital showcases, or fluid organic shapes to match the background aesthetic.

【图标与装饰】
- Solid white flat icons placed inside circular colored containers (slate or beige).
- Apply a subtle drop shadow to icon containers to lift them from the flat background.

【数据页构图】
- Centered section number/title with a subtitle, framed by organic background shapes.

【图表风格】
- Abstract diagrams use radial or semi-circular node arrangements.
- Connect conceptual points using arched color blocks framing a central visual anchor.

【章节页构图】
- Centered section number/title with a subtitle, framed by organic background shapes.

【收尾页构图】
- Centered closing text over the standard organic background frame.

【禁止】
- Avoid sharp geometric angles (triangles, sharp polygons) in background elements.
- Do not use highly saturated or neon colors; stick to muted pastels.
- Avoid pure black text; use dark slate/blue-gray tones instead.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Year-end summaries or reviews、Creative agency portfolios、Wellness, lifestyle, or soft-brand corporate presentations、Approachable educational materials。
