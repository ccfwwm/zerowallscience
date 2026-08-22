# 优雅线条（41）---木七设计 · ppt模板 / linzi-morandi-ppt-41-1f81a055

## 风格ID
linzi-morandi-ppt-41-1f81a055

## 风格名称
优雅线条（41）---木七设计 · ppt模板 / linzi-morandi-ppt-41-1f81a055

## 风格描述
Elegant corporate presentation featuring a muted Morandi palette, abstract wavy color blocking, and clean sans-serif typography suitable for business overviews.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Muted slate blues and grays for primary fills; off-white backgrounds; high-contrast white text on dark layers
- fonts: Sleek modern sans-serif for primary content; elegant, thin sans-serif for watermarks
- spacing: Generous margins; equidistant column gutters in grid layouts
- shape_language: Contrast between organic wavy background layers and sharp/rounded geometric foreground containers
- texture: Flat color fields layered to simulate paper cutouts or abstract horizons
- grid: Modular grids based on thirds and quarters; frequent use of asymmetrical split screens
- motion_or_depth: Strictly flat depth; depth is implied purely through overlapping color bands and watermarks

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（41）---木七设计 · ppt模板 / linzi-morandi-ppt-41-1f81a055」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant corporate presentation featuring a muted Morandi palette, abstract wavy color blocking, and clean sans-serif typography suitable for business overviews.
- 推荐配色：#4C5C68、#7F8F9C、#D1D5DA、#F4F5F7

【不可丢失的风格锚点】
- Abstract, fluid horizontal color bands forming landscape-like layers
- Faint, oversized uppercase watermark typography in backgrounds
- Muted, dusty cool-toned color palette
- Strict flat design with no drop shadows

【字体】
- Centered alignment for covers and section slides
- Left-aligned body copy for content slides
- Oversized semi-transparent background text used as a graphic element
- High contrast rule: white text on slate backgrounds, dark text on light backgrounds

【封面页构图】
- Layered organic horizontal bands with centralized typography and a large background watermark

【内容页构图】
- Four-column equal-width rectangular grid with varying block colors

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Layered organic horizontal bands with centralized typography and a large background watermark","zones":["Layered organic horizontal bands with centralized typography and a large background watermark"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["abstract-cover","wavy-background","watermark-text"],"avoid":["Data presentation","Heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major deck transitions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Layered organic horizontal bands with centralized section typography","zones":["Layered organic horizontal bands with centralized section typography"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["section-divider","minimal-text"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Four-column equal-width rectangular grid with varying block colors","zones":["Four-column equal-width rectangular grid with varying block colors"],"content_capacity":{"density":"high","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["four-columns","color-blocking","pillar-layout"],"avoid":["Sequential process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature comparisons","Core pillars","Categorized lists"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"content-comparison","composition":"Asymmetrical three-zone split with a solid sidebar, central full-bleed image crop, and right-side icon text list","zones":["Asymmetrical three-zone split with a solid sidebar, central full-bleed image crop, and right-side icon text list"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["split-layout","image-column","list-with-icons"],"avoid":["Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Team introductions","Case studies"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"center-vertical-image","purpose":"contextual or lifestyle photography","bbox":[0.34,0.0,0.32,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Staggered alternating timeline with connected rounded icon containers","zones":["Staggered alternating timeline with connected rounded icon containers"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["staggered-timeline","process-flow","node-connection"],"avoid":["Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Milestones","Short timelines"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Layered organic horizontal bands with centralized section typography","zones":["Layered organic horizontal bands with centralized section typography"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["section-divider","minimal-text"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Layered organic horizontal bands returning to the cover structure with closing typography","zones":["Layered organic horizontal bands returning to the cover structure with closing typography"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Abstract, fluid horizontal color bands forming landscape-like layers","Faint, oversized uppercase watermark typography in backgrounds","Muted, dusty cool-toned color palette"],"optional_variants":["closing-slide","bookend-design","watermark-text"],"avoid":["Summary data","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Edge-to-edge bleed on at least two sides for featured images
- Sharp rectangular crops with no borders or shadows
- Use of desaturated or cool-toned imagery to match the Morandi palette

【图标与装饰】
- Minimalist white outline icons inside rounded squares or solid circles
- Consistent stroke weight matching subtitle typography

【数据页构图】
- Staggered alternating timeline with connected rounded icon containers

【图表风格】
- Flat, minimalist horizontal bar charts
- No gridlines or borders
- Direct data labeling at the end of bars
- Legend positioned cleanly at the bottom

【章节页构图】
- Layered organic horizontal bands with centralized section typography

【收尾页构图】
- Layered organic horizontal bands returning to the cover structure with closing typography

【禁止】
- Bright or highly saturated primary colors
- Drop shadows or 3D effects
- Complex, multi-colored icons
- Heavy, cluttered text blocks without sufficient line height
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Corporate summaries、Quarterly business reviews、Minimalist agency pitches、Strategic planning decks。
