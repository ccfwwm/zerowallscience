# 优雅线条（32）---木七设计 · ppt模板 / linzi-morandi-ppt-32-a093e13c

## 风格ID
linzi-morandi-ppt-32-a093e13c

## 风格名称
优雅线条（32）---木七设计 · ppt模板 / linzi-morandi-ppt-32-a093e13c

## 风格描述
An elegant, minimalist presentation template featuring a Morandi color palette of dusty pinks and mauves, defined by soft circular geometry and clean grid layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light blush background (#F9EBEB) with deep mauve (#997076) as the primary contrasting color for shapes and text. Lighter dusty pinks serve as secondary accents.
- fonts: Clean, light sans-serif typography. Uses large, tracked-out English display text paired with smaller, elegant subtitles.
- spacing: Generous margins with central focus on cover/section slides. Structured masonry-style gaps (approx 16-24px) in grid layouts.
- shape_language: Dominated by circles, rounded rectangles, inverted teardrops/map-pins, and chevron arrows. Completely flat with no drop shadows.
- texture: Matte, flat color blocks. No gradients or complex textures.
- grid: Symmetrical central alignments for titles, switching to strict multi-column grids (3-col, 4-col) for content.
- motion_or_depth: Depth is implied strictly through flat 2D overlapping of shapes and varying opacities, rather than shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（32）---木七设计 · ppt模板 / linzi-morandi-ppt-32-a093e13c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template featuring a Morandi color palette of dusty pinks and mauves, defined by soft circular geometry and clean grid layouts.
- 推荐配色：#F9EBEB、#997076、#E6C4C3、#D9BDBB、#6D5E61

【不可丢失的风格锚点】
- Morandi/dusty rose color scheme
- Prominent circular motifs with dashed orbital rings
- Floating geometric bubbles of varying scale and opacity
- Pill-shaped wireframe buttons/labels
- Soft, overlapping flat shapes

【字体】
- Headings use large, light-weight sans-serif with wide letter spacing
- Decorative oversized typography occasionally overlaps structural borders or functional buttons
- Dual-language or title/subtitle pairing is consistently center-aligned on primary slides
- Body text is small, muted (either white on dark, or dark mauve on light), with comfortable line height

【封面页构图】
- Large central circle framed by a dashed ring and surrounded by smaller floating bubbles

【内容页构图】
- Four-column layout using large inverted teardrop (map-pin) shapes containing icons

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Large central circle framed by a dashed ring and surrounded by smaller floating bubbles","zones":["Large central circle framed by a dashed ring and surrounded by smaller floating bubbles"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["circular-hero","minimal","floating-shapes"],"avoid":["Heavy text introduction","Data-driven cover slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Minimalist welcomes"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central dark focal circle with text and a pill-shaped badge, identical to cover layout","zones":["Central dark focal circle with text and a pill-shaped badge, identical to cover layout"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["chapter-divider","circular-focus","symmetrical"],"avoid":["Bulky agendas","Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter markers","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four-column layout using large inverted teardrop (map-pin) shapes containing icons","zones":["Four-column layout using large inverted teardrop (map-pin) shapes containing icons"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["4-column","icon-pins","services"],"avoid":["Long paragraphs","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Service pillars","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Asymmetric masonry grid blending edge-to-edge images and solid color text blocks","zones":["Asymmetric masonry grid blending edge-to-edge images and solid color text blocks"],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["masonry-grid","image-heavy","checkerboard"],"avoid":["Bullet-point heavy text","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Mood boards","Product showcases","Case studies"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"img-top-mid","purpose":"Square contextual image","bbox":[0.34,0.26,0.3,0.32],"priority":2},{"id":"img-top-right","purpose":"Square contextual image","bbox":[0.65,0.26,0.3,0.32],"priority":3},{"id":"img-bottom-left","purpose":"Wide landscape feature image","bbox":[0.05,0.6,0.59,0.32],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Smooth overlapping mountain/area chart anchored by a solid dark footer strip","zones":["Smooth overlapping mountain/area chart anchored by a solid dark footer strip"],"content_capacity":{"density":"low","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["area-chart","minimal-data","no-axes"],"avoid":["Detailed financial reporting","Multi-variable scatter data","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend visualization","High-level metrics","Growth concepts"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central dark focal circle with text and a pill-shaped badge, identical to cover layout","zones":["Central dark focal circle with text and a pill-shaped badge, identical to cover layout"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["chapter-divider","circular-focus","symmetrical"],"avoid":["Bulky agendas","Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter markers","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Return to the cover layout with centralized typography and floating circular elements","zones":["Return to the cover layout with centralized typography and floating circular elements"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Morandi/dusty rose color scheme","Prominent circular motifs with dashed orbital rings","Floating geometric bubbles of varying scale and opacity"],"optional_variants":["closing","circular-hero","bookend"],"avoid":["Summaries","Disclaimers","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final Q&A prompts","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped completely flush to rectangular grid bounding boxes
- No borders, frames, or shadows applied to photos
- Images are used in tight masonry grids or as edge-bleeding split panels

【图标与装饰】
- Flat, minimalist white icons
- Used in both solid geometric containers (map pins) and outline formats
- Icons are strictly monochromatic, inheriting contrast from their colored backgrounds

【数据页构图】
- Smooth overlapping mountain/area chart anchored by a solid dark footer strip

【图表风格】
- Smooth, overlapping area/mountain charts
- No visible X/Y axis lines or gridlines
- Data points highlighted with floating, flag-like percentage tooltip labels attached to peaks

【章节页构图】
- Central dark focal circle with text and a pill-shaped badge, identical to cover layout

【收尾页构图】
- Return to the cover layout with centralized typography and floating circular elements

【禁止】
- Bright, saturated, or neon colors
- Drop shadows or 3D bevel effects
- Heavy, blocky, or serif typography
- Cluttered layouts lacking generous whitespace
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Cosmetics or fashion brand decks、Minimalist corporate summaries、Creative agency portfolios、Elegant event proposals。
