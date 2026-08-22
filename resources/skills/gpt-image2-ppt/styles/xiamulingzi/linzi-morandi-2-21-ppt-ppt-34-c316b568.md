# 34 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-34-c316b568

## 风格ID
linzi-morandi-2-21-ppt-ppt-34-c316b568

## 风格名称
34 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-34-c316b568

## 风格描述
An editorial, fashion-inspired presentation system featuring organic fluid shapes, warm Morandi tones, canvas textures, and dramatic serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Textured off-white background (#F4EFEB) with dominant rust red (#A73A24) and ochre (#E49339) accents; dark brown/rust for high-contrast text.
- fonts: Dramatic, high-contrast serif for headings; clean, dense sans-serif for body copy.
- spacing: Generous margins disrupted intentionally by overlapping fluid shapes; asymmetrical padding.
- shape_language: Curved, fluid, amorphous organic blobs paired with strict rectangular image crops.
- texture: Subtle, pervasive linen/canvas grain applied to the base background.
- grid: Deconstructed columnar grids; frequent use of 1/3 and 2/3 vertical splits.
- motion_or_depth: Flat layering with depth achieved entirely through overlapping shapes, intersecting lines, and intersecting typography.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「34 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-34-c316b568」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An editorial, fashion-inspired presentation system featuring organic fluid shapes, warm Morandi tones, canvas textures, and dramatic serif typography.
- 推荐配色：#A73A24、#E49339、#C8AE95、#F4EFEB、#91442B

【不可丢失的风格锚点】
- Organic, amorphous corner shapes (blobs)
- Fine, topographic-style curved contour lines
- Canvas/linen background texture
- Large, high-contrast serif typography, often broken across lines or rotated 90 degrees
- Asymmetric split layouts with editorial photo placeholders

【字体】
- Headings use large, bold serif type, frequently breaking long words with hyphens for a blocky, editorial look.
- Section indicators often use 90-degree rotated typography anchored to edges or gutters.
- Body text is kept small, dense, and tightly tracked in a clean sans-serif to contrast with the expressive headings.

【封面页构图】
- Central aligned typography surrounded by scattered multi-colored dots and large corner organic shapes with fine contour lines.

【内容页构图】
- Asymmetric split layout with a broken headline on the left, dense central text column, and a full-height image anchored to the right edge.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central aligned typography surrounded by scattered multi-colored dots and large corner organic shapes with fine contour lines.","zones":["Central aligned typography surrounded by scattered multi-colored dots and large corner organic shapes with fine contour lines."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["abstract-cover","dotted-accent","fluid-corners"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"50/50 vertical split. Full-bleed image on the left. Right side features large vertical rotated text acting as a border, followed by a solid floating text box.","zones":["50/50 vertical split. Full-bleed image on the left. Right side features large vertical rotated text acting as a border, followed by a solid floating text box."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["vertical-split","rotated-divider","floating-text-box"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Major overviews"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"hero-left","purpose":"Mood or section introductory image","bbox":[0,0,0.45,1],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetric split layout with a broken headline on the left, dense central text column, and a full-height image anchored to the right edge.","zones":["Asymmetric split layout with a broken headline on the left, dense central text column, and a full-height image anchored to the right edge."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["asymmetric-split","broken-headline","right-image-bleed"],"avoid":["Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Executive summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-right","purpose":"Full height editorial image","bbox":[0.66,0,0.34,1],"priority":1}]},{"id":"content-comparison","composition":"Left text column with large serif headline. Right side dominated by a large rectangular image overlapping a subtle background shape. Large rotated number at bottom right.","zones":["Left text column with large serif headline. Right side dominated by a large rectangular image overlapping a subtle background shape. Large rotated number at bottom right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["rotated-number","layered-image","left-text"],"avoid":["Dense data","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Project highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-image","purpose":"Primary subject showcase","bbox":[0.35,0,0.65,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Asymmetric split layout with a broken headline on the left, dense central text column, and a full-height image anchored to the right edge.","zones":["Asymmetric split layout with a broken headline on the left, dense central text column, and a full-height image anchored to the right edge."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["asymmetric-split","broken-headline","right-image-bleed"],"avoid":["Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Introductions","Executive summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-right","purpose":"Full height editorial image","bbox":[0.66,0,0.34,1],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left text column with large serif headline. Right side dominated by a large rectangular image overlapping a subtle background shape. Large rotated number at bottom right.","zones":["Left text column with large serif headline. Right side dominated by a large rectangular image overlapping a subtle background shape. Large rotated number at bottom right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["rotated-number","layered-image","left-text"],"avoid":["Dense data","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Project highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-image","purpose":"Primary subject showcase","bbox":[0.35,0,0.65,0.7],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Dark solid monochromatic background. Left side large image. Right side prominent serif typography overlaid with fine contour lines, followed by a dense text block.","zones":["Dark solid monochromatic background. Left side large image. Right side prominent serif typography overlaid with fine contour lines, followed by a dense text block."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["dark-mode","pull-quote","contour-overlay"],"avoid":["Complex data points","copying source assets, source text, or an exact source arrangement"],"best_for":["Pull quotes","Mission statements","Impactful pauses"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"left-focus","purpose":"Subject image accompanying quote","bbox":[0,0,0.55,1],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Central rectangular image framed by a thick solid border. Extremely large typography overlapping the bottom edge of the image and the border.","zones":["Central rectangular image framed by a thick solid border. Extremely large typography overlapping the bottom edge of the image and the border."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, amorphous corner shapes (blobs)","Fine, topographic-style curved contour lines","Canvas/linen background texture"],"optional_variants":["thick-frame","cinematic-overlap","closing-statement"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Thank you pages"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"center-framed","purpose":"Final memorable image","bbox":[0.1,0.1,0.8,0.8],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into strict rectangles and placed in direct contrast to the fluid background shapes.
- Images frequently bleed off one or more edges of the slide.
- Subject matter should lean toward editorial, highly stylized portraiture or mood-focused photography to match the template's energy.

【图标与装饰】
- Template relies on typographic scale and abstract geometry rather than traditional iconography.
- Small scattered circular dots are used as decorative accents instead of icons.

【数据页构图】
- Asymmetric split layout with a broken headline on the left, dense central text column, and a full-height image anchored to the right edge.

【图表风格】
- No charts present, but data would likely utilize the ochre and rust palette with minimal grid lines and serif data labels.

【章节页构图】
- 50/50 vertical split. Full-bleed image on the left. Right side features large vertical rotated text acting as a border, followed by a solid floating text box.

【收尾页构图】
- Central rectangular image framed by a thick solid border. Extremely large typography overlapping the bottom edge of the image and the border.

【禁止】
- Avoid standard bullet points; use dense paragraph blocks instead.
- Avoid placing small body text directly over high-contrast image areas without a solid backing shape.
- Do not use generic sans-serif fonts for primary headings, as it destroys the editorial aesthetic.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion portfolios and lookbooks、Creative agency creds decks、Editorial style guides、Brand mood boards。
