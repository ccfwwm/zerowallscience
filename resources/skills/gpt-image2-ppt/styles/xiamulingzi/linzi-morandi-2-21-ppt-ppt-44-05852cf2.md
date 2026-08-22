# 44 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-44-05852cf2

## 风格ID
linzi-morandi-2-21-ppt-ppt-44-05852cf2

## 风格名称
44 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-44-05852cf2

## 风格描述
Editorial presentation with earthy color blocking, overlapping rectangular layouts, and an organic, modern aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: High-contrast earthy pairing (rust/olive) serving as structural backgrounds, with pure white primarily for floating content cards.
- fonts: Elegant serif for primary display headers; clean, modern sans-serif for body copy and metadata.
- spacing: Generous internal margins within text cards, contrasted by tight, purposeful overlaps between contrasting layout elements.
- shape_language: Strictly rectangular forms with sharp 90-degree corners; layout relies entirely on orthogonal blocks.
- texture: Flat, matte background color blocks paired directly against high-texture editorial photography.
- grid: Underlying modular column structures (2 or 3 columns) deliberately disrupted by overlapping floating cards.
- motion_or_depth: Depth is achieved purely through static z-index layering of solid color cards over images and contrasting background zones.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「44 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-44-05852cf2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial presentation with earthy color blocking, overlapping rectangular layouts, and an organic, modern aesthetic.
- 推荐配色：#984F31、#4D5846、#FFFFFF、#333333

【不可丢失的风格锚点】
- Earthy dual-tone (rust and olive) structural color blocking
- Overlapping rigid rectangular cards that bridge column divisions
- Editorial photography framing with thick borders or offset positioning
- Elegant serif display typography paired with strict sans-serif body text

【字体】
- Use serif fonts for high-impact, short titles to evoke an editorial feel.
- Maintain small, highly legible sans-serif for dense paragraph blocks.
- Utilize all-caps for distinct stylistic emphasis on primary keywords or category labels.
- Maintain high line-height in body copy to offset heavy color blocks.

【封面页构图】
- Vertical split with left-anchored framed image and right-anchored pristine white title zone

【内容页构图】
- Dark background with stacked floating white text cards and offset vertical imagery

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Vertical split with left-anchored framed image and right-anchored pristine white title zone","zones":["Vertical split with left-anchored framed image and right-anchored pristine white title zone"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["split-layout","editorial-cover"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section intros"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero","purpose":"hero cover image","bbox":[0.05,0.08,0.36,0.84],"priority":1}]}
- section: {"id":"section-primary","composition":"Perfect vertical color split with left-aligned text and a centrally padded right image","zones":["Perfect vertical color split with left-aligned text and a centrally padded right image"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["perfect-split","hero-focus"],"avoid":["Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Pull quotes"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"portrait","purpose":"focused subject image","bbox":[0.6,0.17,0.31,0.66],"priority":1}]}
- content: [{"id":"content-content","composition":"Dark background with stacked floating white text cards and offset vertical imagery","zones":["Dark background with stacked floating white text cards and offset vertical imagery"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["floating-cards","dark-mode"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait","purpose":"subject portrait","bbox":[0.05,0.1,0.26,0.8],"priority":1}]},{"id":"content-comparison","composition":"Asymmetric masonry layout with alternating solid text blocks and image slots","zones":["Asymmetric masonry layout with alternating solid text blocks and image slots"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["masonry-grid","multi-image"],"avoid":["Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Team introductions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img1","purpose":"editorial image","bbox":[0.38,0.0,0.3,0.58],"priority":1},{"id":"img2","purpose":"editorial image","bbox":[0.69,0.0,0.31,0.58],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Solid layout with a left-anchored media block supporting an overlapping corner title, next to a minimalist right-hand table","zones":["Solid layout with a left-anchored media block supporting an overlapping corner title, next to a minimalist right-hand table"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["minimal-table","corner-overlap"],"avoid":["Complex data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["Pricing menus","Simple itineraries","Specifications"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"context","purpose":"supporting image","bbox":[0.0,0.18,0.46,0.62],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Dark background with stacked floating white text cards and offset vertical imagery","zones":["Dark background with stacked floating white text cards and offset vertical imagery"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["floating-cards","dark-mode"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait","purpose":"subject portrait","bbox":[0.05,0.1,0.26,0.8],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Bookend mirror of the cover layout with right-anchored pristine white zone and large serif closing remark","zones":["Bookend mirror of the cover layout with right-anchored pristine white zone and large serif closing remark"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Earthy dual-tone (rust and olive) structural color blocking","Overlapping rigid rectangular cards that bridge column divisions","Editorial photography framing with thick borders or offset positioning"],"optional_variants":["bookend","editorial-close"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero","purpose":"closing hero image","bbox":[0.05,0.08,0.36,0.84],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Frame subjects tightly within geometric containers.
- Allow images to span across distinct background color zones to unify split layouts.
- Use thick, contrasting background colors to act as borders or mats for photography.

【图标与装饰】
- Use minimal, flat circular containers to anchor list nodes or step markers.
- Align icons directly on the boundary edge of overlapping cards.

【数据页构图】
- Solid layout with a left-anchored media block supporting an overlapping corner title, next to a minimalist right-hand table

【图表风格】
- Limit data visualization to minimalist, text-based tables.
- Use thin horizontal rules to separate rows, completely omitting vertical grid lines.

【章节页构图】
- Perfect vertical color split with left-aligned text and a centrally padded right image

【收尾页构图】
- Bookend mirror of the cover layout with right-anchored pristine white zone and large serif closing remark

【禁止】
- Avoid curved corners on structural layout elements.
- Do not use drop shadows; rely on color contrast for depth.
- Avoid gradients; stick to solid, matte color blocks.
- Do not blindly copy specific illustrative vector assets (e.g., botanical graphics).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lookbook pitch decks、Lifestyle brand guidelines、Editorial magazine-style reports、Photography portfolios。
