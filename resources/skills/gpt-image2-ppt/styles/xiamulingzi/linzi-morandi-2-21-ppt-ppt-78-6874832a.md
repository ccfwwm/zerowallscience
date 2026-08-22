# 78 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-78-6874832a

## 风格ID
linzi-morandi-2-21-ppt-ppt-78-6874832a

## 风格名称
78 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-78-6874832a

## 风格描述
Elegant, editorial-style presentation with a Morandi-inspired muted color palette, oversized typography, and overlapping asymmetric layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light gray (#F5F5F5) as primary background, dark slate (#465A65) for text and heavy contrast blocks, mustard (#D69D4C) and soft blue-grey (#CBD3D9) for accents.
- fonts: Clean, modern neo-grotesque sans-serif. High contrast in scale between massive headers/numerals and small, tightly-leaded body text.
- spacing: Generous margins, asymmetric padding, distinct separation between text zones and image zones.
- shape_language: Strictly orthogonal. Sharp rectangles, solid color blocks, soft-rounded squares for minor icons.
- texture: Flat color blocks layered over soft-focus or muted photography. Semi-transparent overlays.
- grid: Editorial split-screen grid (e.g., 40/60 or 30/70 vertical splits), often deliberately broken by intersecting elements.
- motion_or_depth: Depth created via overlapping flat layers (e.g., photos placed over vertical color bands, text placed over photos).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「78 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-78-6874832a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, editorial-style presentation with a Morandi-inspired muted color palette, oversized typography, and overlapping asymmetric layouts.
- 推荐配色：#F5F5F5、#465A65、#D69D4C、#CBD3D9、#333333

【不可丢失的风格锚点】
- Oversized numerals and cropped background letters used as texture
- Vertical color bands extending to screen edges, intersecting imagery
- Semi-transparent text containers over full-bleed photography
- Soft, warm, muted image treatments with high negative space

【字体】
- Use oversized, flat-color numerals as primary visual anchors for sections.
- Employ vertical text alignment inside narrow colored bands for structural decoration.
- Use lowercase for massive display headers to emphasize geometric shapes.
- Integrate large, semi-transparent letters in the background as subtle watermarks/texture.

【封面页构图】
- Full-bleed background with massive centered lowercase title, accented by a bottom-centered semi-transparent square.

【内容页构图】
- Top-centered anchor, four equidistant columns featuring a contained icon, title, and paragraph.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with massive centered lowercase title, accented by a bottom-centered semi-transparent square.","zones":["Full-bleed background with massive centered lowercase title, accented by a bottom-centered semi-transparent square."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["hero-image","centered-text","transparent-overlay"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Hero introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_bg","purpose":"Full bleed background establishing mood","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Oversized section number on a central light panel, balanced by a right-aligned image intersecting a dark vertical band with sideways text.","zones":["Oversized section number on a central light panel, balanced by a right-aligned image intersecting a dark vertical band with sideways text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["big-number","vertical-band","editorial-layout"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section headers","Chapter introductions","Numbered manifestos"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"section_img","purpose":"Section hero photography","bbox":[0.66,0.13,0.88,0.65],"priority":1}]}
- content: [{"id":"content-content","composition":"Top-centered anchor, four equidistant columns featuring a contained icon, title, and paragraph.","zones":["Top-centered anchor, four equidistant columns featuring a contained icon, title, and paragraph."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["4-column","icon-grid","features"],"avoid":["Complex data or large imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Value propositions","Service summaries"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Split layout with left edge-bleeding image and right-aligned text blocks layered over a giant background letter.","zones":["Split layout with left edge-bleeding image and right-aligned text blocks layered over a giant background letter."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["split-screen","image-left","watermark-text"],"avoid":["Sequential steps","copying source assets, source text, or an exact source arrangement"],"best_for":["Founder bios","Product highlights","Storytelling"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content_img_left","purpose":"Contextual photography","bbox":[0,0.25,0.5,0.88],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left text/chart column paired with a right-aligned device mockup intersecting a solid background block extending to the edge.","zones":["Left text/chart column paired with a right-aligned device mockup intersecting a solid background block extending to the edge."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["device-mockup","simple-charts","intersecting-blocks"],"avoid":["Complex multi-axis charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Digital product showcases","Platform metrics","Software features"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"device_screen","purpose":"Digital product representation","bbox":[0.53,0.3,0.88,0.7],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Top-centered anchor, four equidistant columns featuring a contained icon, title, and paragraph.","zones":["Top-centered anchor, four equidistant columns featuring a contained icon, title, and paragraph."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["4-column","icon-grid","features"],"avoid":["Complex data or large imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Core features","Value propositions","Service summaries"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Letterbox-cropped background image, intersected by a vertical, semi-transparent colored block housing aligned text.","zones":["Letterbox-cropped background image, intersected by a vertical, semi-transparent colored block housing aligned text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Oversized numerals and cropped background letters used as texture","Vertical color bands extending to screen edges, intersecting imagery","Semi-transparent text containers over full-bleed photography"],"optional_variants":["letterbox-crop","vertical-overlay","cinematic-close"],"avoid":["Standard content","Agendas","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information","Final thought/quote"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_bg","purpose":"Cinematic full-width background","bbox":[0,0.08,1,0.92],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Apply warm, desaturated (Morandi) filters to photography for consistency.
- Allow images to bleed off the edge on one or two sides, intersecting solid color blocks on the remaining sides.
- Use letterbox cropping (top and bottom white/background bars) for cinematic full-width shots.

【图标与装饰】
- Enclose abstract, geometric icons in dark slate, slightly rounded squares.
- Use small, centralized anchor icons at the top of content slides to establish a reading axis.

【数据页构图】
- Left text/chart column paired with a right-aligned device mockup intersecting a solid background block extending to the edge.

【图表风格】
- Extremely minimalist horizontal bar charts. Thin progress bars with raw data labels placed directly above.

【章节页构图】
- Oversized section number on a central light panel, balanced by a right-aligned image intersecting a dark vertical band with sideways text.

【收尾页构图】
- Letterbox-cropped background image, intersected by a vertical, semi-transparent colored block housing aligned text.

【禁止】
- Avoid bright, highly saturated primary colors.
- Do not outline text or use drop shadows; rely on flat overlapping layers.
- Avoid centering large blocks of body copy; keep body text sharply aligned (usually left).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Fashion or lifestyle lookbooks、High-end minimalist product pitches、Editorial style reports。
