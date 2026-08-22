# 优雅线条（55）---木七设计 · ppt模板 / linzi-morandi-ppt-55-adc03a9c

## 风格ID
linzi-morandi-ppt-55-adc03a9c

## 风格名称
优雅线条（55）---木七设计 · ppt模板 / linzi-morandi-ppt-55-adc03a9c

## 风格描述
An elegant, artistic presentation template featuring a muted Morandi pastel palette, organic brush-textured frames, and soft rounded geometries.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white background (#F8F6F4) with muted purple (#7F7D9E) as the primary text and accent color. Slate blue, soft peach, and dusty rose serve as secondary accents.
- fonts: Stylized, slightly stencil or handwriting-inspired sans-serif for display titles; clean, rounded sans-serif for body copy.
- spacing: Generous negative space, particularly around centered title clusters. Edge margins are intentionally encroached upon by decorative brush shapes.
- shape_language: A mix of organic (brush textures) and soft geometry (perfect circles, rounded rectangles, pill badges).
- texture: Distressed, dry-brush edges on decorative background shapes; flat matte surfaces for functional cards.
- grid: Predominantly center-aligned for covers/sections, shifting to structured 3- or 4-column horizontal splits and distinct vertical panel splits for content.
- motion_or_depth: Mostly flat design. Depth is implied through subtle overlapping of solid color panels and image containers rather than drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（55）---木七设计 · ppt模板 / linzi-morandi-ppt-55-adc03a9c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, artistic presentation template featuring a muted Morandi pastel palette, organic brush-textured frames, and soft rounded geometries.
- 推荐配色：#F8F6F4、#7F7D9E、#87939E、#F1C9B7、#D8A6A4

【不可丢失的风格锚点】
- Muted Morandi pastel color scheme
- Organic, distressed brush-stroke circles acting as corner/edge framing
- Extensive use of soft rounded corners and pill shapes
- Floating geometric elements without harsh borders

【字体】
- Use stylized, spaced-out sans-serif or stencil fonts for primary English headers to enhance the artistic vibe.
- Titles should prominently use the primary dark muted purple.
- Center-align title text on covers and section breaks, using pill-shaped badges for metadata.
- Keep body text clean, small, and highly legible, avoiding the decorative fonts used in titles.

【封面页构图】
- Center-aligned title cluster framed by organic brush shapes in corners

【内容页构图】
- Staggered horizontal progression of rounded squares connected by a line

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned title cluster framed by organic brush shapes in corners","zones":["Center-aligned title cluster framed by organic brush shapes in corners"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["centered","organic-frame","minimal"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Opening sequence"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Center-aligned section title with corner brush accents and a central pill badge","zones":["Center-aligned section title with corner brush accents and a central pill badge"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["centered","transition","organic-frame"],"avoid":["Dense lists","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Staggered horizontal progression of rounded squares connected by a line","zones":["Staggered horizontal progression of rounded squares connected by a line"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["timeline","staggered","process"],"avoid":["Independent, non-sequential lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Timelines","Sequential flows"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"content-comparison","composition":"Top-left image, right text, overlaid by a full-width bottom color band with columns","zones":["Top-left image, right text, overlaid by a full-width bottom color band with columns"],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["split-layout","overlay-banner","multi-column"],"avoid":["Single-focus metrics","Quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Company overview","Service descriptions","Categorized details"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"top-left-image","purpose":"Atmospheric or contextual photo","bbox":[0.0,0.0,0.38,0.55],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four-column vertical card layout with overlapping circular icons","zones":["Four-column vertical card layout with overlapping circular icons"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["4-column","cards","metrics"],"avoid":["Long sequential processes","Heavy text paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Feature highlights","Team members"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Center-aligned section title with corner brush accents and a central pill badge","zones":["Center-aligned section title with corner brush accents and a central pill badge"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["centered","transition","organic-frame"],"avoid":["Dense lists","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Left side image paired with a right side solid block containing quote marks","zones":["Left side image paired with a right side solid block containing quote marks"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["quote","image-text-split","bold-graphic"],"avoid":["Complex data","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key takeaways","Mission statements"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"left-showcase-image","purpose":"Visual subject or abstract background for quote","bbox":[0.05,0.25,0.55,0.6],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Center-aligned closing cluster framed by organic brush shapes","zones":["Center-aligned closing cluster framed by organic brush shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted Morandi pastel color scheme","Organic, distressed brush-stroke circles acting as corner/edge framing","Extensive use of soft rounded corners and pill shapes"],"optional_variants":["centered","bookend","organic-frame"],"avoid":["New content introduction","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be unbordered and mostly rectangular.
- Use images that match the soft, low-contrast, warm tone of the palette.
- Images often intersect with solid color cards or are partially overlaid by text panels.

【图标与装饰】
- Icons should be minimal, white, line or flat-fill style, placed inside colored circular nodes.
- Ensure icons maintain a consistent stroke weight and scale across all diagrams.

【数据页构图】
- Four-column vertical card layout with overlapping circular icons

【图表风格】
- Rely on abstract shapes (like overlapping circles or curved arrows) rather than traditional data charts for qualitative steps.
- Data points are highlighted using prominent typography combined with simple percentage figures.

【章节页构图】
- Center-aligned section title with corner brush accents and a central pill badge

【收尾页构图】
- Center-aligned closing cluster framed by organic brush shapes

【禁止】
- Avoid harsh, high-saturation colors that break the Morandi aesthetic.
- Do not use sharp right angles for content cards; always use soft or fully rounded corners.
- Avoid heavy drop shadows or 3D bevel effects; maintain a flat, matte appearance.
- Do not clutter the edges; leave room for the organic brush-stroke framing.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios or creative agency pitches、Lifestyle, wellness, or cosmetic brand decks、Mid-year or annual reviews requiring a soft, approachable tone、Feminine or elegant product showcases。
