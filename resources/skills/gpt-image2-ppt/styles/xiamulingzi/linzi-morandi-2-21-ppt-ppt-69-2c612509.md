# 69 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-69-2c612509

## 风格ID
linzi-morandi-2-21-ppt-ppt-69-2c612509

## 风格名称
69 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-69-2c612509

## 风格描述
A minimalist, Scandinavian-inspired presentation featuring muted teal accents, sharp geometric shapes, and asymmetrical split-screen layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White or light gray backgrounds, dark charcoal text, muted teal for structural shapes and highlights
- fonts: Bold, geometric sans-serif for headings; highly legible, lighter sans-serif for body copy
- spacing: Generous negative space combined with intentional tight overlaps between solid shapes and images
- shape_language: Strictly orthogonal rectangles, thin divider lines, small plus signs, and occasional diamond frames
- texture: Clean flat vectors against photographic backgrounds, occasionally utilizing semi-transparent light overlays
- grid: Modular grid with strong vertical and horizontal splits, often 50/50 or checkerboard patterns
- motion_or_depth: Flat design with depth implied only through the overlapping of flat color blocks over photographs

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「69 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-69-2c612509」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, Scandinavian-inspired presentation featuring muted teal accents, sharp geometric shapes, and asymmetrical split-screen layouts.
- 推荐配色：#6BB1AB、#1D1D1D、#FFFFFF、#F5F5F5、#E2E2E2

【不可丢失的风格锚点】
- Solid muted teal rectangular accents
- Black plus sign (+) corner motifs
- Asymmetrical split-screen grid layouts
- High-contrast geometric sans-serif typography

【字体】
- Use extreme scale contrast between headers and body copy
- Maintain strict left-alignment for text blocks within grid columns
- Avoid placing small body text directly beneath large overlapping headers to maintain legibility

【封面页构图】
- Full-bleed background with large, overlapping center text and floating accent squares

【内容页构图】
- Checkerboard grid layout with alternating text and images, unified by overlapping title bars

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with large, overlapping center text and floating accent squares","zones":["Full-bleed background with large, overlapping center text and floating accent squares"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["hero-image","bold-typography","minimal"],"avoid":["Detailed subtitles","Long titles","copying source assets, source text, or an exact source arrangement"],"best_for":["Opening slides","High-impact title cards"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-hero","purpose":"Full bleed background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical three-panel layout with a central overlapping anchor square","zones":["Asymmetrical three-panel layout with a central overlapping anchor square"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["split-screen","overlapping-shapes","asymmetrical"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature introductions","Product comparisons"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img-left","purpose":"Main structural image","bbox":[0,0,0.5,0.6],"priority":1},{"id":"img-bottom-right","purpose":"Secondary contextual image","bbox":[0.5,0.45,0.5,0.55],"priority":2}]}
- content: [{"id":"content-content","composition":"Checkerboard grid layout with alternating text and images, unified by overlapping title bars","zones":["Checkerboard grid layout with alternating text and images, unified by overlapping title bars"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["grid","checkerboard","text-image-pairs"],"avoid":["Sequential steps","copying source assets, source text, or an exact source arrangement"],"best_for":["Service descriptions","Core value pillars"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img-top-left","purpose":"First quadrant image","bbox":[0,0,0.5,0.5],"priority":1},{"id":"img-bottom-right","purpose":"Fourth quadrant image","bbox":[0.5,0.5,0.5,0.5],"priority":2}]},{"id":"content-comparison","composition":"Central vertical axis with mirrored icon diamonds and text over a washed-out full bleed image","zones":["Central vertical axis with mirrored icon diamonds and text over a washed-out full bleed image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["symmetrical","diamonds","overlay"],"avoid":["Complex narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Four-point summaries","Core features"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"bg-washed","purpose":"Background texture/context","bbox":[0,0,1,1],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Horizontal array of four radial charts overlapping a central vertical background frame","zones":["Horizontal array of four radial charts overlapping a central vertical background frame"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["radial-charts","data-row","minimal-metrics"],"avoid":["Complex datasets","Trend lines","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics","Percentage comparisons"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"bg-frame","purpose":"Contextual background element","bbox":[0,0,1,1],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical three-panel layout with a central overlapping anchor square","zones":["Asymmetrical three-panel layout with a central overlapping anchor square"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["split-screen","overlapping-shapes","asymmetrical"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature introductions","Product comparisons"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"img-left","purpose":"Main structural image","bbox":[0,0,0.5,0.6],"priority":1},{"id":"img-bottom-right","purpose":"Secondary contextual image","bbox":[0.5,0.45,0.5,0.55],"priority":2}]}]
- closing: {"id":"closing-primary","composition":"Central oversized typography overlapping a washed background, framed by corner geometry","zones":["Central oversized typography overlapping a washed background, framed by corner geometry"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Solid muted teal rectangular accents","Black plus sign (+) corner motifs","Asymmetrical split-screen grid layouts"],"optional_variants":["bookend","minimal","typographic"],"avoid":["Content presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Final remarks","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-closing","purpose":"Subtle background image","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use full-bleed background images with high negative space
- Crop images into strict rectangular panels for split-screen layouts
- Overlap solid color blocks onto the edges of images to break the grid

【图标与装饰】
- Use simple, solid flat icons or bold line icons
- Encase icons in geometric frames (circles or diamonds) connected by thin structural lines

【数据页构图】
- Horizontal array of four radial charts overlapping a central vertical background frame

【图表风格】
- Use minimalist, thin-line radial progress rings with bold percentage text in the center
- Remove all unnecessary axes, borders, or chart junk

【章节页构图】
- Asymmetrical three-panel layout with a central overlapping anchor square

【收尾页构图】
- Central oversized typography overlapping a washed background, framed by corner geometry

【禁止】
- Overlapping large dark text directly over small dark body text
- Using rounded corners or organic blobs
- Applying drop shadows or 3D effects to shapes
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Interior design portfolios、Fashion lookbooks、Minimalist corporate overviews、Architecture proposals。
