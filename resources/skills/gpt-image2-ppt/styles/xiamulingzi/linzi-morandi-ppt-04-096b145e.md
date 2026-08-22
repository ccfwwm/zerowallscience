# 优雅线条（04）---木七设计 · ppt模板 / linzi-morandi-ppt-04-096b145e

## 风格ID
linzi-morandi-ppt-04-096b145e

## 风格名称
优雅线条（04）---木七设计 · ppt模板 / linzi-morandi-ppt-04-096b145e

## 风格描述
Elegant Morandi-style presentation featuring muted earthy tones, organic botanical line art, and minimalist layouts for professional or creative business reports.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light beige background, dark brown primary text, with camel, slate blue, and rust accents used for shapes and emphasis.
- fonts: Elegant serif/calligraphic font for primary titles, clean sans-serif for body copy and data.
- spacing: Generous margins, central focal points with decorative framing confined to slide perimeters.
- shape_language: Rounded rectangles, circular arcs, organic blobs, and thin line illustrations.
- texture: Flat vector style with subtle directional drop shadows on primary content cards.
- grid: Modular 2-column and 3-column grids centered on the slide canvas.
- motion_or_depth: Mostly flat with moderate depth introduced via solid, offset drop shadows on shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（04）---木七设计 · ppt模板 / linzi-morandi-ppt-04-096b145e」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant Morandi-style presentation featuring muted earthy tones, organic botanical line art, and minimalist layouts for professional or creative business reports.
- 推荐配色：#EBE5DE、#4E3E34、#C69C7B、#5C768D、#8F644A

【不可丢失的风格锚点】
- Muted Morandi color palette
- Abstract botanical continuous line art in corners
- Organic overlapping background blobs
- Rounded geometry with soft drop shadows

【字体】
- Use elegant serif or calligraphic fonts for main titles to convey sophistication.
- Pair with highly legible sans-serif fonts for body text and data points.
- Maintain high contrast by using dark brown text on the light beige background.

【封面页构图】
- Centered title block framed by asymmetric organic shapes and botanical line art in the corners.

【内容页构图】
- Split layout with top text section and bottom grid containing a prominent image and additional text/graphic cards.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title block framed by asymmetric organic shapes and botanical line art in the corners.","zones":["Centered title block framed by asymmetric organic shapes and botanical line art in the corners."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["morandi-cover","botanical-frame","elegant-title"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Presentation openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned section number and title, right-heavy organic graphic composition.","zones":["Left-aligned section number and title, right-heavy organic graphic composition."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["section-break","asymmetric-balance","left-aligned"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout with top text section and bottom grid containing a prominent image and additional text/graphic cards.","zones":["Split layout with top text section and bottom grid containing a prominent image and additional text/graphic cards."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["image-grid","split-layout","card-trio"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Highlighting key features with visuals","Mixed media content"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main_visual","purpose":"Conceptual photo related to the content","bbox":[0.1,0.45,0.55,0.45],"priority":1}]},{"id":"content-comparison","composition":"Three prominent circular icons with thick, partial-arc borders, arranged horizontally.","zones":["Three prominent circular icons with thick, partial-arc borders, arranged horizontally."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["three-columns","circular-indicators","feature-list"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Service pillars","Three-step processes"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Central bar chart with stylized flat bars in distinct palette colors, flanked by right-aligned text blocks.","zones":["Central bar chart with stylized flat bars in distinct palette colors, flanked by right-aligned text blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["bar-chart","data-visualization","minimal-chart"],"avoid":["Complex multi-axis line graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Performance metrics","Comparative data","Survey results"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned section number and title, right-heavy organic graphic composition.","zones":["Left-aligned section number and title, right-heavy organic graphic composition."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["section-break","asymmetric-balance","left-aligned"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing text framed identically to the cover slide.","zones":["Centered closing text framed identically to the cover slide."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted Morandi color palette","Abstract botanical continuous line art in corners","Organic overlapping background blobs"],"optional_variants":["closing-slide","thank-you","botanical-frame"],"avoid":["Summary lists","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Crop images into rounded rectangles.
- Rotate or stagger images to create dynamic, overlapping compositions.
- Apply soft drop shadows to image containers to lift them from the flat background.

【图标与装饰】
- Use flat, minimalist white icons inside colored container shapes.
- Enclose icons in circles or rotated rounded squares (diamonds).
- Ensure icons are simple and universally recognizable without intricate details.

【数据页构图】
- Central bar chart with stylized flat bars in distinct palette colors, flanked by right-aligned text blocks.

【图表风格】
- Remove standard axes and grid lines for a cleaner, minimalist aesthetic.
- Color-code data series using the template's core accent colors (brown, slate, camel).
- Use flat, untextured geometric bars or sections for data representation.

【章节页构图】
- Left-aligned section number and title, right-heavy organic graphic composition.

【收尾页构图】
- Centered closing text framed identically to the cover slide.

【禁止】
- Avoid harsh primary colors that break the muted Morandi palette.
- Do not use complex 3D effects or heavy gradients.
- Avoid cluttered layouts; maintain the signature negative space.
- Do not place text directly over complex organic background shapes without a container.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Fashion or lifestyle brand proposals、Minimalist corporate annual reports、Event planning pitches。
