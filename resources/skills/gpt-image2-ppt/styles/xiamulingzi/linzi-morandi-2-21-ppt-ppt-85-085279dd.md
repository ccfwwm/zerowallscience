# 85 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-85-085279dd

## 风格ID
linzi-morandi-2-21-ppt-ppt-85-085279dd

## 风格名称
85 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-85-085279dd

## 风格描述
An elegant, minimalist presentation featuring a muted 'Morandi' color palette, overlapping typography, and consistent geometric framing.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds bounded by color-blocked angular margins in taupe and beige. Text in dark warm grey.
- fonts: Clean sans-serif typography. Heavy, bold font for large numeric markers, lighter weights for body text.
- spacing: Generous margins forced by the geometric framing. Centralized focal areas with wide padding between grid items.
- shape_language: Contrast between the angular, sharp-edged page borders and the strictly circular content containers (icons, image masks).
- texture: Flat, matte colors with zero drop-shadows, creating a modern, print-like aesthetic.
- grid: Symmetrical 2-column and 4-column divisions for content, anchored by a consistent top-left section header.
- motion_or_depth: Strictly flat hierarchy. Depth is only suggested through the overlapping text elements (e.g., subtitle behind primary title).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「85 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-85-085279dd」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation featuring a muted 'Morandi' color palette, overlapping typography, and consistent geometric framing.
- 推荐配色：#b8a6a6、#eae0d7、#d8cdc8、#ffffff、#8a7b7a

【不可丢失的风格锚点】
- Muted earth-tone/pastel color palette
- Angular, trapezoidal border frames on slide edges
- Overlapping semi-transparent subtitle text behind main titles
- Circular iconography and image masks

【字体】
- Use large, bold sans-serif for numbers (e.g., '01', '20XX').
- Overlay secondary/English text lightly behind primary titles for a layered effect.
- Keep body text small, well-leaded, and in a muted dark grey rather than stark black.

【封面页构图】
- Centered title and large numeric indicator flanked by geometric top and bottom border frames.

【内容页构图】
- Top-left header, left-aligned rectangular image, right-aligned text block, bottom row of icon-text pairs.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and large numeric indicator flanked by geometric top and bottom border frames.","zones":["Centered title and large numeric indicator flanked by geometric top and bottom border frames."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["minimalist-cover","geometric-frame","large-typography"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Major section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items.","zones":["Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["agenda","2x2-grid","numbered-list"],"avoid":["Deep explanatory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Key takeaways summary"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Top-left header, left-aligned rectangular image, right-aligned text block, bottom row of icon-text pairs.","zones":["Top-left header, left-aligned rectangular image, right-aligned text block, bottom row of icon-text pairs."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["image-left","text-right","icon-footer"],"avoid":["Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product feature highlights","Case study summaries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-image-left","purpose":"Visual anchor for text content","bbox":[0.05,0.27,0.35,0.43],"priority":1}]},{"id":"content-comparison","composition":"Four-column layout with a top row of rectangular images and a bottom row of titles and text.","zones":["Four-column layout with a top row of rectangular images and a bottom row of titles and text."],"content_capacity":{"density":"high","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["4-column","image-grid","gallery"],"avoid":["Long continuous reading text","copying source assets, source text, or an exact source arrangement"],"best_for":["Service offerings","Portfolio galleries","Step-by-step visuals"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"col1-img","purpose":"Column 1 visual","bbox":[0.04,0.25,0.21,0.25],"priority":1},{"id":"col2-img","purpose":"Column 2 visual","bbox":[0.28,0.25,0.21,0.25],"priority":2},{"id":"col3-img","purpose":"Column 3 visual","bbox":[0.51,0.25,0.21,0.25],"priority":3},{"id":"col4-img","purpose":"Column 4 visual","bbox":[0.75,0.25,0.21,0.25],"priority":4}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned grouped bar chart paired with a vertical stack of three icon-text legend blocks on the right.","zones":["Left-aligned grouped bar chart paired with a vertical stack of three icon-text legend blocks on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["bar-chart","data-visualization","custom-legend"],"avoid":["Complex text narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Performance metrics","Quarterly results","Categorical comparisons"],"evidence_pages":["page-05"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items.","zones":["Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["agenda","2x2-grid","numbered-list"],"avoid":["Deep explanatory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Key takeaways summary"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items.","zones":["Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["agenda","2x2-grid","numbered-list"],"avoid":["Deep explanatory text","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Key takeaways summary"],"evidence_pages":["page-01"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Minimalist centered text with large numeric typography and smaller bilingual closing message, framed by corner geometric shapes.","zones":["Minimalist centered text with large numeric typography and smaller bilingual closing message, framed by corner geometric shapes."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted earth-tone/pastel color palette","Angular, trapezoidal border frames on slide edges","Overlapping semi-transparent subtitle text behind main titles"],"optional_variants":["closing","minimalist","bookend"],"avoid":["Any content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use standard rectangular full-bleed crops for banners.
- Use perfect circle masks for profile or feature images.
- Images should ideally match the low-contrast, muted aesthetic of the deck.

【图标与装饰】
- Monoline white icons placed centrally inside solid circular backgrounds.
- Background circles map directly to the presentation's muted color palette.

【数据页构图】
- Left-aligned grouped bar chart paired with a vertical stack of three icon-text legend blocks on the right.

【图表风格】
- Flat, borderless bar charts.
- Colors of data series strictly adhere to the overall Morandi palette (taupe, beige, dusty rose).
- Minimal axes, relying on direct data labels or clear legends.

【章节页构图】
- Left-aligned dominant title with overlapping text, paired with a 2x2 grid of numbered items.

【收尾页构图】
- Minimalist centered text with large numeric typography and smaller bilingual closing message, framed by corner geometric shapes.

【禁止】
- Avoid primary or highly saturated colors.
- No 3D effects, gradients, or drop shadows.
- Do not break the geometric frame created by the top/bottom angular shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Annual reports、Minimalist business proposals、Creative portfolio reviews、Design or fashion marketing pitches。
