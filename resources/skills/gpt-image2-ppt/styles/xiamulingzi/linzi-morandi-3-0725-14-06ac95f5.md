# 14 · 3.07更新高级色25 / linzi-morandi-3-0725-14-06ac95f5

## 风格ID
linzi-morandi-3-0725-14-06ac95f5

## 风格名称
14 · 3.07更新高级色25 / linzi-morandi-3-0725-14-06ac95f5

## 风格描述
Elegant, minimalist presentation featuring a muted Morandi palette, fluid organic background shapes, and delicate line art accents for a soft, sophisticated aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white background canvas, muted earthy pastels for primary containers and shapes, dark charcoal/grey for text (avoiding harsh pure black).
- fonts: Elegant script or transitional serif for decorative secondary accents; clean, medium-weight sans-serif or elegant serif for primary headings and body.
- spacing: Generous outer margins framed by organic background blobs; symmetrical and breathable padding within grouped content containers.
- shape_language: Highly organic and soft. Fluid background vectors, pill-shaped headers, fully rounded rectangles, and soft-edged rhombus forms.
- texture: Flat, matte vector elements layered over each other with occasional thin, monoline stroke accents (dots, lines, leaves).
- grid: Central focal points for covers and dividers; structured horizontal rows or symmetric 3-column layouts for detailed content.
- motion_or_depth: Primarily flat with subtle 2D depth created by overlapping opaque vector layers and intersecting thin lines.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「14 · 3.07更新高级色25 / linzi-morandi-3-0725-14-06ac95f5」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, minimalist presentation featuring a muted Morandi palette, fluid organic background shapes, and delicate line art accents for a soft, sophisticated aesthetic.
- 推荐配色：#F9F9F9、#8B6D6B、#E6C5BE、#B9B1A5、#989F9F、#595959

【不可丢失的风格锚点】
- Fluid, amoeba-like organic background shapes framing the canvas corners
- Muted, desaturated earthy tones (dusty rose, taupe, warm grey)
- Delicate, hand-drawn style botanical and squiggle line art accents
- Soft-cornered diamonds and heavily rounded rectangles for content housing

【字体】
- Use dark grey (#595959) instead of pure black for softer contrast.
- Center-align titles and subtitles on covers, agendas, and section dividers.
- Combine a decorative script or italicized serif for English subtitles with standard legible fonts for primary localized text.

【封面页构图】
- Centered title text flanked by large, fluid organic shapes in corners with botanical line-art accents.

【内容页构图】
- Vertical stack of three full-width, heavily rounded rectangles (pill-like) functioning as content bands.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title text flanked by large, fluid organic shapes in corners with botanical line-art accents.","zones":["Centered title text flanked by large, fluid organic shapes in corners with botanical line-art accents."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["organic-cover","centered-title","botanical-accent"],"avoid":["Data heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Welcome screen"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Large centered section title with a dominant central diamond node containing the section number, surrounded by heavier organic background framing.","zones":["Large centered section title with a dominant central diamond node containing the section number, surrounded by heavier organic background framing."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["section-divider","heavy-framing"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles"],"evidence_pages":["page-02"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Vertical stack of three full-width, heavily rounded rectangles (pill-like) functioning as content bands.","zones":["Vertical stack of three full-width, heavily rounded rectangles (pill-like) functioning as content bands."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["horizontal-bands","stacked-pills"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Sequential summaries","Mission/Vision statements"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"content-comparison","composition":"Three tall, vertically aligned rounded rectangular cards, each topped with an overlapping circular number node.","zones":["Three tall, vertically aligned rounded rectangular cards, each topped with an overlapping circular number node."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["vertical-cards","overlapping-nodes","3-column"],"avoid":["Long horizontal text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature comparisons","Service pillars","Value propositions"],"evidence_pages":["page-06"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Two-column layout with a standard grouped bar chart on the left and stacked textual descriptions on the right.","zones":["Two-column layout with a standard grouped bar chart on the left and stacked textual descriptions on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["chart-left","text-right","data-slide"],"avoid":["Overwhelmingly complex datasets (keep to core series)","copying source assets, source text, or an exact source arrangement"],"best_for":["Metric highlights","Quarterly results","Data storytelling"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered main title with four evenly spaced, rounded diamond icons acting as numbering containers, above corresponding text blocks.","zones":["Centered main title with four evenly spaced, rounded diamond icons acting as numbering containers, above corresponding text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["horizontal-list","diamond-nodes","agenda"],"avoid":["Long paragraph descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Agenda","High-level process steps"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Centered main title with four evenly spaced, rounded diamond icons acting as numbering containers, above corresponding text blocks.","zones":["Centered main title with four evenly spaced, rounded diamond icons acting as numbering containers, above corresponding text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["horizontal-list","diamond-nodes","agenda"],"avoid":["Long paragraph descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Agenda","High-level process steps"],"evidence_pages":["page-01"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Mirrors the cover design exactly but swaps title text for closing remarks, enveloped by the same fluid corner geometry.","zones":["Mirrors the cover design exactly but swaps title text for closing remarks, enveloped by the same fluid corner geometry."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, amoeba-like organic background shapes framing the canvas corners","Muted, desaturated earthy tones (dusty rose, taupe, warm grey)","Delicate, hand-drawn style botanical and squiggle line art accents"],"optional_variants":["closing","bookend-design","organic-frame"],"avoid":["Appendices","Action item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are not heavily featured, but if used, should be masked into rounded rectangles or fluid organic blobs to match the shape language.
- Apply subtle desaturation or warm photo filters to match the Morandi color scheme.

【图标与装饰】
- Use minimalist, thin-line icons (monoline style).
- Ensure icon colors are either crisp white when placed on colored backgrounds, or match the palette's muted tones when on white.

【数据页构图】
- Two-column layout with a standard grouped bar chart on the left and stacked textual descriptions on the right.

【图表风格】
- Use flat, 2D bar or line charts.
- Apply the deck's muted color palette (blue-grey, taupe, dusty rose) sequentially to data series.
- Keep axes thin and gridlines minimal to maintain the clean, airy aesthetic.

【章节页构图】
- Large centered section title with a dominant central diamond node containing the section number, surrounded by heavier organic background framing.

【收尾页构图】
- Mirrors the cover design exactly but swaps title text for closing remarks, enveloped by the same fluid corner geometry.

【禁止】
- Avoid sharp right angles or harsh geometric framing.
- Avoid highly saturated, neon, or primary colors.
- Avoid pure black backgrounds or text.
- Avoid cluttered layouts; negative space is essential to this style.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Beauty, fashion, or lifestyle brand presentations、Creative agency portfolios or pitches、Elegant corporate annual reviews、Wellness or boutique business overviews。
