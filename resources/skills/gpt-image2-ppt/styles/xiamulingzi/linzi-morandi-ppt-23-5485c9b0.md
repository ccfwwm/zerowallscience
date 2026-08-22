# 优雅线条（23）---木七设计 · ppt模板 / linzi-morandi-ppt-23-5485c9b0

## 风格ID
linzi-morandi-ppt-23-5485c9b0

## 风格名称
优雅线条（23）---木七设计 · ppt模板 / linzi-morandi-ppt-23-5485c9b0

## 风格描述
An earthy, Morandi-toned presentation featuring organic background shapes, botanical shadow overlays, and stark rectangular foreground cards.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream/off-white backgrounds, terracotta for primary solid blocks and headers, ochre and sand for secondary accents, dark charcoal for body text.
- fonts: Elegant serif for primary headings, casual script for subtitles, clean sans-serif for body copy.
- spacing: Generous asymmetrical margins, often using split 40/60 or 30/70 ratios. Content blocks are visually separated by ample negative space.
- shape_language: Strict, sharp-edged rectangles for foreground content (cards, images) contrasting against fluid, blob-like organic shapes in the background.
- texture: Visible film grain/noise on background color blocks, paired with soft botanical shadow projections.
- grid: Modular interlocking grid, frequently utilizing masonry-style staggered blocks and split-screen vertical divisions.
- motion_or_depth: Distinct dual-layer depth: a flat but textured background layer, and a foreground layer of cards/images lifted by subtle drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（23）---木七设计 · ppt模板 / linzi-morandi-ppt-23-5485c9b0」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An earthy, Morandi-toned presentation featuring organic background shapes, botanical shadow overlays, and stark rectangular foreground cards.
- 推荐配色：#B24A27、#EFA54E、#C5B19E、#F5F2EF、#353130

【不可丢失的风格锚点】
- Three-dot horizontal motif acting as an accent above titles
- Grainy, organic blobs overlapping in the background
- Botanical/leaf shadow overlays on the canvas edges
- Elevated central white cards with soft drop shadows

【字体】
- Headings: All-caps serif, tracked out slightly, often colored in terracotta.
- Subtitles: Handwritten script, colored in terracotta, placed directly beneath main headings.
- Body Text: Small sans-serif, high line-height, flush left, dark charcoal or white depending on the background block.

【封面页构图】
- Elevated central rectangular card resting on an organically textured background

【内容页构图】
- Two-column split with a solid colored data block on the lower left and an image on the right

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Elevated central rectangular card resting on an organically textured background","zones":["Elevated central rectangular card resting on an organically textured background"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["floating-card","organic-background"],"avoid":["Detailed agendas","Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Deck titles","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Asymmetric vertical split (40/60) with stark background color contrast and a bridging image","zones":["Asymmetric vertical split (40/60) with stark background color contrast and a bridging image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["split-screen","asymmetric","high-contrast"],"avoid":["Multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Case study introductions","Chapter headers"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"left-bridging-image","purpose":"subject focal point","bbox":[0.08,0.25,0.32,0.7],"priority":1}]}
- content: [{"id":"content-content","composition":"Two-column split with a solid colored data block on the lower left and an image on the right","zones":["Two-column split with a solid colored data block on the lower left and an image on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["two-column","data-block"],"avoid":["Long-form text","Complex tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Key statistics"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-image","purpose":"contextual lifestyle photography","bbox":[0.45,0.35,0.45,0.55],"priority":1}]},{"id":"content-comparison","composition":"Dominant upper background image with a smaller, secondary image overlapping the bottom corner","zones":["Dominant upper background image with a smaller, secondary image overlapping the bottom corner"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["image-overlap","hero-image"],"avoid":["Text-heavy reports","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Mood boards"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"primary-hero","purpose":"large background mood setter","bbox":[0.0,0.0,1.0,0.6],"priority":1},{"id":"secondary-inset","purpose":"detail or supporting shot","bbox":[0.03,0.5,0.2,0.45],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Masonry-style layout interlocking white, solid color, and image blocks","zones":["Masonry-style layout interlocking white, solid color, and image blocks"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["masonry","color-blocks","staggered"],"avoid":["Singular focal narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature lists","Multiple data highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-image-block","purpose":"architectural or structural visual","bbox":[0.4,0.4,0.25,0.25],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Two-column split with a solid colored data block on the lower left and an image on the right","zones":["Two-column split with a solid colored data block on the lower left and an image on the right"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["two-column","data-block"],"avoid":["Long-form text","Complex tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Key statistics"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"right-image","purpose":"contextual lifestyle photography","bbox":[0.45,0.35,0.45,0.55],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Diagonal checkerboard layout balancing text quotes and images","zones":["Diagonal checkerboard layout balancing text quotes and images"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["checkerboard","diagonal-balance"],"avoid":["Sequential processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Team introductions","Comparative quotes"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"top-right-image","purpose":"portrait or lifestyle shot","bbox":[0.55,0.05,0.4,0.45],"priority":1},{"id":"bottom-left-image","purpose":"portrait or lifestyle shot","bbox":[0.08,0.45,0.4,0.45],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Elevated central rectangular card on organically textured background, mirroring the cover","zones":["Elevated central rectangular card on organically textured background, mirroring the cover"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Three-dot horizontal motif acting as an accent above titles","Grainy, organic blobs overlapping in the background","Botanical/leaf shadow overlays on the canvas edges"],"optional_variants":["floating-card","bookend"],"avoid":["Call to action with heavy details","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are kept in strict rectangular frames with no border radius.
- Images frequently bleed to the edge of their designated grid zone or break the central axis.
- Images are used both as primary focal points and secondary overlapping context layers.

【图标与装饰】
- Minimalist line-art navigation arrows (e.g., in circles for 'View More').
- Absence of standard bullet points, replaced by layout separation or the three-dot motif.

【数据页构图】
- Masonry-style layout interlocking white, solid color, and image blocks

【图表风格】
- Data is presented typographically using oversized sans-serif percentage numbers rather than traditional charts.

【章节页构图】
- Asymmetric vertical split (40/60) with stark background color contrast and a bridging image

【收尾页构图】
- Elevated central rectangular card on organically textured background, mirroring the cover

【禁止】
- Do not overlay thin white text directly onto complex or bright areas of photographs without a dark gradient scrim.
- Avoid centering body text; keep paragraphs flush left for readability.
- Do not apply rounded corners to images; it breaks the established shape language contrast.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios.、Boutique brand introductions.、Lifestyle or interior design proposals.。
