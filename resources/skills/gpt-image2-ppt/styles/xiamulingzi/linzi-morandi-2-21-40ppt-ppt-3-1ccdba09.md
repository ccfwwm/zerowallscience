# 莫兰迪风尚 (3) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-3-1ccdba09

## 风格ID
linzi-morandi-2-21-40ppt-ppt-3-1ccdba09

## 风格名称
莫兰迪风尚 (3) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-3-1ccdba09

## 风格描述
Minimalist Morandi-themed template featuring fluid organic shapes, muted color tones, and ample whitespace suitable for elegant corporate or lifestyle presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary dark slate for text and major blobs; secondary soft grey-blue for background shapes; terracotta as an accent for lines and active data elements.
- fonts: Elegant serif for primary headings to convey sophistication, paired with clean geometric sans-serif for body copy and data labels.
- spacing: Generous, breathable margins with content heavily centralized or strictly halved to respect the organic corner framing.
- shape_language: Soft, fluid, ungeometric curves. Perfectly circular accents used for charts and badges.
- texture: Flat vector color fields with no gradients, shadows, or 3D effects, maintaining a clean modern look.
- grid: Implicit 2-column or 1-column layouts, often dynamically offset by the asymmetric background shapes.
- motion_or_depth: Strictly flat layering. Depth is implied only by the gentle overlapping of solid-colored organic shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (3) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-3-1ccdba09」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist Morandi-themed template featuring fluid organic shapes, muted color tones, and ample whitespace suitable for elegant corporate or lifestyle presentations.
- 推荐配色：#4B5A67、#C1C8D4、#D9A28C、#FFFFFF

【不可丢失的风格锚点】
- Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta
- Fluid, asymmetric organic blobs framing the slide corners
- Intersecting fine curved strokes adding delicate linework
- High whitespace, airy and minimalist composition

【字体】
- Headings are centered on covers/closings and left-aligned on content/section slides
- Subtitles and English pairings are rendered in smaller sans-serif for contrast
- Body text is kept relatively small to preserve whitespace

【封面页构图】
- Centered title and subtitle heavily framed by large organic corner shapes top-left and bottom-right

【内容页构图】
- Split layout with dense text on the left (including a highlighted block) and a large device mockup on the right with an overlapping circular badge

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle heavily framed by large organic corner shapes top-left and bottom-right","zones":["Centered title and subtitle heavily framed by large organic corner shapes top-left and bottom-right"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["minimalist-cover","organic-frame"],"avoid":["Detailed text","Heavy data","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Main thematic introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge","zones":["Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["section-divider","asymmetric-layout"],"avoid":["Long form content","Multiple images","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout with dense text on the left (including a highlighted block) and a large device mockup on the right with an overlapping circular badge","zones":["Split layout with dense text on the left (including a highlighted block) and a large device mockup on the right with an overlapping circular badge"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["device-mockup","split-content"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Digital service introductions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"laptop_screen","purpose":"Device screen content","bbox":[0.5,0.31,0.37,0.51],"priority":1}]},{"id":"content-comparison","composition":"Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge","zones":["Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["section-divider","asymmetric-layout"],"avoid":["Long form content","Multiple images","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Three horizontal rows of pictogram arrays representing percentages, with explanatory text on the right","zones":["Three horizontal rows of pictogram arrays representing percentages, with explanatory text on the right"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["pictogram-chart","unit-chart","infographic"],"avoid":["Continuous data trends (line charts)","Complex financial data","copying source assets, source text, or an exact source arrangement"],"best_for":["Survey results","Demographic breakdowns","Progress tracking"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge","zones":["Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["section-divider","asymmetric-layout"],"avoid":["Long form content","Multiple images","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing text identically framed by the presentation's cover organic shapes","zones":["Centered closing text identically framed by the presentation's cover organic shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted 'Morandi' color scheme with slate, soft grey-blue, and terracotta","Fluid, asymmetric organic blobs framing the slide corners","Intersecting fine curved strokes adding delicate linework"],"optional_variants":["closing","bookend-layout"],"avoid":["Contact detail lists","Summary bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Final call to action"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are embedded within device mockups for digital context
- Standard rectangular crops with no borders arranged in asymmetrical masonry grids for portfolios
- Overlapping circular badges used as callouts on imagery

【图标与装饰】
- Minimalist line-art pictograms used in repetitive arrays for unit charts
- Two-tone filled vs. outlined states used to represent data percentages

【数据页构图】
- Three horizontal rows of pictogram arrays representing percentages, with explanatory text on the right

【图表风格】
- Flat, minimalist donut charts using the template's primary slate and secondary soft blue
- Pictogram arrays (e.g., hourglasses) serving as highly visual unit charts
- No axis lines, gridlines, or heavy legends; data is presented directly with large typography

【章节页构图】
- Left-aligned section title text with bullet accents, balanced by a massive organic fluid shape dominating the right edge

【收尾页构图】
- Centered closing text identically framed by the presentation's cover organic shapes

【禁止】
- Avoid harsh, saturated, or neon colors that break the muted Morandi theme
- Do not clutter the center of the slide; respect the negative space created by the corner framing
- Avoid sharp, rigid geometric background shapes (like triangles or sharp rectangles)
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Lifestyle, fashion, or interior design pitches、Elegant corporate summaries、Artistic or cultural project proposals。
