# 简约质感ppt · ppt模板 / linzi-morandi-ppt-ppt-ebd67968

## 风格ID
linzi-morandi-ppt-ppt-ebd67968

## 风格名称
简约质感ppt · ppt模板 / linzi-morandi-ppt-ppt-ebd67968

## 风格描述
Minimalist editorial presentation with Morandi tones, distinct continuous stadium borders, and geometric image masks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream (#F2EDE7) for primary backgrounds, Tan (#D7C4B1) for secondary backgrounds/blocks, solid black (#121212) for all typography and lines.
- fonts: Primary headings: Extra-bold sans-serif with tight tracking. Meta/Eyebrows: Light sans-serif, uppercase, wide tracking. Body: Light sans-serif, generous line-height.
- spacing: Massive outer margins enforced by the stadium border; internal elements breathe with generous negative space.
- shape_language: Stadium/pill outlines, perfect circles, tombstone/arches, 1px hairline connectors.
- texture: Flat, matte finish; no drop shadows or gradients; reliance on solid color blocking.
- grid: Freeform editorial grid, often employing center-weighted symmetry or stark left/right split compositions.
- motion_or_depth: Strictly two-dimensional with a flat hierarchy; depth is only implied by overlapping a text layer across an image edge.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「简约质感ppt · ppt模板 / linzi-morandi-ppt-ppt-ebd67968」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist editorial presentation with Morandi tones, distinct continuous stadium borders, and geometric image masks.
- 推荐配色：#F2EDE7、#D7C4B1、#A78B71、#121212

【不可丢失的风格锚点】
- Continuous 1px black stadium (pill-shaped) border framing all slide content
- Small outlined circle motif placed consistently in the bottom right corner
- Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels
- Images constrained strictly within geometric masks (arches, circles, perfect squares)

【字体】
- Headings must be title case, extra bold, and act as primary visual anchors.
- Labels and eyebrows should be uppercase, highly tracked (letter-spaced), and minimal in size.
- Body text must remain sparse, utilizing a light weight and high line-height to maintain an airy feel.

【封面页构图】
- Center-aligned circular image mask flanked by split bold typography and rotated edge-aligned meta text.

【内容页构图】
- Right-weighted square image overlaid with massive typography, balanced by a floating starburst badge and bottom-left text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned circular image mask flanked by split bold typography and rotated edge-aligned meta text.","zones":["Center-aligned circular image mask flanked by split bold typography and rotated edge-aligned meta text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["symmetric","circular-crop","editorial-cover"],"avoid":["Content-heavy introductions","Data display","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Major section transitions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_circle","purpose":"Primary central subject image","bbox":[0.35,0.2,0.3,0.6],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical split with text on the left and a vertical color block hosting an arch-masked image on the right.","zones":["Asymmetrical split with text on the left and a vertical color block hosting an arch-masked image on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["color-block","asymmetrical","arch-crop"],"avoid":["Full width charts","Symmetrical requirements","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Chapter introductions","Product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"feature_image","purpose":"Subject portrait or hero product","bbox":[0.45,0.2,0.3,0.6],"priority":1}]}
- content: [{"id":"content-content","composition":"Right-weighted square image overlaid with massive typography, balanced by a floating starburst badge and bottom-left text.","zones":["Right-weighted square image overlaid with massive typography, balanced by a floating starburst badge and bottom-left text."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["text-overlap","badge-accent","square-crop"],"avoid":["Complex data","Multiple equally weighted images","copying source assets, source text, or an exact source arrangement"],"best_for":["Event announcements","Project showcases","Editorial highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"right_square","purpose":"Main focal image","bbox":[0.48,0.35,0.3,0.55],"priority":1}]},{"id":"content-comparison","composition":"Central vertical image flanked by a heavy left-aligned header and a subtle right-aligned body block connected by an arrow.","zones":["Central vertical image flanked by a heavy left-aligned header and a subtle right-aligned body block connected by an arrow."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["central-image","directional-arrow","high-contrast-type"],"avoid":["Dense textual information","copying source assets, source text, or an exact source arrangement"],"best_for":["Lookbook features","Detail callouts","Product focus"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"center_portrait","purpose":"Primary subject focus","bbox":[0.33,0.18,0.35,0.64],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three-column horizontal process flow using square image slots connected by thin arrows above stacked descriptive text.","zones":["Three-column horizontal process flow using square image slots connected by thin arrows above stacked descriptive text."],"content_capacity":{"density":"high","max_items":9},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["horizontal-process","three-column","step-flow"],"avoid":["More than 4 steps","Complex branching flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Process timelines","Service breakdowns","Step-by-step guides"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"step_1","purpose":"Process visual 1","bbox":[0.14,0.34,0.1,0.21],"priority":1},{"id":"step_2","purpose":"Process visual 2","bbox":[0.43,0.34,0.1,0.21],"priority":2},{"id":"step_3","purpose":"Process visual 3","bbox":[0.72,0.34,0.1,0.21],"priority":3}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central stacked typography flanked by two vertically aligned arch-masked image slots on opposite edges.","zones":["Central stacked typography flanked by two vertically aligned arch-masked image slots on opposite edges."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["arch-masks","central-text","balanced"],"avoid":["Long paragraphs","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Brand manifestos","Dual-concept comparisons"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_arch","purpose":"Supporting aesthetic image","bbox":[0.1,0.25,0.17,0.5],"priority":1},{"id":"right_arch","purpose":"Supporting aesthetic image","bbox":[0.73,0.25,0.17,0.5],"priority":2}]}]
- quote: {"id":"quote-primary","composition":"Central stacked typography flanked by two vertically aligned arch-masked image slots on opposite edges.","zones":["Central stacked typography flanked by two vertically aligned arch-masked image slots on opposite edges."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["arch-masks","central-text","balanced"],"avoid":["Long paragraphs","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statements","Brand manifestos","Dual-concept comparisons"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_arch","purpose":"Supporting aesthetic image","bbox":[0.1,0.25,0.17,0.5],"priority":1},{"id":"right_arch","purpose":"Supporting aesthetic image","bbox":[0.73,0.25,0.17,0.5],"priority":2}]}
- closing: {"id":"closing-primary","composition":"Center-aligned circular image mask flanked by an asymmetrical exit greeting and rotated edge-aligned meta text.","zones":["Center-aligned circular image mask flanked by an asymmetrical exit greeting and rotated edge-aligned meta text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Continuous 1px black stadium (pill-shaped) border framing all slide content","Small outlined circle motif placed consistently in the bottom right corner","Extreme contrast between massive, tightly tracked bold headings and tiny, tracked-out uppercase meta-labels"],"optional_variants":["closing","circular-crop","asymmetric-text"],"avoid":["Detailed contact lists","Data summarization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation closing","Contact information covers"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_circle","purpose":"Final brand image","bbox":[0.35,0.2,0.3,0.6],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Never use full-bleed images; always contain them within the inner stadium boundary.
- Use geometric crop masks: circles for covers/closings, arches/tombstones for highlights, squares for process/galleries.
- Images may be anchored to solid color blocks or float freely in negative space.

【图标与装饰】
- Virtually no traditional icons; relies instead on structural elements like 1px arrows, starburst badges, and hairline borders.

【数据页构图】
- Three-column horizontal process flow using square image slots connected by thin arrows above stacked descriptive text.

【图表风格】
- No traditional data charts present. Abstract sequences use connected square image nodes with hairline arrows.

【章节页构图】
- Asymmetrical split with text on the left and a vertical color block hosting an arch-masked image on the right.

【收尾页构图】
- Center-aligned circular image mask flanked by an asymmetrical exit greeting and rotated edge-aligned meta text.

【禁止】
- Do not break the continuous outer stadium border with content or images.
- Avoid overlapping text layers that obscure readability (as seen in the error on slide 8).
- Do not use drop shadows, gradients, or 3D effects.
- Avoid bright, saturated accent colors; stick to muted earth tones.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks and styling portfolios、Boutique agency capabilities decks、Minimalist architectural or interior design presentations、High-end lifestyle brand guidelines。
