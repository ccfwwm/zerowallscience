# 个性朋克（10）---木七设计 · ppt模板 / linzi-punk-ppt-10-24ad06c2

## 风格ID
linzi-punk-ppt-10-24ad06c2

## 风格名称
个性朋克（10）---木七设计 · ppt模板 / linzi-punk-ppt-10-24ad06c2

## 风格描述
Edgy, zine-inspired streetwear layout featuring high-contrast black, white, and vibrant orange, with checkerboard tape and glossy distressed texture overlays.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Black backgrounds serve as the void; bright orange commands attention for structural blocks and key headers; white is used for high-contrast primary text.
- fonts: Bold, geometric sans-serif for headings (predominantly uppercase). Clean, legible sans-serif for body copy. Heavy tracking on stylistic subheaders.
- spacing: Intentional overcrowding and overlapping; elements purposefully bleed off the edges to create a chaotic, dynamic rhythm.
- shape_language: Aggressive diagonals, sharp solid rectangles, and occasional harsh circular clipping masks.
- texture: Heavy use of crumpled transparent overlays, high-contrast checkerboard patterns, and halftone motifs.
- grid: Asymmetrical and multi-layered Z-axis depth overrides traditional X/Y alignments. Diagonals frequently break orthogonal structures.
- motion_or_depth: Significant depth achieved via overlapping layers: background texture -> flat geometric shape -> isolated photographic subject -> transparent overlay -> foreground text.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「个性朋克（10）---木七设计 · ppt模板 / linzi-punk-ppt-10-24ad06c2」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Edgy, zine-inspired streetwear layout featuring high-contrast black, white, and vibrant orange, with checkerboard tape and glossy distressed texture overlays.
- 推荐配色：#000000、#FFFFFF、#DE7F32

【不可丢失的风格锚点】
- Checkerboard hazard-tape diagonal strips
- Vibrant orange accent blocks and typography
- Glossy, distressed transparent material overlays (plastic wrap effect)
- Isolated subject photography overlapping geometric shapes
- Repeated text used as background texture

【字体】
- Use heavy uppercase sans-serif for primary titles, allowing them to bleed off edges or overlap other elements.
- Rotate subheaders or decorative text along diagonal layout lines.
- Deploy semi-transparent, repeating lines of text as an intentional background texture.
- Mix stark white text on black/orange backgrounds, and black/orange text on white/silver backgrounds.

【封面页构图】
- Asymmetrical layering of diagonal text strips, checkerboard tape, flat color block, and an isolated subject cut-out, all under a glossy overlay.

