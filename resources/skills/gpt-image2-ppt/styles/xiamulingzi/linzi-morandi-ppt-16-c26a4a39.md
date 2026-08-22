# 优雅线条（16）---木七设计 · ppt模板 / linzi-morandi-ppt-16-c26a4a39

## 风格ID
linzi-morandi-ppt-16-c26a4a39

## 风格名称
优雅线条（16）---木七设计 · ppt模板 / linzi-morandi-ppt-16-c26a4a39

## 风格描述
An elegant, organic presentation style featuring soft watercolor washes, paper textures, and minimalist botanical line art.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white paper texture as base, soft green/teal watercolor washes for structural framing, dark forest green for primary text and high-contrast shapes, muted slate green for secondary data.
- fonts: Elegant modern serif (e.g., Playfair Display) for primary headings; legible sans-serif for dense body copy.
- spacing: Generous organic margins defined by watercolor edges, typically keeping content concentrated in the lower right or center.
- shape_language: Fluid organic blobs for backgrounds; soft rounded rectangles (16-24px radius) for image masks; overlapping perfect circles for data points.
- texture: Heavy watercolor paper grain applied globally to the background.
- grid: Loose, asymmetrical grid dictated by organic background framing elements.
- motion_or_depth: Flat layered depth; watercolor blends into the paper, images float cleanly on top with minimal or no shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（16）---木七设计 · ppt模板 / linzi-morandi-ppt-16-c26a4a39」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, organic presentation style featuring soft watercolor washes, paper textures, and minimalist botanical line art.
- 推荐配色：#f2f4f1、#b8d9c2、#264b48、#82aba2、#eaf1ec

【不可丢失的风格锚点】
- Textured paper background canvas
- Fluid watercolor washes masking the top and left corners
- Botanical line art accents in dark teal
- High-contrast serif typography for large headers
- Overlapping translucent geometric elements

【字体】
- Headings use large, high-contrast serif fonts, often angled or oversized for editorial impact
- Body copy is kept small, breathable, and aligned to invisible bounding boxes
- Numbers and section markers are highly prominent and stylized

【封面页构图】
- Centered prominent serif title with a delicate subtitle, framed by organic watercolor washes and a botanical line-art leaf.

【内容页构图】
- Split asymmetric layout featuring a wide background-style banner top-left and an overlapping framed image right, with tiered body text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered prominent serif title with a delicate subtitle, framed by organic watercolor washes and a botanical line-art leaf.","zones":["Centered prominent serif title with a delicate subtitle, framed by organic watercolor washes and a botanical line-art leaf."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["centered","minimal","organic-frame"],"avoid":["Heavy data","Multiple images","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Minimalist opening"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Oversized, slightly angled serif numeral acting as a graphic element on the left, with title and subtitle clustered below center.","zones":["Oversized, slightly angled serif numeral acting as a graphic element on the left, with title and subtitle clustered below center."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["angled-text","section-divider","typographic-focus"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split asymmetric layout featuring a wide background-style banner top-left and an overlapping framed image right, with tiered body text.","zones":["Split asymmetric layout featuring a wide background-style banner top-left and an overlapping framed image right, with tiered body text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["overlapping-images","numbered-list","asymmetric"],"avoid":["Full-screen charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Feature highlights with context"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"top-banner","purpose":"Atmospheric wide background image","bbox":[0.1,0.15,0.75,0.35],"priority":2},{"id":"feature-image","purpose":"Primary subject photograph","bbox":[0.6,0.25,0.3,0.4],"priority":1}]},{"id":"content-comparison","composition":"Two-column layout with a tall soft-rounded rectangular image on the left and a dedicated text block on the right.","zones":["Two-column layout with a tall soft-rounded rectangular image on the left and a dedicated text block on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["image-left","text-right","rounded-image"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Product feature","Quote alongside image","Key takeaway"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"tall-feature","purpose":"Tall lifestyle or product image","bbox":[0.12,0.18,0.24,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Horizontal process/timeline composed of overlapping, differently styled circles (solid and outlined) with attached text columns.","zones":["Horizontal process/timeline composed of overlapping, differently styled circles (solid and outlined) with attached text columns."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["process","circles","overlapping","timeline"],"avoid":["Long-form text paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Simple timelines","4-step processes","Sequential statistics"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split asymmetric layout featuring a wide background-style banner top-left and an overlapping framed image right, with tiered body text.","zones":["Split asymmetric layout featuring a wide background-style banner top-left and an overlapping framed image right, with tiered body text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["overlapping-images","numbered-list","asymmetric"],"avoid":["Full-screen charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Feature highlights with context"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"top-banner","purpose":"Atmospheric wide background image","bbox":[0.1,0.15,0.75,0.35],"priority":2},{"id":"feature-image","purpose":"Primary subject photograph","bbox":[0.6,0.25,0.3,0.4],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered large concluding message with subtitle and two horizontal footer details (presenter/date), framed identically to the cover.","zones":["Centered large concluding message with subtitle and two horizontal footer details (presenter/date), framed identically to the cover."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Textured paper background canvas","Fluid watercolor washes masking the top and left corners","Botanical line art accents in dark teal"],"optional_variants":["centered","closing","bookend"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Q&A introduction","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Photographs are masked into soft rounded rectangles
- Images may be enclosed in thick white overlapping frames to separate them from the textured background
- Wide banner images are edge-to-edge but cropped horizontally to maintain white space below

【图标与装饰】
- Minimalist linear icons used sparsely within circular bounds
- Icons share the same dark forest green as the primary text

【数据页构图】
- Horizontal process/timeline composed of overlapping, differently styled circles (solid and outlined) with attached text columns.

【图表风格】
- Data points are expressed through overlapping translucent circles
- Horizontal bar representations use muted, alternating teal/slate tones with icon alignments
- Typography inside charts remains clean and avoids heavy bolding

【章节页构图】
- Oversized, slightly angled serif numeral acting as a graphic element on the left, with title and subtitle clustered below center.

【收尾页构图】
- Centered large concluding message with subtitle and two horizontal footer details (presenter/date), framed identically to the cover.

【禁止】
- Avoid harsh sharp corners on image masks
- Avoid heavy drop shadows or 3D effects
- Avoid vivid, saturated primary colors that break the calm, muted Morandi palette
- Avoid rigid symmetrical grids that fight the organic background
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Wellness and lifestyle brand pitches、Lookbooks and editorial portfolios、Calm, aesthetic corporate introductions、Organic product marketing。
