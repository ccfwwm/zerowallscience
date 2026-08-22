# 15 · 3.07更新高级色25 / linzi-morandi-3-0725-15-efd2db47

## 风格ID
linzi-morandi-3-0725-15-efd2db47

## 风格名称
15 · 3.07更新高级色25 / linzi-morandi-3-0725-15-efd2db47

## 风格描述
An elegant, academic-style presentation using muted 'Morandi' tones, organic brushstroke framing, and clean serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white background with muted red, mauve, and tan accents; dark grey text for optimal readability without harsh contrast.
- fonts: Elegant Serif for primary titles to convey an academic or artistic mood; clean Sans-serif for body text and numeric accents.
- spacing: Generous central whitespace framed by heavy edge textures; vertical lists are evenly distributed.
- shape_language: A mix of organic, rough edges (brushstrokes) and soft, disciplined geometric shapes (circles, rounded rectangles).
- texture: Prominent dry-brush painted textures functioning as border/framing elements.
- grid: Primarily centered alignments for titles, transitioning to standard two-column or four-column horizontal grids for data and lists.
- motion_or_depth: Strictly flat design relying on color blocking and texture rather than drop shadows or overlapping depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「15 · 3.07更新高级色25 / linzi-morandi-3-0725-15-efd2db47」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, academic-style presentation using muted 'Morandi' tones, organic brushstroke framing, and clean serif typography.
- 推荐配色：#F9F8F6、#B7776F、#D6B99E、#9A808A、#646363

【不可丢失的风格锚点】
- Organic, painted brushstroke framing on slide corners/edges
- Muted, low-saturation 'Morandi' color palette
- Pill-shaped badges and circular enumerators
- High-contrast solid color content blocks

【字体】
- Centered, prominent Serif titles for cover and section slides.
- Muted dark grey font color instead of pure black for a softer aesthetic.
- Consistent use of numbered lists with matching circular background shapes.
- Small descriptive text beneath main titles restricted to narrow line lengths for readability.

【封面页构图】
- Centered dual-level typography framed by asymmetrical organic textures in four corners, anchored by two pill-shaped bottom containers.

【内容页构图】
- Split 50/50 layout with a vertical media slot on the left and a solid-colored vertical list block on the right, capped by a top title.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered dual-level typography framed by asymmetrical organic textures in four corners, anchored by two pill-shaped bottom containers.","zones":["Centered dual-level typography framed by asymmetrical organic textures in four corners, anchored by two pill-shaped bottom containers."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["centered","framed","minimal"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Opening statements"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered typography with a brief paragraph below, anchored by a dark rounded-rectangle badge, framed asymmetrically by edge textures.","zones":["Centered typography with a brief paragraph below, anchored by a dark rounded-rectangle badge, framed asymmetrically by edge textures."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["section-divider","text-focused"],"avoid":["Complex lists","Imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split 50/50 layout with a vertical media slot on the left and a solid-colored vertical list block on the right, capped by a top title.","zones":["Split 50/50 layout with a vertical media slot on the left and a solid-colored vertical list block on the right, capped by a top title."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["split-layout","image-left","list-right"],"avoid":["Data charts","Heavy text paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Image + text pairing","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"content-image-left","purpose":"contextual photography","bbox":[0.06,0.21,0.32,0.69],"priority":1}]},{"id":"content-comparison","composition":"Left-aligned composite vector graphic paired with a dense 2x3 numeric text grid on the right, under a centered top heading.","zones":["Left-aligned composite vector graphic paired with a dense 2x3 numeric text grid on the right, under a centered top heading."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["vector-graphic","two-column-list","dense-data"],"avoid":["Single focal points","Photographic showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Multi-faceted concepts","Brainstorming outcomes"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Top half contains a clustered column chart; bottom half features a 3-column horizontal text list with numbered circular icons.","zones":["Top half contains a clustered column chart; bottom half features a 3-column horizontal text list with numbered circular icons."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["chart-top","list-bottom","comparative"],"avoid":["Text-only content","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparative statistics","Data with explanations"],"evidence_pages":["page-05"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered typography with a brief paragraph below, anchored by a dark rounded-rectangle badge, framed asymmetrically by edge textures.","zones":["Centered typography with a brief paragraph below, anchored by a dark rounded-rectangle badge, framed asymmetrically by edge textures."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["section-divider","text-focused"],"avoid":["Complex lists","Imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter introductions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered typography with dual bottom pill containers and 4-corner texture framing, identical to the cover slide.","zones":["Centered typography with dual bottom pill containers and 4-corner texture framing, identical to the cover slide."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, painted brushstroke framing on slide corners/edges","Muted, low-saturation 'Morandi' color palette","Pill-shaped badges and circular enumerators"],"optional_variants":["closing","bookend"],"avoid":["Data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slides"],"evidence_pages":["page-08"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used sparingly, placed in stark rectangular crop blocks that contrast with the organic brushstrokes.
- Images are not blended; they maintain sharp edges within the soft-toned layouts.

【图标与装饰】
- Minimalist white line-art icons used primarily within solid colored blocks.
- Large typography numbers used as primary iconography for list elements.

【数据页构图】
- Top half contains a clustered column chart; bottom half features a 3-column horizontal text list with numbered circular icons.

【图表风格】
- Bar charts use the primary muted palette (red, tan, mauve).
- Clean, minimalist axes with no background grid lines.
- Flat, non-3D columns.

【章节页构图】
- Centered typography with a brief paragraph below, anchored by a dark rounded-rectangle badge, framed asymmetrically by edge textures.

【收尾页构图】
- Centered typography with dual bottom pill containers and 4-corner texture framing, identical to the cover slide.

【禁止】
- Using highly saturated or neon colors that break the Morandi palette (e.g., the bright red on the promo slide).
- Overcrowding the center with text, which disrupts the airy, bordered layout style.
- Using aggressive 3D effects or drop shadows.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic thesis defense、Artistic or design portfolio presentations、Humanities or psychology lectures、Boutique brand proposals。
