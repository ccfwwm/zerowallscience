# 精选科技风4 · 模板 / linzi-tech-4-a92d53b4

## 风格ID
linzi-tech-4-a92d53b4

## 风格名称
精选科技风4 · 模板 / linzi-tech-4-a92d53b4

## 风格描述
A futuristic, dark-mode presentation theme featuring neon cyan and purple glowing waves, floating wireframe containers, and strong tech-focused aesthetics.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background is deep navy/black. Text is pure white or light grey. Accents and borders use cyan-to-purple gradients.
- fonts: Clean, modern sans-serif. Headings often thin or light weights. Accent numerals use heavy/bold weights with gradient fills.
- spacing: Airy and symmetrical. Centralized clusters with wide margins to let the glowing background waves breathe.
- shape_language: A mix of organic, sweeping curves (background) and sharp, geometric containers with glowing edges (foreground).
- texture: Smooth digital luminescence, soft radial glows, and overlapping light trails.
- grid: Mostly 12-column symmetrical setups. Heavy use of 4-column feature horizontal rows and 50/50 splits.
- motion_or_depth: Deep spatial depth achieved through overlapping glowing lines receding into darkness, with foreground elements floating via outer glows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风4 · 模板 / linzi-tech-4-a92d53b4」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A futuristic, dark-mode presentation theme featuring neon cyan and purple glowing waves, floating wireframe containers, and strong tech-focused aesthetics.
- 推荐配色：#0b0c16、#00d2ff、#7b2cbf、#1e223d、#ffffff

【不可丢失的风格锚点】
- Dark space-blue backgrounds with sweeping, intersecting neon wave vectors
- Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)
- Gradient-filled UI accents like pill buttons, node stems, and image corner-tags
- High-contrast thin white sans-serif typography against dark backdrops

【字体】
- Slide titles are centered at the top, bordered by subtle horizontal accent lines.
- Main body text is highly legible, strictly left-aligned within its local container.
- Oversized numbers are used as structural anchors, often filled with cyan-to-purple gradients.

【封面页构图】
- Centered hierarchical layout with upper numeric logo placeholder, main title, subtitle, and bottom pill-shaped container over glowing wave background.

【内容页构图】
- Three staggered, circular wireframe nodes with outer glows, connected by an underlying sweeping curve.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered hierarchical layout with upper numeric logo placeholder, main title, subtitle, and bottom pill-shaped container over glowing wave background.","zones":["Centered hierarchical layout with upper numeric logo placeholder, main title, subtitle, and bottom pill-shaped container over glowing wave background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["centered","neon-glow","hero"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"50/50 horizontal split with left-aligned full-bleed image and right-aligned gradient block containing text.","zones":["50/50 horizontal split with left-aligned full-bleed image and right-aligned gradient block containing text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["split-screen","gradient-fill","image-left"],"avoid":["Multi-metric dashboards","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Company introductions","Hero statements with imagery"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-split","purpose":"contextual real image","bbox":[0.07,0.24,0.39,0.46],"priority":1}]}
- content: [{"id":"content-content","composition":"Three staggered, circular wireframe nodes with outer glows, connected by an underlying sweeping curve.","zones":["Three staggered, circular wireframe nodes with outer glows, connected by an underlying sweeping curve."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["circular-nodes","staggered","flow"],"avoid":["Long paragraphs","Strictly linear timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Three-pillar feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Four-column horizontal array where top text blocks are anchored to bottom glowing dots via vertical gradient stems.","zones":["Four-column horizontal array where top text blocks are anchored to bottom glowing dots via vertical gradient stems."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["vertical-stems","four-column","timeline"],"avoid":["Complex nested data","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Four-step processes","Feature matrices"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Central layered isometric graphic with four radial text callouts positioned in corners.","zones":["Central layered isometric graphic with four radial text callouts positioned in corners."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["isometric","radial-callouts","layers"],"avoid":["Sequential steps","Heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Architecture diagrams","Core component breakdowns"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: 50/50 horizontal split with left-aligned full-bleed image and right-aligned gradient block containing text.","zones":["50/50 horizontal split with left-aligned full-bleed image and right-aligned gradient block containing text."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["split-screen","gradient-fill","image-left"],"avoid":["Multi-metric dashboards","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Company introductions","Hero statements with imagery"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-split","purpose":"contextual real image","bbox":[0.07,0.24,0.39,0.46],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Giant centered gradient text flanked by futuristic glowing arrow brackets.","zones":["Giant centered gradient text flanked by futuristic glowing arrow brackets."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Dark space-blue backgrounds with sweeping, intersecting neon wave vectors","Thin, glowing outlines and wireframe geometric containers (circles, ribbons, speech bubbles)","Gradient-filled UI accents like pill buttons, node stems, and image corner-tags"],"optional_variants":["closing","gradient-text","minimalist"],"avoid":["Any body copy","Contact detail lists (unless added below)","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are kept in sharp-cornered rectangles.
- Often decorated with overlapping, angled gradient blocks (corner tags) at the bottom left.
- Used either as full-bleed split panels or staggered floating thumbnails.

【图标与装饰】
- Minimalist, thin-line stroke icons.
- Rendered in white or cyan.
- Often enclosed in subtle wireframe circles or placed at the peak of structural nodes.

【数据页构图】
- Central layered isometric graphic with four radial text callouts positioned in corners.

【图表风格】
- Data is represented conceptually via connected floating nodes, tiered isometric layers, or vertical timeline stems rather than traditional axes.
- Comparisons use offset, visually opposing geometric shapes (e.g., up/down speech bubbles).

【章节页构图】
- 50/50 horizontal split with left-aligned full-bleed image and right-aligned gradient block containing text.

【收尾页构图】
- Giant centered gradient text flanked by futuristic glowing arrow brackets.

【禁止】
- Avoid flat, opaque pastel or earth-tone colors that break the neon/cyber aesthetic.
- Do not use heavy, decorative serif fonts.
- Avoid placing heavy text blocks directly over the brightest intersections of the background waves.
- Do not use soft drop-shadows; rely on outer glows instead.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Tech startup pitch decks、Cybersecurity or cloud computing overviews、Annual innovation or future-trends reports、Software or digital product showcases。
