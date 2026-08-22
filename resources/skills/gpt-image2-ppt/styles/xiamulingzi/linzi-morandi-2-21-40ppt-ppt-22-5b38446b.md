# 莫兰迪风尚 (22) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-22-5b38446b

## 风格ID
linzi-morandi-2-21-40ppt-ppt-22-5b38446b

## 风格名称
莫兰迪风尚 (22) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-22-5b38446b

## 风格描述
A sophisticated, boho-chic presentation system utilizing earthy tones, asymmetrical image blocks, and botanical line art overlays for creative portfolios.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white #F7F6F5 for backgrounds; warm taupe and rich brown for accents/blocks; deep charcoal for primary text
- fonts: Heavy rounded sans-serif for primary display; elegant classic serif (e.g., Garamond) for secondary text and accents; sans-serif for body copy
- spacing: Generous margins, expansive whitespace, tight text block clustering, intentional overlapping of elements
- shape_language: Sharp rectangles for photos contrasting with fluid organic curves, squiggles, and floral line art
- texture: Clean flat vectors combined with rich photographic textures
- grid: Loose asymmetrical grid with elements intentionally breaking alignments for dynamic tension
- motion_or_depth: Depth achieved through strict layering: Background -> Solid offset block -> Photograph -> Line art overlay -> Text

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风尚 (22) · PPT模板 / linzi-morandi-2-21-40ppt-ppt-22-5b38446b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, boho-chic presentation system utilizing earthy tones, asymmetrical image blocks, and botanical line art overlays for creative portfolios.
- 推荐配色：#F7F6F5、#8C735A、#615243、#2A2A2A、#A28A73

【不可丢失的风格锚点】
- Earthy/muted color palette with off-white backgrounds
- Overlapping organic botanical line art and abstract arches
- Vertical typography acting as structural framing
- Asymmetrical image placements with offset solid color blocks behind them
- Top-right vertical pagination markers

【字体】
- Headings: Massive, heavy sans-serif, dark charcoal
- Subheadings: Small serif or sans-serif, all caps, wide tracking
- Body: Clean, legible sans-serif, medium line height
- Accents: 90-degree rotated vertical text acting as borders or edge frames

【封面页构图】
- Full-bleed background image with large centered typographic lockup

【内容页构图】
- Large offset image with corner anchoring color blocks and large organic line art overlapping the bottom right

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with large centered typographic lockup","zones":["Full-bleed background image with large centered typographic lockup"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["hero","centered","image-background"],"avoid":["Text-heavy content","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-hero","purpose":"Full bleed background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Split asymmetric layout with large left heading, landscape image center-right, and overlapping abstract arch vector","zones":["Split asymmetric layout with large left heading, landscape image center-right, and overlapping abstract arch vector"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["split-layout","arch-accent","asymmetrical"],"avoid":["Bullet lists","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-image","purpose":"Landscape atmospheric image","bbox":[0.27,0.07,0.51,0.6],"priority":1}]}
- content: [{"id":"content-content","composition":"Large offset image with corner anchoring color blocks and large organic line art overlapping the bottom right","zones":["Large offset image with corner anchoring color blocks and large organic line art overlapping the bottom right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["image-heavy","floral-overlay","corner-blocks"],"avoid":["Data comparison","Multi-column text","copying source assets, source text, or an exact source arrangement"],"best_for":["Featured case studies","Image-driven narratives"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"feature-image","purpose":"Large showcase image","bbox":[0.27,0.1,0.67,0.82],"priority":1}]},{"id":"content-comparison","composition":"Floating image interacting with vertical decorative bars and 90-degree rotated typography on the right","zones":["Floating image interacting with vertical decorative bars and 90-degree rotated typography on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["vertical-text","bar-accents","mood-board"],"avoid":["Dense data tables","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Mood boards","Gallery highlights","Concept intro"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"mood-image","purpose":"Portrait atmospheric image","bbox":[0.5,0.1,0.34,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split asymmetric layout with large left heading, landscape image center-right, and overlapping abstract arch vector","zones":["Split asymmetric layout with large left heading, landscape image center-right, and overlapping abstract arch vector"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["split-layout","arch-accent","asymmetrical"],"avoid":["Bullet lists","Complex data","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"section-image","purpose":"Landscape atmospheric image","bbox":[0.27,0.07,0.51,0.6],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large offset image with corner anchoring color blocks and large organic line art overlapping the bottom right","zones":["Large offset image with corner anchoring color blocks and large organic line art overlapping the bottom right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["image-heavy","floral-overlay","corner-blocks"],"avoid":["Data comparison","Multi-column text","copying source assets, source text, or an exact source arrangement"],"best_for":["Featured case studies","Image-driven narratives"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"feature-image","purpose":"Large showcase image","bbox":[0.27,0.1,0.67,0.82],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Split layout with solid color column on left, image on right, vertical text bridging the column boundary, and bottom-right line art overlay","zones":["Split layout with solid color column on left, image on right, vertical text bridging the column boundary, and bottom-right line art overlay"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Earthy/muted color palette with off-white backgrounds","Overlapping organic botanical line art and abstract arches","Vertical typography acting as structural framing"],"optional_variants":["profile","color-block","vertical-divider"],"avoid":["Financial data","Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Key quotes","Author bios"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"profile-image","purpose":"Profile or atmospheric photo","bbox":[0.44,0.13,0.49,0.87],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are unframed with sharp right-angle corners
- Often layered over offset solid color rectangles
- Frequently partially overlaid with large, organic vector line art in accent colors

【图标与装饰】
- Monochromatic (taupe), outlined or flat filled
- Arranged in strict, evenly spaced grids when showcased
- Minimalist and functional

【数据页构图】
- Split asymmetric layout with large left heading, landscape image center-right, and overlapping abstract arch vector

【图表风格】
- Data visualization not explicitly shown, but style implies flat, solid color fills matching the earthy palette with no 3D effects

【章节页构图】
- Split asymmetric layout with large left heading, landscape image center-right, and overlapping abstract arch vector

【收尾页构图】
- Full-bleed background image with large centered typographic lockup

【禁止】
- Using stark white (#FFFFFF) backgrounds which break the soft earthy mood
- Adding heavy drop shadows or 3D effects to shapes
- Centering all elements (destroys the dynamic asymmetrical tension)
- Using highly saturated neon or primary colors
- Enclosing photos in rounded rectangles or circles
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolio or case studies、Fashion brand lookbooks、Interior design proposals、Lifestyle, wellness, or organic product pitches。
