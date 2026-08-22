# 38 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-38-785a786b

## 风格ID
linzi-morandi-2-21-ppt-ppt-38-785a786b

## 风格名称
38 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-38-785a786b

## 风格描述
Minimalist template featuring fluid organic vector backgrounds, muted earthy tones, and asymmetrical geometric content framing.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light beige backgrounds with slate, sage, terracotta, and ochre accents used for hierarchy and bounding boxes.
- fonts: Clean, light sans-serif typography for both headers and body. Dark slate for primary text, lighter muted tones for secondary.
- spacing: Wide, breathable margins with content often contained within rounded white card overlays to separate from the busy backgrounds.
- shape_language: A strict dichotomy: fluid/organic (backgrounds/decorations) vs. rigid/geometric (image masks/cards).
- texture: Flat vector colors with no gradients or drop shadows.
- grid: Modular and asymmetrical, often splitting the slide into uneven vertical columns.
- motion_or_depth: Flat design with depth achieved solely through layered overlapping of opaque vector shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「38 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-38-785a786b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist template featuring fluid organic vector backgrounds, muted earthy tones, and asymmetrical geometric content framing.
- 推荐配色：#E6E2D6、#304143、#A2A178、#C98E75、#D1A569

【不可丢失的风格锚点】
- Fluid, abstract vector blobs as continuous background elements.
- Muted, low-saturation earthy color palette.
- Sharp rectangular framing for photos contrasting with organic backgrounds.
- Generous negative space with off-center alignment for content blocks.

【字体】
- Titles are centered or left-aligned, using a light or regular sans-serif weight.
- Subtitles and body text are significantly smaller to create high contrast.
- Key metrics or dates are highlighted using oversized, lighter-colored numerals.

【封面页构图】
- Full-bleed organic abstract shapes with centrally aligned title and subtitle block.

【内容页构图】
- Asymmetrical split with a dynamic masonry-style image grid on the left and typography on the right, capped with a vertical colored band.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed organic abstract shapes with centrally aligned title and subtitle block.","zones":["Full-bleed organic abstract shapes with centrally aligned title and subtitle block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["abstract-background","centered-text"],"avoid":["Data-heavy content","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Oversized section numeral above a centered title, overlaid on an organic abstract background.","zones":["Oversized section numeral above a centered title, overlaid on an organic abstract background."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["numbered-section","minimalist"],"avoid":["Detailed content","Image displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter markers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetrical split with a dynamic masonry-style image grid on the left and typography on the right, capped with a vertical colored band.","zones":["Asymmetrical split with a dynamic masonry-style image grid on the left and typography on the right, capped with a vertical colored band."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["image-gallery","asymmetrical-split"],"avoid":["Data charts","Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Moodboards"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"gallery-tall-left","purpose":"vertical feature image","bbox":[0.08,0.32,0.16,0.6],"priority":1},{"id":"gallery-square-top","purpose":"supporting image","bbox":[0.26,0.05,0.16,0.45],"priority":2},{"id":"gallery-tall-bottom","purpose":"supporting image","bbox":[0.26,0.52,0.16,0.45],"priority":3}]},{"id":"content-comparison","composition":"Modular grid integrating solid color blocks, image rectangles, and text/stat zones.","zones":["Modular grid integrating solid color blocks, image rectangles, and text/stat zones."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["bento-grid","mixed-media"],"avoid":["Sequential narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Dashboards","Mixed media highlights","Service overviews"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"center-landscape","purpose":"primary context image","bbox":[0.21,0.31,0.35,0.32],"priority":1},{"id":"bottom-square","purpose":"secondary context image","bbox":[0.34,0.66,0.23,0.3],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Sequential process diagram with circular nodes connected by a continuous curved path, housed in a rounded card.","zones":["Sequential process diagram with circular nodes connected by a continuous curved path, housed in a rounded card."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["curved-timeline","card-layout"],"avoid":["Heavy text paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Step-by-step processes"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Oversized section numeral above a centered title, overlaid on an organic abstract background.","zones":["Oversized section numeral above a centered title, overlaid on an organic abstract background."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["numbered-section","minimalist"],"avoid":["Detailed content","Image displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter markers"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Full-bleed organic abstract shapes with centrally aligned text.","zones":["Full-bleed organic abstract shapes with centrally aligned text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, abstract vector blobs as continuous background elements.","Muted, low-saturation earthy color palette.","Sharp rectangular framing for photos contrasting with organic backgrounds."],"optional_variants":["closing","abstract-background"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are strictly masked into sharp rectangular or square containers.
- Images are used as structural blocks in asymmetrical grids, completely filling their frames.

【图标与装饰】
- Minimal use of thin, white line icons, often placed over solid colored blocks for high contrast.

【数据页构图】
- Sequential process diagram with circular nodes connected by a continuous curved path, housed in a rounded card.

【图表风格】
- Diagrams use flat circular or rectangular nodes connected by thin, unembellished gray lines.
- Nodes utilize alternating palette colors to separate categories.

【章节页构图】
- Oversized section numeral above a centered title, overlaid on an organic abstract background.

【收尾页构图】
- Full-bleed organic abstract shapes with centrally aligned text.

【禁止】
- Avoid overlapping large title characters with subtitle text blocks.
- Do not use drop shadows or 3D effects; maintain strict flat layering.
- Avoid highly saturated colors that break the muted palette.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolio presentations.、Minimalist marketing or brand guidelines.、Design or lifestyle product pitches.。
