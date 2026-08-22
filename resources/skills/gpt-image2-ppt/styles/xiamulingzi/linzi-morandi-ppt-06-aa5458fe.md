# 优雅线条（06）---木七设计 · ppt模板 / linzi-morandi-ppt-06-aa5458fe

## 风格ID
linzi-morandi-ppt-06-aa5458fe

## 风格名称
优雅线条（06）---木七设计 · ppt模板 / linzi-morandi-ppt-06-aa5458fe

## 风格描述
An elegant, Morandi-toned presentation heavily featuring organic fluid shapes, brushstroke textures, and clean minimalist typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Slate blue (#66727E) for primary text and chart fills; soft grey (#969595) for secondary text and background elements; beige/gold (#CAB292) for accents and borders.
- fonts: Elegant, geometric sans-serif for primary headings; clean, readable sans-serif for body copy. Ample line height for an airy feel.
- spacing: Generous margins, particularly on white-background content slides. Elements are spaced widely to maintain a minimalist, uncluttered appearance.
- shape_language: A juxtaposition of rigid geometric frames/charts and highly organic, fluid background blobs.
- texture: Heavy use of abstract textures including terrazzo speckles, dry brush strokes, and subtle foil-like noise in the backgrounds.
- grid: Primarily asymmetric 2-column layouts for text/image, and balanced 2x2 grids for data points.
- motion_or_depth: Mostly flat with subtle depth introduced via overlapping elements (e.g., circular badges overlapping image containers).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（06）---木七设计 · ppt模板 / linzi-morandi-ppt-06-aa5458fe」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, Morandi-toned presentation heavily featuring organic fluid shapes, brushstroke textures, and clean minimalist typography.
- 推荐配色：#969595、#F1F1F1、#66727E、#CAB292、#FFFFFF

【不可丢失的风格锚点】
- Organic, fluid background shapes combined with terrazzo and brushstroke textures
- Thin, double-line rectangular borders in metallic/muted gold tones
- Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige
- High-contrast minimalist vector charts integrated seamlessly into white space

【字体】
- Headings should be slate blue, using a medium weight, with generous tracking.
- Body text should be soft grey to maintain low contrast and a calm aesthetic.
- Use uppercase letters with wide letter-spacing for section numbers and short labels.

【封面页构图】
- Full-bleed organic abstract background with center-left typography block

【内容页构图】
- Text column on left, device mockup container on right with an overlapping circular badge

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed organic abstract background with center-left typography block","zones":["Full-bleed organic abstract background with center-left typography block"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["abstract-cover","fluid-background","left-aligned-text"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Section introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Abstract background bordered by a thin double rectangular frame, text center-left","zones":["Abstract background bordered by a thin double rectangular frame, text center-left"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["framed-section","abstract-background","minimal-text"],"avoid":["Heavy text","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Text column on left, device mockup container on right with an overlapping circular badge","zones":["Text column on left, device mockup container on right with an overlapping circular badge"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["device-mockup","text-image-split","overlapping-badge"],"avoid":["Large datasets","Gallery grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Website/software features","Service descriptions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"mockup-screen","purpose":"Screen content for device mockup","bbox":[0.45,0.25,0.5,0.6],"priority":1}]},{"id":"content-comparison","composition":"Masonry-style image collage in the upper right, text block in the lower left, minimalist bottom-edge graphic","zones":["Masonry-style image collage in the upper right, text block in the lower left, minimalist bottom-edge graphic"],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["image-collage","masonry-grid","bottom-heavy-text"],"avoid":["Data charts","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Mood boards","Portfolio galleries","Team showcases"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"gallery-main","purpose":"Large primary image in collage","bbox":[0.05,0.05,0.4,0.55],"priority":1},{"id":"gallery-top-right","purpose":"Wide top image in collage","bbox":[0.47,0.05,0.48,0.25],"priority":2},{"id":"gallery-bottom-1","purpose":"Small grid image","bbox":[0.47,0.32,0.15,0.28],"priority":3},{"id":"gallery-bottom-2","purpose":"Small grid image","bbox":[0.63,0.32,0.15,0.28],"priority":4},{"id":"gallery-bottom-3","purpose":"Small grid image","bbox":[0.79,0.32,0.16,0.28],"priority":5}]}]
- data: [{"id":"data-metrics","composition":"Three stacked rows of unit charts (pictographs) with right-aligned accompanying text","zones":["Three stacked rows of unit charts (pictographs) with right-aligned accompanying text"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["unit-chart","pictograph","3-row-layout"],"avoid":["Precise data (e.g., 53.2%)","Complex financial charts","copying source assets, source text, or an exact source arrangement"],"best_for":["High-level statistics","Comparison of three metrics","Survey results"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Abstract background bordered by a thin double rectangular frame, text center-left","zones":["Abstract background bordered by a thin double rectangular frame, text center-left"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["framed-section","abstract-background","minimal-text"],"avoid":["Heavy text","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Full-bleed organic abstract background with center-left typography block","zones":["Full-bleed organic abstract background with center-left typography block"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, fluid background shapes combined with terrazzo and brushstroke textures","Thin, double-line rectangular borders in metallic/muted gold tones","Muted 'Morandi' color scheme relying on soft greys, slate blues, and beige"],"optional_variants":["closing","abstract-background","bookend-design"],"avoid":["Content presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Contact info","Thank you slides"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be constrained within sharp rectangular frames or device mockups.
- Maintain a cool or desaturated filter on photographs to match the Morandi palette.

【图标与装饰】
- Use solid, monochromatic silhouettes for pictographs (e.g., hourglasses).
- Icons should match the slate blue and soft grey palette, using opacity to differentiate active vs. inactive states.

【数据页构图】
- Three stacked rows of unit charts (pictographs) with right-aligned accompanying text

【图表风格】
- Use minimalist donut charts with two-tone fills (slate blue for the value, light grey for the track).
- Use unit charts (pictographs) arranged in linear rows for percentage comparisons.
- Remove all chart borders, gridlines, and backgrounds.

【章节页构图】
- Abstract background bordered by a thin double rectangular frame, text center-left

【收尾页构图】
- Full-bleed organic abstract background with center-left typography block

【禁止】
- Avoid bright, saturated, or neon colors; strictly adhere to muted/desaturated tones.
- Do not use heavy, thick borders; rely on thin, delicate lines.
- Avoid cluttered layouts; white (or negative) space must remain dominant.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Lifestyle or fashion brand pitches、Minimalist corporate summaries、Elegant event proposals。
