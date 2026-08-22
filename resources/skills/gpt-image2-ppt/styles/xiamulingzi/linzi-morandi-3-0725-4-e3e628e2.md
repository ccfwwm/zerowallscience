# 4 · 3.07更新高级色25 / linzi-morandi-3-0725-4-e3e628e2

## 风格ID
linzi-morandi-3-0725-4-e3e628e2

## 风格名称
4 · 3.07更新高级色25 / linzi-morandi-3-0725-4-e3e628e2

## 风格描述
Elegant minimalist presentation using a Morandi watercolor aesthetic, featuring soft pastel accents, generous margins, and subtle typographic watermarks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary text in warm taupe/dark brown (#8B7E74). Accents in muted blue (#829DB0) and peach (#EAC6A9). Background is an off-white/light gray (#F8F8F8) with soft organic textures.
- fonts: Elegant serif for primary titles to convey sophistication, paired with clean sans-serif for body text and English subtitles.
- spacing: Wide, generous margins. Content is centrally staged, framed by the corner watercolor graphics. High ratio of negative space.
- shape_language: Soft and rounded: circles for numbering/icons, pill shapes for tags, and downward-pointing ribbons for column headers.
- texture: Granular, organic watercolor washes in the periphery contrasting with flat vector graphics in the focal areas.
- grid: Symmetrical centered layouts for covers/sections, shifting to balanced asymmetrical 2-column or 4-column grids for content.
- motion_or_depth: Flat design with depth implied only through the overlay of text on oversized, faded watermark letters and corner textures.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「4 · 3.07更新高级色25 / linzi-morandi-3-0725-4-e3e628e2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant minimalist presentation using a Morandi watercolor aesthetic, featuring soft pastel accents, generous margins, and subtle typographic watermarks.
- 推荐配色：#829DB0、#EAC6A9、#8B7E74、#F8F8F8

【不可丢失的风格锚点】
- Fluid watercolor washes serving as corner framing elements.
- Oversized, ultra-low opacity watermark typography behind primary titles.
- Soft Morandi pastel color coding (muted blue and peach/beige).
- Pill-shaped containers for secondary labels and buttons.

【字体】
- High size contrast between primary localized titles and secondary English subtitles.
- Use of very large, faint serif letters (e.g., 'C' for Chapter) as background graphics.
- Titles often accompanied by a short, thick thematic underline.
- Consistent centered alignment for section breaks and left alignment for detailed content blocks.

【封面页构图】
- Centered title lockup over subtle watermark, framed by top-right and bottom-left organic corner textures, with a pill-shaped tag.

【内容页构图】
- Asymmetrical two-column grid with a diagonal balance of image and text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title lockup over subtle watermark, framed by top-right and bottom-left organic corner textures, with a pill-shaped tag.","zones":["Centered title lockup over subtle watermark, framed by top-right and bottom-left organic corner textures, with a pill-shaped tag."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["centered","elegant","minimal"],"avoid":["Heavy data","Multiple images","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation openings","Title slides"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Central focal circle with large numeral, floating above a title lockup and a giant faded watermark letter.","zones":["Central focal circle with large numeral, floating above a title lockup and a giant faded watermark letter."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["transition","numbered","centered"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetrical two-column grid with a diagonal balance of image and text blocks.","zones":["Asymmetrical two-column grid with a diagonal balance of image and text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["diagonal-balance","image-text-pairing"],"avoid":["Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept introductions","Team or product showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-top-left","purpose":"Contextual visual for first point","bbox":[0.08,0.33,0.37,0.28],"priority":1},{"id":"image-bottom-right","purpose":"Contextual visual for second point","bbox":[0.55,0.62,0.36,0.27],"priority":2}]},{"id":"content-comparison","composition":"Three-zone layout: left-aligned descriptive text, a central oversized statistic in a circle, and a right-aligned vertical list of three numbered items.","zones":["Three-zone layout: left-aligned descriptive text, a central oversized statistic in a circle, and a right-aligned vertical list of three numbered items."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["statistic-focus","numbered-list"],"avoid":["Long paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Key performance indicators","Problem/Solution breakdowns"],"evidence_pages":["page-05"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Two-column layout: an unbordered area chart on the left and descriptive text blocks on the right.","zones":["Two-column layout: an unbordered area chart on the left and descriptive text blocks on the right."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["chart","data-storytelling"],"avoid":["Highly dense multi-metric dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Financial reviews","Trend analysis"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central focal circle with large numeral, floating above a title lockup and a giant faded watermark letter.","zones":["Central focal circle with large numeral, floating above a title lockup and a giant faded watermark letter."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["transition","numbered","centered"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Agenda transitions","Chapter headers"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing text lockup over subtle watermark, framed by top-right and bottom-left organic corner textures, mirroring the cover.","zones":["Centered closing text lockup over subtle watermark, framed by top-right and bottom-left organic corner textures, mirroring the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid watercolor washes serving as corner framing elements.","Oversized, ultra-low opacity watermark typography behind primary titles.","Soft Morandi pastel color coding (muted blue and peach/beige)."],"optional_variants":["closing","bookend","centered"],"avoid":["Any content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Rectangular images without borders or drop shadows, relying on flush alignment with adjacent text blocks.
- Images act as structural blocks within the grid, balancing text areas diagonally or horizontally.

【图标与装饰】
- Minimalist white line-art or solid shapes housed inside colored circular containers.
- Directional arrows enclosed in circles used as elegant bullet points.

【数据页构图】
- Two-column layout: an unbordered area chart on the left and descriptive text blocks on the right.

【图表风格】
- Flat, unbordered area charts using the brand's muted primary accent colors.
- Minimalist axes with muted horizontal grid lines and clean sans-serif typography for labels.
- Legend placed centrally below the chart using small square color swatches.

【章节页构图】
- Central focal circle with large numeral, floating above a title lockup and a giant faded watermark letter.

【收尾页构图】
- Centered closing text lockup over subtle watermark, framed by top-right and bottom-left organic corner textures, mirroring the cover.

【禁止】
- Do not use highly saturated or neon colors that break the Morandi harmony.
- Avoid harsh drop shadows or heavy borders on images.
- Do not clutter the corner margins; they must remain clear to let the watercolor frames breathe.
- Avoid replacing the elegant serif titles with bulky or playful fonts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios.、Elegant corporate summaries or HR culture presentations.、Cosmetics, fashion, or lifestyle brand pitching.、Minimalist academic or literary reviews.。
