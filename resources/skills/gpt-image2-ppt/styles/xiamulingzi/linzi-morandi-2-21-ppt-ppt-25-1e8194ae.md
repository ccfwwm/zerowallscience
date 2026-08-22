# 25 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-25-1e8194ae

## 风格ID
linzi-morandi-2-21-ppt-ppt-25-1e8194ae

## 风格名称
25 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-25-1e8194ae

## 风格描述
An elegant, fashion-forward editorial presentation featuring oversized serif typography, asymmetrical layouts, and a unique ticket-punch cutout motif.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted taupe/brown as the primary accent background, pure white for clean space, and deep charcoal/black for high-contrast typography.
- fonts: High-contrast elegant Serif for massive display and headlines; ultra-light Sans-serif for body text; heavily tracked Sans-serif for small labels.
- spacing: Generous editorial margins, using vast negative space to balance heavy oversized typography.
- shape_language: Primarily sharp rectangles modified by precise semi-circular edge cutouts.
- texture: Clean and flat, relying entirely on the visual texture of embedded photography and extreme typographic scale.
- grid: Modular editorial grid that frequently breaks margins with full-bleed vertical text or overlapping layers.
- motion_or_depth: Flat layering where depth is achieved exclusively through elements (text/images) slightly overlapping bounding boxes of other layers.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「25 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-25-1e8194ae」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, fashion-forward editorial presentation featuring oversized serif typography, asymmetrical layouts, and a unique ticket-punch cutout motif.
- 推荐配色：#9B8D7C、#FFFFFF、#181818、#F2DDC9、#262A2E

【不可丢失的风格锚点】
- Oversized, cropped serif typography spanning the vertical or horizontal edges.
- Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.
- Muted, earthy editorial color palette contrasting heavily with deep blacks.
- Asymmetrical, magazine-style layouts with deliberate overlapping.

【字体】
- Use massive, all-caps Serif text as background graphical elements, often cropped by the slide edge.
- Keep body text in a small, low-contrast Sans-serif to emphasize the display typography.
- Use wide tracking (letter-spacing) on small all-caps label text for meta-information.

【封面页构图】
- Massive top edge typography overlapping a centered horizontal image with a bottom edge cutout.

【内容页构图】
- Left edge vertical typography with a right-aligned staggered text layout.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Massive top edge typography overlapping a centered horizontal image with a bottom edge cutout.","zones":["Massive top edge typography overlapping a centered horizontal image with a bottom edge cutout."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["editorial-cover","large-text","cutout-image"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section heroes"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-cover","purpose":"Primary mood imagery","bbox":[0.15,0.26,0.7,0.57],"priority":1}]}
- section: {"id":"section-primary","composition":"Giant headline text on the left, overlapping a solid accent block on the right which frames a vertical image.","zones":["Giant headline text on the left, overlapping a solid accent block on the right which frames a vertical image."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["split-screen","huge-typography","overlap"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Key quotes"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"section-portrait","purpose":"Section hero portrait","bbox":[0.67,0.0,0.33,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Left edge vertical typography with a right-aligned staggered text layout.","zones":["Left edge vertical typography with a right-aligned staggered text layout."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["vertical-text","text-heavy","asymmetrical"],"avoid":["Gallery grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Left edge vertical typography framing an asymmetrical 3-image masonry layout with a tiny palette legend.","zones":["Left edge vertical typography framing an asymmetrical 3-image masonry layout with a tiny palette legend."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["gallery","moodboard","vertical-text"],"avoid":["Bullet point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Portfolio galleries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"gallery-main","purpose":"Primary gallery image","bbox":[0.37,0.12,0.38,0.36],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Vertical edge text framing a minimal column chart and overlapping mobile/tablet device mockups.","zones":["Vertical edge text framing a minimal column chart and overlapping mobile/tablet device mockups."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["device-mockup","minimal-chart","digital-portfolio"],"avoid":["Text-heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["App showcases","Digital metrics"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"tablet-screen","purpose":"Digital content display","bbox":[0.62,0.29,0.24,0.6],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left edge vertical typography with a right-aligned staggered text layout.","zones":["Left edge vertical typography with a right-aligned staggered text layout."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["vertical-text","text-heavy","asymmetrical"],"avoid":["Gallery grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Symmetrical central image with dual side cutouts ('ticket shape'), sandwiched between top text and bottom social icons.","zones":["Symmetrical central image with dual side cutouts ('ticket shape'), sandwiched between top text and bottom social icons."],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Oversized, cropped serif typography spanning the vertical or horizontal edges.","Geometric semi-circle cutouts ('ticket-punches') on the edges of images or solid color blocks.","Muted, earthy editorial color palette contrasting heavily with deep blacks."],"optional_variants":["closing","ticket-shape","symmetrical"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"final-hero","purpose":"Concluding mood image","bbox":[0.25,0.29,0.48,0.46],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Apply semi-circle cutouts to the middle of edges on select hero images or framing blocks.
- Mix extreme vertical and horizontal aspect ratios on a single slide.
- Never use borders or shadows; let images sit perfectly flat against the background.

【图标与装饰】
- Minimalist, low-contrast circular icons for social media or contact info, blending into the background.

【数据页构图】
- Vertical edge text framing a minimal column chart and overlapping mobile/tablet device mockups.

【图表风格】
- Ultra-minimalist column charts with pure vertical lines, no backdrops, and simple horizontal grid lines.

【章节页构图】
- Giant headline text on the left, overlapping a solid accent block on the right which frames a vertical image.

【收尾页构图】
- Symmetrical central image with dual side cutouts ('ticket shape'), sandwiched between top text and bottom social icons.

【禁止】
- Avoid bright, saturated colors; stick to the muted, earthy editorial palette.
- Do not use drop shadows or 3D effects on images or text.
- Avoid centering all content; maintain the asymmetrical, dynamic editorial flow.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks and photography portfolios.、High-end lifestyle or boutique agency proposals.、Editorial-style annual reports or magazine summaries.。
