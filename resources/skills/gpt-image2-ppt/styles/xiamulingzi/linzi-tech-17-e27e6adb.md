# 精选科技风17 · 模板 / linzi-tech-17-e27e6adb

## 风格ID
linzi-tech-17-e27e6adb

## 风格名称
精选科技风17 · 模板 / linzi-tech-17-e27e6adb

## 风格描述
An elegant, moody dark-mode presentation featuring high-contrast grayscale imagery, elegant serif typography, and strict circular geometric constraints.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Monochromatic system: True black background, stark white primary text and accents, mid-grey for secondary/tertiary text.
- fonts: Elegant Serif for primary English titles and oversized numbers; clean Sans-serif or delicate Mincho for body copy to maintain legibility.
- spacing: Expansive negative space, often pushing text elements to edges or creating wide gaps between columns.
- shape_language: Strictly circular (spheres, rings, masks) mixed with sharp, thin straight lines.
- texture: Smooth, high-contrast photographic gradients against solid flat black.
- grid: Flexible combinations of strict central symmetry and heavily weighted asymmetrical splits (e.g., 50/50 vertical, top/bottom text-to-image).
- motion_or_depth: Flat layout with depth implied purely through atmospheric perspective in the photography and overlapping concentric vector lines.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风17 · 模板 / linzi-tech-17-e27e6adb」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, moody dark-mode presentation featuring high-contrast grayscale imagery, elegant serif typography, and strict circular geometric constraints.
- 推荐配色：#000000、#FFFFFF、#808080

【不可丢失的风格锚点】
- Deep black backgrounds seamlessly merging with dark imagery
- Perfect circular image masks and concentric ring graphics
- High-contrast pairings of oversized serif numerals with delicate body text
- Minimalist horizontal and vertical dividing rules

【字体】
- Use oversized, elegant Serif numbers for dramatic section starts.
- Combine all-caps tracking-spaced headers with delicate, small body text.
- Utilize vertical text orientation sparingly for decorative editorial flair.
- Underline key titles with thin, elegant strokes.

【封面页构图】
- Central radial focal point with overlaid concentric line graphics and overlapping varied typography

【内容页构图】
- Three-column layout with perfect circular image masks and bottom-aligned captions

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central radial focal point with overlaid concentric line graphics and overlapping varied typography","zones":["Central radial focal point with overlaid concentric line graphics and overlapping varied typography"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["radial-cover","dark-mode","concentric"],"avoid":["Data-heavy introductions","Corporate agenda lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Cover slides","Thematic introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"center-hero","purpose":"Primary focal sphere or circular image","bbox":[0.35,0.2,0.3,0.53],"priority":1}]}
- section: {"id":"section-primary","composition":"Centered spherical graphic flanked by balanced text blocks with a heavy bottom anchor bar","zones":["Centered spherical graphic flanked by balanced text blocks with a heavy bottom anchor bar"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["chapter-divider","symmetrical","number-overlay"],"avoid":["Standard content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter title pages"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-graphic","purpose":"Background texture for the chapter number","bbox":[0.35,0.2,0.3,0.53],"priority":1}]}
- content: [{"id":"content-content","composition":"Three-column layout with perfect circular image masks and bottom-aligned captions","zones":["Three-column layout with perfect circular image masks and bottom-aligned captions"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["3-column","circular-masks","gallery"],"avoid":["Long form text","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product feature highlights","Service pillars"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-1","purpose":"Left circular feature","bbox":[0.08,0.25,0.24,0.42],"priority":1},{"id":"img-2","purpose":"Center circular feature","bbox":[0.38,0.25,0.24,0.42],"priority":2},{"id":"img-3","purpose":"Right circular feature","bbox":[0.68,0.25,0.24,0.42],"priority":3}]},{"id":"content-comparison","composition":"Dominant central graphic with diagonal-flow text elements","zones":["Dominant central graphic with diagonal-flow text elements"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["center-focus","minimalist","asymmetrical-text"],"avoid":["Multi-point lists","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Quotes","Hero concept introductions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center-float","purpose":"Isolated central concept graphic","bbox":[0.38,0.28,0.24,0.42],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Centered spherical graphic flanked by balanced text blocks with a heavy bottom anchor bar","zones":["Centered spherical graphic flanked by balanced text blocks with a heavy bottom anchor bar"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["chapter-divider","symmetrical","number-overlay"],"avoid":["Standard content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter title pages"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"center-graphic","purpose":"Background texture for the chapter number","bbox":[0.35,0.2,0.3,0.53],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-column layout with perfect circular image masks and bottom-aligned captions","zones":["Three-column layout with perfect circular image masks and bottom-aligned captions"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["3-column","circular-masks","gallery"],"avoid":["Long form text","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product feature highlights","Service pillars"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-1","purpose":"Left circular feature","bbox":[0.08,0.25,0.24,0.42],"priority":1},{"id":"img-2","purpose":"Center circular feature","bbox":[0.38,0.25,0.24,0.42],"priority":2},{"id":"img-3","purpose":"Right circular feature","bbox":[0.68,0.25,0.24,0.42],"priority":3}]}]
- closing: {"id":"closing-primary","composition":"Central radial focal point with overlaid concentric line graphics and overlapping varied typography","zones":["Central radial focal point with overlaid concentric line graphics and overlapping varied typography"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Deep black backgrounds seamlessly merging with dark imagery","Perfect circular image masks and concentric ring graphics","High-contrast pairings of oversized serif numerals with delicate body text"],"optional_variants":["radial-closing","dark-mode","concentric"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"center-hero","purpose":"Primary focal sphere or circular image","bbox":[0.35,0.2,0.3,0.53],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Convert all imagery to high-contrast black and white or deep grayscale.
- Use seamless black backgrounds in images to blend infinitely into the slide canvas.
- Apply perfect circular masks to secondary imagery to match the primary spherical motifs.

【图标与装饰】
- Avoid literal icons; use abstract geometric shapes (concentric circles, thin lines, thick anchor bars).

【数据页构图】
- Centered spherical graphic flanked by balanced text blocks with a heavy bottom anchor bar

【图表风格】
- No charts present, but any data visualization should remain strictly monochrome (white and greys on black) with thin stroke lines.

【章节页构图】
- Centered spherical graphic flanked by balanced text blocks with a heavy bottom anchor bar

【收尾页构图】
- Central radial focal point with overlaid concentric line graphics and overlapping varied typography

【禁止】
- Avoid full-color imagery, as it breaks the moody monochromatic aesthetic.
- Do not use low-contrast or bright backgrounds.
- Avoid overly complex or playful fonts; stick to elegant editorial typefaces.
- Do not use heavy drop shadows or 3D effects on text.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios or photography showcases、High-end luxury brand pitches、Editorial lookbooks、Minimalist tech or architecture presentations。
