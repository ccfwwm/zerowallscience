# 83 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-83-614c5106

## 风格ID
linzi-morandi-2-21-ppt-ppt-83-614c5106

## 风格名称
83 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-83-614c5106

## 风格描述
Minimalist, elegant presentation utilizing a strict nested diamond motif and a muted Morandi pastel color palette.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds with dark grey typography for contrast; soft dusty blues, pinks, and greys used as structural accents and shape fills.
- fonts: Elegant serif typeface for primary headings to establish an editorial feel; clean sans-serif for body copy and data labels.
- spacing: Generous and airy, with a focus on symmetrical balance and central alignment.
- shape_language: Exclusively sharp-angled polygons, specifically rhombuses (diamonds) and triangles. No rounded corners.
- texture: Completely flat and matte. No gradients, shadows, or 3D effects.
- grid: Strong central vertical axis for process slides; symmetrical horizontal distribution for lists and agendas.
- motion_or_depth: Flat overlap; nested outlined shapes create a subtle framing effect without implied 3D depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「83 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-83-614c5106」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist, elegant presentation utilizing a strict nested diamond motif and a muted Morandi pastel color palette.
- 推荐配色：#7989A5、#BAC6D8、#F1C9CC、#E6E7E9、#5A5E65

【不可丢失的风格锚点】
- Nested rhombus/diamond shape configurations
- Muted Morandi pastel color palette
- Interlocking geometric border patterns
- Mix of solid shape fills and thin wireframe outlines
- Strict 45-degree angled geometry

【字体】
- Titles use a prominent serif font, typically centered or left-aligned with ample breathing room.
- Subtitles and body text use a lighter sans-serif font, often formatted in smaller, tracked-out block paragraphs.
- Numbers and data labels are integrated directly into geometric nodes.

【封面页构图】
- Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned title and subtitle.

【内容页构图】
- Four evenly spaced vertical columns, each topped with a nested diamond icon node, followed by a title and body text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned title and subtitle.","zones":["Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned title and subtitle."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["geometric-border","centered-text","minimal"],"avoid":["Data-heavy content","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned closing text.","zones":["Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned closing text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["geometric-border","centered-text","bookend"],"avoid":["Body content","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four evenly spaced vertical columns, each topped with a nested diamond icon node, followed by a title and body text.","zones":["Four evenly spaced vertical columns, each topped with a nested diamond icon node, followed by a title and body text."],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["4-column","icon-grid","parallel-content"],"avoid":["Sequential timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Core values","Service offerings"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"content-comparison","composition":"Vertical timeline with a central axis line; diamond nodes are placed along the axis with text alternating left and right.","zones":["Vertical timeline with a central axis line; diamond nodes are placed along the axis with text alternating left and right."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["vertical-timeline","alternating-layout","process"],"avoid":["Unrelated bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Milestones"],"evidence_pages":["page-05"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Left half contains stacked text items with icon nodes; right half contains hanging vertical lines terminating in diamond shapes (faux bar chart).","zones":["Left half contains stacked text items with icon nodes; right half contains hanging vertical lines terminating in diamond shapes (faux bar chart)."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["split-layout","abstract-chart","hanging-nodes"],"avoid":["Precise numerical reporting","copying source assets, source text, or an exact source arrangement"],"best_for":["Abstract data visualization","Comparative metrics","Key performance indicators"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Horizontal array of four nested diamond shapes, with one shape significantly larger to indicate focus.","zones":["Horizontal array of four nested diamond shapes, with one shape significantly larger to indicate focus."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["horizontal-layout","scale-emphasis","nested-shapes"],"avoid":["Long text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Section highlights","Step indicators"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Horizontal array of four nested diamond shapes, with one shape significantly larger to indicate focus.","zones":["Horizontal array of four nested diamond shapes, with one shape significantly larger to indicate focus."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["horizontal-layout","scale-emphasis","nested-shapes"],"avoid":["Long text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Section highlights","Step indicators"],"evidence_pages":["page-02"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned closing text.","zones":["Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned closing text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Nested rhombus/diamond shape configurations","Muted Morandi pastel color palette","Interlocking geometric border patterns"],"optional_variants":["geometric-border","centered-text","bookend"],"avoid":["Body content","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-01"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Template relies primarily on vector geometry rather than photography.
- If used, images should be masked into sharp diamond or triangular polygons to maintain the shape language.

【图标与装饰】
- Icons are monochromatic (white) and centrally embedded within solid-colored diamond nodes.
- Icon style is simple, flat, and symbolic.

【数据页构图】
- Left half contains stacked text items with icon nodes; right half contains hanging vertical lines terminating in diamond shapes (faux bar chart).

【图表风格】
- Data visualization is highly abstracted, using vertical lines and diamond nodes instead of standard bar or line charts.
- Axes and baselines are represented by thin, muted lines or dashed strokes.

【章节页构图】
- Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned closing text.

【收尾页构图】
- Symmetrical top and bottom borders formed by interlocking triangles; centrally aligned closing text.

【禁止】
- Avoid rounded corners or circles, as they break the strict angular geometry.
- Avoid highly saturated or neon colors; stick to the muted Morandi palette.
- Avoid heavy drop shadows or 3D effects; maintain a flat, editorial look.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Editorial lookbooks、Boutique agency pitches、Minimalist project planning、Design or fashion portfolios、Elegant corporate summaries。
