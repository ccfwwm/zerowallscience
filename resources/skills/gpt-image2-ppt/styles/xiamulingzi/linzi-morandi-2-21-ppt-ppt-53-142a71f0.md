# 53 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-53-142a71f0

## 风格ID
linzi-morandi-2-21-ppt-ppt-53-142a71f0

## 风格名称
53 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-53-142a71f0

## 风格描述
Editorial fashion-inspired presentation featuring a muted earth-tone palette, heavy color blocking, and large overlapping serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream (#E6E6DF) as primary canvas. Deep brown and olive green for heavy structural blocks. Terracotta and rust for accents.
- fonts: Elegant, high-contrast Serif for primary headings and decorative display elements. Clean Sans-serif for dense body copy and data labels.
- spacing: Generous margins with tight, intentional overlaps between text, images, and color blocks. Asymmetric grid.
- shape_language: Strictly orthogonal. Sharp rectangles, thin divider lines, and clean geometric frames.
- texture: Flat, matte color planes contrasting with rich photographic textures. No gradients, drop shadows, or bevels.
- grid: Modular vertical and horizontal splitting. Elements frequently cross grid lines to bridge zones.
- motion_or_depth: Depth is created entirely through z-index layering (text over image, image over solid color blocks). Flat design without shadow.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「53 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-53-142a71f0」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial fashion-inspired presentation featuring a muted earth-tone palette, heavy color blocking, and large overlapping serif typography.
- 推荐配色：#E6E6DF、#553520、#4D5436、#B6663D、#C47F3C、#FFFFFF

【不可丢失的风格锚点】
- Muted earth-tone color blocking
- Extreme-scale overlapping serif typography
- Editorial asymmetry and split-screen layouts
- Images layered with thick white borders or semi-transparent overlays

【字体】
- Display text is oversized, often vertically oriented or overflowing its container, using a high-contrast Serif.
- Body copy is strictly Sans-serif, small, with generous line height for legibility against solid blocks.
- Tracking (letter-spacing) is significantly increased for uppercase subheadings and labels.
- Text overlaps photography directly, requiring careful contrast management or image overlays.

【封面页构图】
- Full-bleed background with centered, semi-transparent dark rectangular overlay and large central serif typography.

【内容页构图】
- Horizontal split layout (solid top, image bottom) with large rotated vertical text on the far left.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with centered, semi-transparent dark rectangular overlay and large central serif typography.","zones":["Full-bleed background with centered, semi-transparent dark rectangular overlay and large central serif typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["hero-image","overlay-box","centered-text"],"avoid":["Detailed content","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-image","purpose":"Full-bleed background establishing mood","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetric vertical color split with a central overlapping image and oversized, overflowing typography spanning multiple zones.","zones":["Asymmetric vertical color split with a central overlapping image and oversized, overflowing typography spanning multiple zones."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["split-background","overlapping-text","editorial-layout"],"avoid":["Heavy text","Multi-chart data","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-image","purpose":"Subject image acting as a visual anchor","bbox":[0.42,0.28,0.52,0.6],"priority":1}]}
- content: [{"id":"content-content","composition":"Horizontal split layout (solid top, image bottom) with large rotated vertical text on the far left.","zones":["Horizontal split layout (solid top, image bottom) with large rotated vertical text on the far left."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["horizontal-split","vertical-text","half-image"],"avoid":["Data-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Manifesto statements","Chapter introductions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"bottom-image","purpose":"Atmospheric image anchoring the layout","bbox":[0,0.46,1,0.54],"priority":1}]},{"id":"content-comparison","composition":"Complex overlapping rectangular blocks with a heavily bordered inset image and intersecting typography.","zones":["Complex overlapping rectangular blocks with a heavily bordered inset image and intersecting typography."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["framed-image","color-blocking","intersecting-text"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Feature highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"framed-center","purpose":"Primary subject showcase","bbox":[0.45,0.15,0.4,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Large background image framed by colored margins, featuring massive vertical typography and horizontal data bars.","zones":["Large background image framed by colored margins, featuring massive vertical typography and horizontal data bars."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["data-bars","vertical-text-overlay","framed-layout"],"avoid":["Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Team profiles with stats"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"main-bg","purpose":"Primary backdrop for text and data","bbox":[0.05,0.08,0.9,0.84],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetric vertical color split with a central overlapping image and oversized, overflowing typography spanning multiple zones.","zones":["Asymmetric vertical color split with a central overlapping image and oversized, overflowing typography spanning multiple zones."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["split-background","overlapping-text","editorial-layout"],"avoid":["Heavy text","Multi-chart data","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Key statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-image","purpose":"Subject image acting as a visual anchor","bbox":[0.42,0.28,0.52,0.6],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Three-column layout divided by large vertical text and thin vertical lines, with a central inset portrait.","zones":["Three-column layout divided by large vertical text and thin vertical lines, with a central inset portrait."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["three-column","vertical-divider","testimonial"],"avoid":["Process flows","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Quotes","Team member highlights"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"portrait","purpose":"Subject of the quote","bbox":[0.32,0.1,0.35,0.8],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-bleed background with centered, semi-transparent dark rectangular overlay and large central serif typography (identical structure to cover).","zones":["Full-bleed background with centered, semi-transparent dark rectangular overlay and large central serif typography (identical structure to cover)."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earth-tone color blocking","Extreme-scale overlapping serif typography","Editorial asymmetry and split-screen layouts"],"optional_variants":["hero-image","overlay-box","centered-text"],"avoid":["Content slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-image-closing","purpose":"Full-bleed background establishing final mood","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds with heavy, centered color-block overlays (for covers/transitions).
- Thick white internal framing for inset photos.
- Split-screen compositions where images occupy exactly half the vertical or horizontal space.

【图标与装饰】
- Minimal to none. Relies on typography and color blocks rather than illustrative icons.

【数据页构图】
- Large background image framed by colored margins, featuring massive vertical typography and horizontal data bars.

【图表风格】
- Minimalist geometric charts (e.g., radar charts) composed of flat, semi-transparent overlapping polygons.
- No gridlines or axes. Clean, floating text labels with exact metric matching.

【章节页构图】
- Asymmetric vertical color split with a central overlapping image and oversized, overflowing typography spanning multiple zones.

【收尾页构图】
- Full-bleed background with centered, semi-transparent dark rectangular overlay and large central serif typography (identical structure to cover).

【禁止】
- Do not use bright primary or neon colors; strictly adhere to the muted earth tones.
- Avoid drop shadows or 3D effects; maintain flat, layered 2D depth.
- Do not use Sans-serif for primary titles, as it destroys the editorial aesthetic.
- Avoid placing delicate Serif text over high-contrast or busy image areas without a solid overlay.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lookbook pitches、High-end lifestyle brand presentations、Editorial portfolios、Creative agency profiles。