【内容页构图】
- Left-aligned accent block with a subject cut-out, adjacent to a dominant right-side content panel, framed by top right diagonal tape and bottom checkerboard border.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical layering of diagonal text strips, checkerboard tape, flat color block, and an isolated subject cut-out, all under a glossy overlay.","zones":["Asymmetrical layering of diagonal text strips, checkerboard tape, flat color block, and an isolated subject cut-out, all under a glossy overlay."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["diagonal-layout","hero-cutout","texture-heavy"],"avoid":["Information-heavy summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact title slides","Brand introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_cutout","purpose":"Isolated subject photography without background","bbox":[0.2,0.2,0.4,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Split vertical layout with a massive typographic numeral/title on a stark dark background on the left, paired with a full-height image column framed by patterned tape on the right.","zones":["Split vertical layout with a massive typographic numeral/title on a stark dark background on the left, paired with a full-height image column framed by patterned tape on the right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["huge-numbers","vertical-split","image-column"],"avoid":["Body content","Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Chapter headers"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"right_column_image","purpose":"Tall, atmospheric background image","bbox":[0.55,0.0,0.45,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Left-aligned accent block with a subject cut-out, adjacent to a dominant right-side content panel, framed by top right diagonal tape and bottom checkerboard border.","zones":["Left-aligned accent block with a subject cut-out, adjacent to a dominant right-side content panel, framed by top right diagonal tape and bottom checkerboard border."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["bullet-list","split-layout","bottom-border"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Key takeaways","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"side_character","purpose":"Isolated subject or product image","bbox":[0.05,0.4,0.25,0.5],"priority":1}]},{"id":"content-comparison","composition":"Dark textured background with a large rotated vertical title on the far left, a circular masked subject near the center, and a vibrant color block containing body text on the right.","zones":["Dark textured background with a large rotated vertical title on the far left, a circular masked subject near the center, and a vibrant color block containing body text on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["vertical-title","dark-mode-accent","circular-mask"],"avoid":["High-density data sets","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Team member bios"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"background_texture","purpose":"Subtle, dark background imagery","bbox":[0.0,0.0,1.0,1.0],"priority":2},{"id":"profile_image","purpose":"Subject masked into a central shape","bbox":[0.15,0.1,0.4,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"A dark, highly textured background framing a bright, centralized rectangular container that holds a structured multi-column grid with icons, anchored by rotated side text.","zones":["A dark, highly textured background framing a bright, centralized rectangular container that holds a structured multi-column grid with icons, anchored by rotated side text."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["column-grid","central-container","icon-list"],"avoid":["Large emotive quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Pricing tiers","Service comparisons","Three-pillar strategies"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"background_texture_2","purpose":"Dark background noise/texture","bbox":[0.0,0.0,1.0,1.0],"priority":2},{"id":"bottom_right_accent","purpose":"Small cut-out accent subject","bbox":[0.75,0.5,0.25,0.5],"priority":3}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned accent block with a subject cut-out, adjacent to a dominant right-side content panel, framed by top right diagonal tape and bottom checkerboard border.","zones":["Left-aligned accent block with a subject cut-out, adjacent to a dominant right-side content panel, framed by top right diagonal tape and bottom checkerboard border."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["bullet-list","split-layout","bottom-border"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Key takeaways","Mission statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"side_character","purpose":"Isolated subject or product image","bbox":[0.05,0.4,0.25,0.5],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Horizontal split-color background (top/bottom) disrupted by a central masked subject and floating geometric elements (speech bubble, large typography).","zones":["Horizontal split-color background (top/bottom) disrupted by a central masked subject and floating geometric elements (speech bubble, large typography)."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["horizontal-split","central-focus","floating-elements"],"avoid":["Standard bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key quotes","Product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center_subject","purpose":"Subject photography mapped into a circular or custom shape","bbox":[0.4,0.2,0.4,0.75],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Massive diagonal typography stretching across the entire canvas over a patterned/textured background, concluding with an isolated subject cut-out in the bottom right corner.","zones":["Massive diagonal typography stretching across the entire canvas over a patterned/textured background, concluding with an isolated subject cut-out in the bottom right corner."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Checkerboard hazard-tape diagonal strips","Vibrant orange accent blocks and typography","Glossy, distressed transparent material overlays (plastic wrap effect)"],"optional_variants":["diagonal-hero-text","pattern-background","closing-cutout"],"avoid":["Contact detail lists","Appendices","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Final calls to action"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_hero","purpose":"Final isolated subject imagery","bbox":[0.6,0.3,0.4,0.7],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Isolate subjects from their backgrounds (cut-outs) and layer them over geometric shapes.
- Apply deep desaturation or black-and-white filters to background images to let orange accents pop.
- Overlay raw photography with glossy, crinkled transparent textures.

【图标与装饰】
- Thick, bold stroke outlines with solid flat color fills (white, orange, black).
- Encase icons in varied shapes (like speech bubbles) with stark offset drop shadows.

【数据页构图】
- A dark, highly textured background framing a bright, centralized rectangular container that holds a structured multi-column grid with icons, anchored by rotated side text.

【图表风格】
- Data containers should use flat, high-contrast geometric blocks (e.g., solid white grid lines over flat orange backgrounds).
- Avoid standard 3D effects or soft gradients; stick to flat, brutalist data visualization.

【章节页构图】
- Split vertical layout with a massive typographic numeral/title on a stark dark background on the left, paired with a full-height image column framed by patterned tape on the right.

【收尾页构图】
- Massive diagonal typography stretching across the entire canvas over a patterned/textured background, concluding with an isolated subject cut-out in the bottom right corner.

【禁止】
- Standard, symmetrical corporate layouts.
- Soft pastel color palettes or gentle gradients.
- Unedited, full-bleed stock photography without texture overlays or cut-out treatments.
- Polite, non-overlapping whitespace.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Streetwear or urban fashion pitch decks、Music festival or event sponsorships、Youth marketing campaigns、Edgy creative agency portfolios。
