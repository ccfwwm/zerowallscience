# 19 · 3.07更新高级色25 / linzi-morandi-3-0725-19-821f35fd

## 风格ID
linzi-morandi-3-0725-19-821f35fd

## 风格名称
19 · 3.07更新高级色25 / linzi-morandi-3-0725-19-821f35fd

## 风格描述
Sophisticated academic presentation featuring a Morandi color palette, organic corner framing, and geometric wireframe accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds with sage green as primary accent, mustard gold as secondary accent, beige for soft background fills.
- fonts: Heavy sans-serif for main titles to provide weight; clean, legible sans-serif for body text.
- spacing: Generous white space in center, pushing decorative elements strictly to the perimeters and corners.
- shape_language: Contrast between fluid, organic amoeba shapes and rigid geometric lines/nodes.
- texture: Flat vector graphics with no drop shadows, maintaining a clean, matte aesthetic.
- grid: Modular grid adapting to 3-column and 4-column structures, with a consistent top-left header zone.
- motion_or_depth: Strictly 2D flat design relying on overlapping opacities (shapes over white backgrounds) rather than shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「19 · 3.07更新高级色25 / linzi-morandi-3-0725-19-821f35fd」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Sophisticated academic presentation featuring a Morandi color palette, organic corner framing, and geometric wireframe accents.
- 推荐配色：#6fa29b、#d4a34b、#f2e6d3、#ffffff、#333333

【不可丢失的风格锚点】
- Asymmetrical organic corner blobs
- Hexagonal geometric wireframe nodes
- Dotted concentric arcs
- Muted sage and mustard color pairing

【字体】
- Titles: Bold, center-aligned on covers/sections, left-aligned in headers.
- Body: Regular weight, dark gray, 1.2 to 1.5 line height for readability.
- Numerals: Often oversized, colored, and overlapping subtle circular backgrounds.

【封面页构图】
- Centered main title and subtitle, framed by organic corner blobs and top-left/bottom-right node networks.

【内容页构图】
- Three-column horizontal layout with circular image masks centered above text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered main title and subtitle, framed by organic corner blobs and top-left/bottom-right node networks.","zones":["Centered main title and subtitle, framed by organic corner blobs and top-left/bottom-right node networks."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["centered-text","corner-accents","minimalist"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation openings"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Oversized numeral overlapping a circular emblem, positioned above a centered title.","zones":["Oversized numeral overlapping a circular emblem, positioned above a centered title."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["large-number","centered-focus","divider"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three-column horizontal layout with circular image masks centered above text blocks.","zones":["Three-column horizontal layout with circular image masks centered above text blocks."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["3-column","circular-images","horizontal-grid"],"avoid":["Long sequential flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Team profiles","Product showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"col1-img","purpose":"feature illustration","bbox":[0.08,0.35,0.2,0.35],"priority":1},{"id":"col2-img","purpose":"feature illustration","bbox":[0.39,0.35,0.2,0.35],"priority":2},{"id":"col3-img","purpose":"feature illustration","bbox":[0.71,0.35,0.2,0.35],"priority":3}]},{"id":"content-comparison","composition":"Split layout: left-aligned vertical list with numbered circles, counterbalanced by a large line-art graphic on the right.","zones":["Split layout: left-aligned vertical list with numbered circles, counterbalanced by a large line-art graphic on the right."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["split-layout","numbered-list","hero-graphic"],"avoid":["Complex data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Concept introductions"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Serpentine timeline connecting alternating top and bottom text nodes via a continuous curved line.","zones":["Serpentine timeline connecting alternating top and bottom text nodes via a continuous curved line."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["timeline","s-curve","alternating-nodes"],"avoid":["Unordered lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Sequential processes","Historical overviews"],"evidence_pages":["page-05"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Oversized numeral overlapping a circular emblem, positioned above a centered title.","zones":["Oversized numeral overlapping a circular emblem, positioned above a centered title."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["large-number","centered-focus","divider"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing statement echoing the cover layout's typography and corner decorations.","zones":["Centered closing statement echoing the cover layout's typography and corner decorations."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical organic corner blobs","Hexagonal geometric wireframe nodes","Dotted concentric arcs"],"optional_variants":["closing","centered-text","bookend"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Final slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are masked into perfect circles or crisp rectangles depending on the grid.
- No borders or drop shadows on image masks.

【图标与装饰】
- Monoline vector icons, matching the primary sage or mustard colors.
- Icons are frequently housed within thin-stroked circular containers.

【数据页构图】
- Serpentine timeline connecting alternating top and bottom text nodes via a continuous curved line.

【图表风格】
- Process flows use simple chevron arrows or serpentine dashed lines connecting nodes.

【章节页构图】
- Oversized numeral overlapping a circular emblem, positioned above a centered title.

【收尾页构图】
- Centered closing statement echoing the cover layout's typography and corner decorations.

【禁止】
- Avoid bright, highly saturated primary colors that break the muted Morandi theme.
- Do not use 3D effects, bevels, or heavy drop shadows.
- Avoid cluttering the center; keep decorative elements anchored to the corners.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic defenses and thesis presentations、Educational lectures、Minimalist corporate overviews。
