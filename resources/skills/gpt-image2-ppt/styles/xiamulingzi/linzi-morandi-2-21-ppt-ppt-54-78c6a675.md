# 54 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-54-78c6a675

## 风格ID
linzi-morandi-2-21-ppt-ppt-54-78c6a675

## 风格名称
54 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-54-78c6a675

## 风格描述
Editorial-style presentation with muted interlocking color blocks, elegant serif/sans-serif typography pairing, and sophisticated modular grids.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background white, supported by substantial beige and soft gray solid blocks. Dark near-black for primary text. Muted gold/blue for subtle icon accents.
- fonts: Oversized bold sans-serif for hero moments. Light, clean sans-serif for standard titles. Elegant serif for body paragraphs and quotes.
- spacing: Wide gutters (approx 24px) between grid elements. High padding margins inside solid color text blocks.
- shape_language: Strict orthogonal rectangles. Zero border radius. Sharp, clean intersections.
- texture: Flat vector geometry layered against highly textured/photographic elements. No gradients or drop shadows.
- grid: Modular grid heavily utilizing 50/50 splits, thirds, and asymmetrical overlapping columns.
- motion_or_depth: Depth achieved entirely through 2D flat overlapping of images over solid color bands. Completely flat layering.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「54 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-54-78c6a675」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial-style presentation with muted interlocking color blocks, elegant serif/sans-serif typography pairing, and sophisticated modular grids.
- 推荐配色：#F1E6D2、#CFCFD1、#FFFFFF、#1A1A1A、#B08D5B

【不可丢失的风格锚点】
- Interlocking solid pastel rectangles and unbordered photography
- Generous negative space flanking heavily structured image groupings
- Thin 1px horizontal divider lines anchoring text blocks
- Minimalist bracket/corner framing devices on full-bleed images

【字体】
- Use oversized, heavy-weight sans-serif for cover/closing titles to maximize contrast against images.
- Use light sans-serif (all caps) for section and slide titles.
- Use a classic serif for body text to introduce an editorial, magazine-like feel.
- Anchor titles and subtitles with a thin 1px horizontal rule.

【封面页构图】
- Full bleed background with massive center typography and minimal corner brackets

【内容页构图】
- Asymmetrical interlocking grid of diverse aspect ratios and solid color blocks

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full bleed background with massive center typography and minimal corner brackets","zones":["Full bleed background with massive center typography and minimal corner brackets"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["hero","full-bleed","minimal-framing"],"avoid":["Data visualization","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Hero statements"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-image","purpose":"Moody full-bleed background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Vertical split with text anchored left and a multi-column portrait grid bottom right","zones":["Vertical split with text anchored left and a multi-column portrait grid bottom right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["split-layout","portrait-grid","team-bios"],"avoid":["Heavy text narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product showcases","Agenda overviews"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-1","purpose":"Column 1 visual","bbox":[0.5,0.43,0.16,0.57],"priority":1},{"id":"portrait-2","purpose":"Column 2 visual","bbox":[0.66,0.43,0.16,0.57],"priority":2},{"id":"portrait-3","purpose":"Column 3 visual","bbox":[0.82,0.43,0.18,0.57],"priority":3}]}
- content: [{"id":"content-content","composition":"Asymmetrical interlocking grid of diverse aspect ratios and solid color blocks","zones":["Asymmetrical interlocking grid of diverse aspect ratios and solid color blocks"],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["masonry-grid","collage","color-blocking"],"avoid":["Sequential process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Mood boards","Case study summaries","Multi-faceted concepts"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-tall","purpose":"Primary anchoring visual","bbox":[0.03,0.08,0.28,0.84],"priority":1},{"id":"img-square","purpose":"Secondary detail visual","bbox":[0.33,0.08,0.24,0.48],"priority":2},{"id":"img-wide","purpose":"Tertiary context visual","bbox":[0.33,0.6,0.24,0.32],"priority":3}]},{"id":"content-comparison","composition":"Overlapping layered composition with a dominant right-bleed image","zones":["Overlapping layered composition with a dominant right-bleed image"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["overlap","asymmetrical","right-bleed"],"avoid":["Data-heavy reporting","copying source assets, source text, or an exact source arrangement"],"best_for":["Core brand messages","Chapter introductions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"img-dominant","purpose":"Atmospheric right-bleed image","bbox":[0.5,0,0.5,1],"priority":1},{"id":"img-overlap","purpose":"Specific focus element","bbox":[0.11,0.23,0.27,0.46],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Modular 2x4 grid of uniform color blocks acting as icon containers","zones":["Modular 2x4 grid of uniform color blocks acting as icon containers"],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["icon-grid","modular-cards","symmetrical"],"avoid":["Deep explanatory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Services overview","Core values","Feature matrices"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Vertical split with text anchored left and a multi-column portrait grid bottom right","zones":["Vertical split with text anchored left and a multi-column portrait grid bottom right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["split-layout","portrait-grid","team-bios"],"avoid":["Heavy text narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product showcases","Agenda overviews"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-1","purpose":"Column 1 visual","bbox":[0.5,0.43,0.16,0.57],"priority":1},{"id":"portrait-2","purpose":"Column 2 visual","bbox":[0.66,0.43,0.16,0.57],"priority":2},{"id":"portrait-3","purpose":"Column 3 visual","bbox":[0.82,0.43,0.18,0.57],"priority":3}]}]
- closing: {"id":"closing-primary","composition":"Full bleed background with massive center typography mirroring the cover slide","zones":["Full bleed background with massive center typography mirroring the cover slide"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Interlocking solid pastel rectangles and unbordered photography","Generous negative space flanking heavily structured image groupings","Thin 1px horizontal divider lines anchoring text blocks"],"optional_variants":["closing","bookend","hero"],"avoid":["Any content-heavy needs","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Final calls to action"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-image-closing","purpose":"Moody full-bleed background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Crop images into strict orthogonal rectangles with no borders or shadows.
- Use low-contrast, desaturated 'Morandi' tone photography to harmonize with beige/gray layout blocks.
- Allow images to bleed off the edges of the canvas to create expansive layouts.
- Layer vertical portrait images over solid background color bands.

【图标与装饰】
- Place flat vector icons strictly centered within uniform solid-color square tiles.
- Maintain consistent padding around icons inside their bounding tiles.
- Use dual-tone or muted single-color vectors that match the presentation's soft palette.

【数据页构图】
- Modular 2x4 grid of uniform color blocks acting as icon containers

【图表风格】
- No charts present, but data should be handled via modular square cards (as seen in the icon grid), maintaining strict alignment and muted colors.

【章节页构图】
- Vertical split with text anchored left and a multi-column portrait grid bottom right

【收尾页构图】
- Full bleed background with massive center typography mirroring the cover slide

【禁止】
- Do not use rounded corners or organic shapes.
- Do not apply drop shadows or 3D effects to images or blocks.
- Avoid highly saturated primary colors.
- Do not center-align body text; keep paragraphs left-aligned beneath titles.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Editorial lookbooks or fashion pitch decks、Event proposals (weddings, galas, retreats)、Creative agency portfolios、High-end real estate or lifestyle brand guidelines。
