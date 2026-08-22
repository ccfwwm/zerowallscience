# 优雅线条（25）---木七设计 · ppt模板 / linzi-morandi-ppt-25-b8904aa2

## 风格ID
linzi-morandi-ppt-25-b8904aa2

## 风格名称
优雅线条（25）---木七设计 · ppt模板 / linzi-morandi-ppt-25-b8904aa2

## 风格描述
An elegant, artistic presentation template utilizing a Morandi color palette, featuring organic painted background shapes and semi-transparent content panels.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Deep crimson, mustard yellow, and slate blue act as heavy accent masses; light sand/beige acts as a neutralizing, semi-transparent overlay; white and dark slate used for text.
- fonts: Clean, modern, high-contrast sans-serif. Oversized bold weights for hero text; standard weights for body copy.
- spacing: Generous outer margins showing 10-15% of the background bleed. Content within the translucent panels uses structured, equidistant grid padding.
- shape_language: A strong contrast between sharp geometric rectangles (panels, text blocks, isometric shapes) and fluid, organic blobs (background).
- texture: Heavy acrylic/canvas brushstroke textures strictly limited to the background layer, contrasted with completely flat, matte foreground elements.
- grid: Modular 12-column system, predominantly utilizing 3-column and 4-column subdivisions within the central content container.
- motion_or_depth: Depth is achieved through the 'frosted glass' layering of the semi-transparent sand panel over the vibrant background, and through isometric stacking in diagrams.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（25）---木七设计 · ppt模板 / linzi-morandi-ppt-25-b8904aa2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, artistic presentation template utilizing a Morandi color palette, featuring organic painted background shapes and semi-transparent content panels.
- 推荐配色：#661917、#d5a11a、#31464f、#d9d2c8、#ffffff

【不可丢失的风格锚点】
- Oversized, organic brush-stroke background shapes
- Semi-transparent, sharp-edged rectangular content containers
- High-contrast Morandi color palette (burgundy, mustard, slate, sand)
- Delicate, thin wireframe accent boxes for key numbers or sections
- Layered, isometric geometric forms for diagrams

【字体】
- Use oversized, centered sans-serif for title slides directly on the background.
- Use slate blue/dark grey for body text on the light sand panels.
- Employ oversized numerals as graphic watermarks or column anchors.
- Maintain strict left-alignment for body paragraphs within columns.

【封面页构图】
- Full-bleed painted background with single centered hero text

【内容页构图】
- Translucent container with layered isometric diagram on the left, horizontal labels on the right

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed painted background with single centered hero text","zones":["Full-bleed painted background with single centered hero text"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["hero-text","artistic-bg","centered"],"avoid":["Detailed information","Data display","copying source assets, source text, or an exact source arrangement"],"best_for":["Title page","Dramatic intro"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered section title with off-center, partial wireframe box accent","zones":["Centered section title with off-center, partial wireframe box accent"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["wireframe-accent","section-divider","minimal"],"avoid":["Text heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transition","Chapter marker"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Translucent container with layered isometric diagram on the left, horizontal labels on the right","zones":["Translucent container with layered isometric diagram on the left, horizontal labels on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["isometric-diagram","layers","translucent-panel"],"avoid":["Large continuous text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Architecture overview","Process layers","Tech stack"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Translucent container with four identical columns consisting of a square image over centered text","zones":["Translucent container with four identical columns consisting of a square image over centered text"],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["4-column","image-grid","gallery"],"avoid":["Complex data","Narrative paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Team members","Product features","Gallery"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img-1","purpose":"feature highlight","bbox":[0.09,0.31,0.17,0.28],"priority":1},{"id":"img-2","purpose":"feature highlight","bbox":[0.31,0.31,0.17,0.28],"priority":2},{"id":"img-3","purpose":"feature highlight","bbox":[0.52,0.31,0.17,0.28],"priority":3},{"id":"img-4","purpose":"feature highlight","bbox":[0.73,0.31,0.17,0.28],"priority":4}]}]
- data: [{"id":"data-metrics","composition":"Centered section title with off-center, partial wireframe box accent","zones":["Centered section title with off-center, partial wireframe box accent"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["wireframe-accent","section-divider","minimal"],"avoid":["Text heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transition","Chapter marker"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Translucent container with layered isometric diagram on the left, horizontal labels on the right","zones":["Translucent container with layered isometric diagram on the left, horizontal labels on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["isometric-diagram","layers","translucent-panel"],"avoid":["Large continuous text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Architecture overview","Process layers","Tech stack"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Full-bleed painted background with single centered closing text","zones":["Full-bleed painted background with single centered closing text"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Oversized, organic brush-stroke background shapes","Semi-transparent, sharp-edged rectangular content containers","High-contrast Morandi color palette (burgundy, mustard, slate, sand)"],"optional_variants":["bookend","centered","hero-text"],"avoid":["Contact info details (unless added below center)","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Q&A transition"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be cropped to strict, unbordered rectangles or squares.
- Place images exclusively within the translucent content boundaries to prevent clashing with background art.
- Use subtle, muted, or vintage-toned photography to match the Morandi palette.

【图标与装饰】
- Minimal literal iconography.
- Rely on geometric accents like thin line markers, connecting dots, or solid accent rectangles instead of standard icons.

【数据页构图】
- Centered section title with off-center, partial wireframe box accent

【图表风格】
- Avoid standard flat charts.
- Represent layered concepts using isometric diamond stacks colored with the primary palette.
- Use thin, horizontal structural lines connecting isometric layers to external text labels.

【章节页构图】
- Centered section title with off-center, partial wireframe box accent

【收尾页构图】
- Full-bleed painted background with single centered closing text

【禁止】
- Do not place small or medium body text directly on the textured background.
- Avoid drop shadows on text or images, maintaining the flat layering effect.
- Do not use brightly colored, modern vector illustrations; they clash with the painterly aesthetic.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios、Boutique brand proposals、Creative agency overviews、Historical or timeline-focused narratives。
