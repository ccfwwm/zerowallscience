# 52 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-52-304d6816

## 风格ID
linzi-morandi-2-21-ppt-ppt-52-304d6816

## 风格名称
52 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-52-304d6816

## 风格描述
Editorial fashion deck featuring Morandi color blocking, minimalist layouts, and high-contrast asymmetrical typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted cream and taupe serve as primary structural blocks; dark charcoal for typography; off-white/light-grey backgrounds.
- fonts: Clean, neutral geometric sans-serif; extremely large headings paired with very small, tightly clustered body copy.
- spacing: Generous negative space disrupted by intentional overlaps of images and text blocks.
- shape_language: Strictly orthogonal; sharp rectangles, squares, and rigid horizontal/vertical lines.
- texture: Flat, matte color planes contrasting with rich photographic textures. No gradients or drop shadows outside of specific infographics.
- grid: Unconventional asymmetrical grid relying on heavy visual counterbalance rather than strict columns.
- motion_or_depth: Shallow depth achieved entirely through overlapping planes (text over image, image over solid block).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「52 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-52-304d6816」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial fashion deck featuring Morandi color blocking, minimalist layouts, and high-contrast asymmetrical typography.
- 推荐配色：#FCECBF、#C4AE99、#464646、#F6F6F6、#FFFFFF

【不可丢失的风格锚点】
- Vertical marginalia tags pinned to slide corners
- Intersecting flat rectangular color blocks
- Asymmetrical alignment with oversized, tightly-spaced headings
- Photographs bleeding to specific edges or framed by thick asymmetrical borders

【字体】
- Headings: Oversized, sans-serif, standard case or Title Case, often breaking the grid.
- Body: Small, high line-height, constrained to narrow columns.
- Marginalia: Rotated 90 degrees, tracked out, pinned to extreme edges.

【封面页构图】
- Top-heavy image bleed with bottom typographic zone and left-aligned marginalia blocks.

【内容页构图】
- Large off-center image with right-aligned bold typography and background watermark letters.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Top-heavy image bleed with bottom typographic zone and left-aligned marginalia blocks.","zones":["Top-heavy image bleed with bottom typographic zone and left-aligned marginalia blocks."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["half-bleed","minimal-cover"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Document covers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-cover","purpose":"Primary visual hook","bbox":[0,0,1,0.72],"priority":1}]}
- section: {"id":"section-primary","composition":"Central vertical image pillar flanked by large typography and numeric indicators.","zones":["Central vertical image pillar flanked by large typography and numeric indicators."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["pillar-image","oversized-number"],"avoid":["Long titles","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Numbered lists (single item)"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-pillar","purpose":"Thematic section visual","bbox":[0.33,0.09,0.33,0.82],"priority":1}]}
- content: [{"id":"content-content","composition":"Large off-center image with right-aligned bold typography and background watermark letters.","zones":["Large off-center image with right-aligned bold typography and background watermark letters."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["watermark-text","off-center-image"],"avoid":["Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"feature-image-1","purpose":"Contextual photography","bbox":[0,0.05,0.74,0.69],"priority":1}]},{"id":"content-comparison","composition":"Image embedded within thick, nested L-shaped color blocks, with adjacent cascading text.","zones":["Image embedded within thick, nested L-shaped color blocks, with adjacent cascading text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["nested-frames","text-overlap"],"avoid":["Complex data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Editorial content"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"framed-image","purpose":"Editorial portrait or product","bbox":[0.13,0.08,0.36,0.83],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Ascending isometric platform infographic with floating icons and vertical text drops.","zones":["Ascending isometric platform infographic with floating icons and vertical text drops."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["isometric-steps","process-flow"],"avoid":["Exact numerical data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Step-by-step processes","Growth concepts"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large off-center image with right-aligned bold typography and background watermark letters.","zones":["Large off-center image with right-aligned bold typography and background watermark letters."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["watermark-text","off-center-image"],"avoid":["Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"feature-image-1","purpose":"Contextual photography","bbox":[0,0.05,0.74,0.69],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Full-bleed background image with a thick white inset border and centered overlaid typography.","zones":["Full-bleed background image with a thick white inset border and centered overlaid typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["inset-border","overlay-text"],"avoid":["Detailed paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Hero statements"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"full-bg","purpose":"Atmospheric background","bbox":[0,0,1,1],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-bleed background image with a thin double-line inset border and centered text.","zones":["Full-bleed background image with a thin double-line inset border and centered text."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Vertical marginalia tags pinned to slide corners","Intersecting flat rectangular color blocks","Asymmetrical alignment with oversized, tightly-spaced headings"],"optional_variants":["elegant-frame","centered-closing"],"avoid":["Contact info with multiple fields","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Section breaks"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Final brand image","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Cropped into strict rectangles.
- Often anchored to one edge (full bleed on one side) while bordered on others.
- Overlaid with white framing lines or intersecting color blocks.

【图标与装饰】
- Minimalist, uniform line-weight outlines.
- Encased in small circular or square boundary markers.

【数据页构图】
- Ascending isometric platform infographic with floating icons and vertical text drops.

【图表风格】
- Infographics use flat, pseudo-3D isometric shapes or simple color-blocked bars.
- Data points are highlighted with large percentages and isolated icons.

【章节页构图】
- Central vertical image pillar flanked by large typography and numeric indicators.

【收尾页构图】
- Full-bleed background image with a thin double-line inset border and centered text.

【禁止】
- DO NOT break single words arbitrarily across multiple lines (e.g., 'Servic-es').
- Avoid centering body text; maintain strict left alignment for legibility.
- Do not use drop shadows on photography or standard text.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Editorial style guides、High-end lifestyle brand pitches。
