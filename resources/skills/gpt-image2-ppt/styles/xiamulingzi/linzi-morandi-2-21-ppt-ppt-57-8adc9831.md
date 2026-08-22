# 57 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-57-8adc9831

## 风格ID
linzi-morandi-2-21-ppt-ppt-57-8adc9831

## 风格名称
57 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-57-8adc9831

## 风格描述
A stylish, earthy presentation template featuring Morandi tones, organic fluid shapes, botanical line art, and soft geometry.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light beige backgrounds with deep earthy brown text, accented by muted tan, terracotta, and slate blue.
- fonts: Heavy blocky sans-serif for primary titles, contrasted with clean, thin sans-serif for body text.
- spacing: Generous outer margins; centralized focal points on covers, balanced multi-column spacing.
- shape_language: Softened geometry: rounded rectangles, circles with partial thick borders, and fluid organic background shapes.
- texture: Mostly flat with hard-edged, solid-color drop shadows to simulate a subtle paper-cut or layered effect.
- grid: Flexible central axis for titles, coupled with symmetrical 2-column or 3-column content rows.
- motion_or_depth: Depth achieved through overlapping line art over solid blobs, and distinct off-set solid shadows behind floating containers.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「57 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-57-8adc9831」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A stylish, earthy presentation template featuring Morandi tones, organic fluid shapes, botanical line art, and soft geometry.
- 推荐配色：#EFEBE4、#4A3B32、#C7A17A、#5D7185、#D4A373

【不可丢失的风格锚点】
- Abstract organic background blobs in corners
- Continuous thin line art (botanical/leaves and squiggles)
- Earth-toned Morandi color palette
- Soft rounded rectangular and circular containers
- Subtle off-axis rotations for dynamic layouts

【字体】
- Titles are typically top-center aligned in a heavy, dark brown font.
- Body text is left-aligned, small, and uses muted colors.
- High contrast in font weight and scale between headers and body content.

【封面页构图】
- Center-aligned large typography framed by organic shapes and botanical line art in the corners.

【内容页构图】
- Top title, mid 3-column text, bottom split between wide image and color-block text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned large typography framed by organic shapes and botanical line art in the corners.","zones":["Center-aligned large typography framed by organic shapes and botanical line art in the corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["centered","minimal","botanical"],"avoid":["Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major section introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Mid-left aligned large section title with dominant botanical illustration on the right.","zones":["Mid-left aligned large section title with dominant botanical illustration on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["asymmetrical","transition","large-text"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Top title, mid 3-column text, bottom split between wide image and color-block text.","zones":["Top title, mid 3-column text, bottom split between wide image and color-block text."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["image-text-split","complex-layout","color-block"],"avoid":["Full-screen charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Product highlights","Case study summaries"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"bottom-left-image","purpose":"contextual background or lifestyle image","bbox":[0.05,0.43,0.65,0.45],"priority":1}]},{"id":"content-comparison","composition":"Three-column layout with bold circular icons featuring a thick outer arc.","zones":["Three-column layout with bold circular icons featuring a thick outer arc."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["3-column","iconography","circular-motif"],"avoid":["Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Value propositions","Process steps","Feature highlights"],"evidence_pages":["page-03"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Flat, multi-series column chart on the left, descriptive text block stack on the right.","zones":["Flat, multi-series column chart on the left, descriptive text block stack on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["bar-chart","side-by-side","minimal-data"],"avoid":["Highly granular, complex datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Quarterly summaries","Comparative metrics","Performance reviews"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Mid-left aligned large section title with dominant botanical illustration on the right.","zones":["Mid-left aligned large section title with dominant botanical illustration on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["asymmetrical","transition","large-text"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Center-aligned large typography framed by organic shapes and botanical line art in the corners.","zones":["Center-aligned large typography framed by organic shapes and botanical line art in the corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Abstract organic background blobs in corners","Continuous thin line art (botanical/leaves and squiggles)","Earth-toned Morandi color palette"],"optional_variants":["centered","minimal","botanical"],"avoid":["Data or detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Thank you slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped into rounded rectangles.
- Often rotated slightly off-axis to create a scrapbook or scattered arrangement.
- Framed by the organic background elements rather than strict grids.

【图标与装饰】
- Flat, solid white icons placed centrally inside colored shapes (circles or rounded squares).
- Icons often feature a solid contrasting drop shadow matching the main container style.

【数据页构图】
- Flat, multi-series column chart on the left, descriptive text block stack on the right.

【图表风格】
- Flat, minimalist data visualization matching the Morandi palette.
- Bar charts use direct value labels floating above bars, no gridlines.
- Diagrams (like funnels) use stacked, color-coded segments.

【章节页构图】
- Mid-left aligned large section title with dominant botanical illustration on the right.

【收尾页构图】
- Center-aligned large typography framed by organic shapes and botanical line art in the corners.

【禁止】
- Avoid harsh primary colors (pure red, blue, green).
- Do not use sharp-cornered rectangles for image containers.
- Avoid heavy borders or outlines on text boxes.
- Do not center-align multi-line body text blocks.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Fashion or lifestyle brand reports、Modern HR or internal company updates、Aesthetic event planning proposals。
