# 优雅线条（36）---木七设计 · ppt模板 / linzi-morandi-ppt-36-64ba41bf

## 风格ID
linzi-morandi-ppt-36-64ba41bf

## 风格名称
优雅线条（36）---木七设计 · ppt模板 / linzi-morandi-ppt-36-64ba41bf

## 风格描述
Minimalist Morandi-themed presentation featuring organic fluid shapes, delicate intersecting lines, and centered, airy layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Warm off-white background, dark slate text, with dark blue, muted blue-gray, and dusty beige for vector accents.
- fonts: Handwritten or relaxed sans-serif for display headings, clean geometric sans-serif for body copy.
- spacing: Wide margins, generous line height, and expansive padding between horizontal layout columns.
- shape_language: Amorphous fluid blobs, thin sweeping lines, and perfect circles for data nodes.
- texture: Completely flat vector design with no gradients or drop shadows.
- grid: Primarily centered 1-column layouts, paired with symmetrically distributed 3-column and 4-column horizontal rows.
- motion_or_depth: Flat 2D layer stacking; background curves sit beneath background blobs, all underneath the text layer.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（36）---木七设计 · ppt模板 / linzi-morandi-ppt-36-64ba41bf」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist Morandi-themed presentation featuring organic fluid shapes, delicate intersecting lines, and centered, airy layouts.
- 推荐配色：#F2F0EC、#4F5C6A、#A3AEBD、#E3D5CD、#4A4543

【不可丢失的风格锚点】
- Organic, asymmetrical fluid blobs framing the canvas edges
- Delicate, smooth bezier curves intersecting the background
- Muted, low-saturation Morandi color palette
- Airy, centered content blocks with generous white space

【字体】
- Headings use a relaxed, handwritten-style font to complement the organic theme.
- Body text uses a highly legible, small-sized geometric sans-serif.
- Text alignment is predominantly centered, creating a formal but soft symmetry.

【封面页构图】
- Centered title cluster framed by large organic corner shapes and overlapping sweeping lines

【内容页构图】
- Four-column horizontal layout featuring circular icons connected by fine dropping lines to text blocks below

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title cluster framed by large organic corner shapes and overlapping sweeping lines","zones":["Centered title cluster framed by large organic corner shapes and overlapping sweeping lines"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["symmetrical-text","organic-frame","minimal"],"avoid":["Data visualization","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned dominant numeral and title centered in the canvas, framed by soft edge blobs","zones":["Left-aligned dominant numeral and title centered in the canvas, framed by soft edge blobs"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["numeral-focus","typographic-hierarchy","minimal"],"avoid":["Dense text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter introductions","Quote highlights"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four-column horizontal layout featuring circular icons connected by fine dropping lines to text blocks below","zones":["Four-column horizontal layout featuring circular icons connected by fine dropping lines to text blocks below"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["4-column","icon-process","connector-lines"],"avoid":["Heavy statistical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Feature highlights","Timelines"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"content-comparison","composition":"Split asymmetric layout with a vertical list of numbered circles on the left and a larger summary paragraph on the right","zones":["Split asymmetric layout with a vertical list of numbered circles on the left and a larger summary paragraph on the right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["split-layout","vertical-list","text-heavy"],"avoid":["Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Action plans","Core objectives"],"evidence_pages":["page-08"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Top centered title with a horizontal rule, above three evenly spaced circular nodes with percentage values","zones":["Top centered title with a horizontal rule, above three evenly spaced circular nodes with percentage values"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["3-column","metric-nodes","centered-layout"],"avoid":["Complex tables","Long-form paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key performance indicators (KPIs)","Three-step summaries"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned dominant numeral and title centered in the canvas, framed by soft edge blobs","zones":["Left-aligned dominant numeral and title centered in the canvas, framed by soft edge blobs"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["numeral-focus","typographic-hierarchy","minimal"],"avoid":["Dense text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter introductions","Quote highlights"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Symmetrical centered content block framed by large organic corner shapes, identical to the cover structure","zones":["Symmetrical centered content block framed by large organic corner shapes, identical to the cover structure"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, asymmetrical fluid blobs framing the canvas edges","Delicate, smooth bezier curves intersecting the background","Muted, low-saturation Morandi color palette"],"optional_variants":["symmetrical","bookend","minimal"],"avoid":["New information","Data summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- No photographic elements are used; relies purely on abstract vector framing.

【图标与装饰】
- Icons are minimalist, white line-art centered perfectly inside dark or muted circular nodes.

【数据页构图】
- Top centered title with a horizontal rule, above three evenly spaced circular nodes with percentage values

【图表风格】
- Charts are exceptionally simplified flat bars without axes, utilizing the core 3-color palette.

【章节页构图】
- Left-aligned dominant numeral and title centered in the canvas, framed by soft edge blobs

【收尾页构图】
- Symmetrical centered content block framed by large organic corner shapes, identical to the cover structure

【禁止】
- Avoid sharp geometric framing (squares, sharp angles) which breaks the organic aesthetic.
- Avoid high-contrast, saturated primary colors.
- Do not clutter the edges; leave the organic fluid shapes visible.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency profiles or portfolios、Wellness, beauty, or lifestyle brand guidelines、Minimalist internal company reviews、Soft-skills training presentations。
