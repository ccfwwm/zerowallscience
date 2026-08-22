# 优雅线条（22）---木七设计 · ppt模板 / linzi-morandi-ppt-22-e3f0e8a1

## 风格ID
linzi-morandi-ppt-22-e3f0e8a1

## 风格名称
优雅线条（22）---木七设计 · ppt模板 / linzi-morandi-ppt-22-e3f0e8a1

## 风格描述
Elegant, minimalist template utilizing organic shapes, a Morandi color palette, and high-contrast typography for fashion or lifestyle presentations.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light grey/beige background (#E4E1DF) dominates. Slate blue (#5E717B) and Terracotta (#CA7A44) act as primary accents for shapes and key text. Sand (#DECAB2) and Dusty Lavender (#B3B5C0) provide secondary background layering.
- fonts: Elegant transitional Serif for headings. Clean geometric Sans-serif for body copy. Flowing Script for quotes and stylistic accents.
- spacing: Generous macro whitespace. Elements are loosely clustered. Outer margins are defined by the vertical edge-text framing.
- shape_language: Contrast between perfectly rectangular image placeholders and fluid, organic background blobs.
- texture: Flat, matte vector shapes with no gradients or drop shadows. Clean digital aesthetic.
- grid: Asymmetrical, free-flowing layouts anchored by consistent edge framing rather than strict column grids.
- motion_or_depth: Shallow depth created by overlapping flat vector blobs and occasional text overlapping image edges.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（22）---木七设计 · ppt模板 / linzi-morandi-ppt-22-e3f0e8a1」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, minimalist template utilizing organic shapes, a Morandi color palette, and high-contrast typography for fashion or lifestyle presentations.
- 推荐配色：#E4E1DF、#5E717B、#CA7A44、#DECAB2、#B3B5C0、#4A4A4A

【不可丢失的风格锚点】
- Organic, overlapping amoeba-like background vector blobs.
- Vertical tracking text aligned to the far left and right screen edges.
- Prominent, oversized serif typography for numbers and section markers in slide corners.
- High-contrast mix of classic serif headings with handwritten script accents.

【字体】
- Use two-tone styling in headers (e.g., Slate Blue and Terracotta).
- Body text should be sans-serif, dark grey, with generous line height.
- Employ script fonts sparingly for short quotes or decorative subtitles.
- Use rotated (vertical) text at the screen edges for subtle branding/framing.

【封面页构图】
- Central cluster of overlapping organic blobs containing a prominent circular monogram, flanked by vertical edge text.

【内容页构图】
- Split asymmetric layout with a bleeding image on the left and a stacked image/text block on the right, featuring an overlapping solid text box.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central cluster of overlapping organic blobs containing a prominent circular monogram, flanked by vertical edge text.","zones":["Central cluster of overlapping organic blobs containing a prominent circular monogram, flanked by vertical edge text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["minimal","blob-background","centered"],"avoid":["Data-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Three-column text layout with a large two-tone serif header on the left and a script quote on the right, anchored by corner blobs.","zones":["Three-column text layout with a large two-tone serif header on the left and a script quote on the right, anchored by corner blobs."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["text-heavy","three-column","typographic-hierarchy"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive summaries","Core principles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split asymmetric layout with a bleeding image on the left and a stacked image/text block on the right, featuring an overlapping solid text box.","zones":["Split asymmetric layout with a bleeding image on the left and a stacked image/text block on the right, featuring an overlapping solid text box."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["split-layout","image-overlap","asymmetrical"],"avoid":["Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Feature introductions"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"image-left","purpose":"Abstract or supporting image","bbox":[0.25,0.1,0.29,0.78],"priority":2},{"id":"image-right","purpose":"Primary contextual image","bbox":[0.58,0.0,0.26,0.58],"priority":1}]},{"id":"content-comparison","composition":"Asymmetrical gallery with one tall image on the left and two smaller images scattered on the right, interspersed with headers and short text.","zones":["Asymmetrical gallery with one tall image on the left and two smaller images scattered on the right, interspersed with headers and short text."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["masonry-gallery","asymmetrical","mixed-media"],"avoid":["Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Product collections","Lookbooks"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"hero-left","purpose":"Primary portrait or vertical feature","bbox":[0.03,0.0,0.36,0.88],"priority":1},{"id":"secondary-center","purpose":"Supporting image","bbox":[0.45,0.45,0.24,0.55],"priority":2},{"id":"secondary-right","purpose":"Supporting image","bbox":[0.74,0.62,0.26,0.38],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Three-column text layout with a large two-tone serif header on the left and a script quote on the right, anchored by corner blobs.","zones":["Three-column text layout with a large two-tone serif header on the left and a script quote on the right, anchored by corner blobs."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["text-heavy","three-column","typographic-hierarchy"],"avoid":["Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive summaries","Core principles"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Central solid square block containing script text, with an oversized quotation mark icon intersecting the top edge.","zones":["Central solid square block containing script text, with an oversized quotation mark icon intersecting the top edge."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["quote","central-focus","minimal"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Impact statements"],"evidence_pages":["page-02"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Central solid square block containing script text, with an oversized quotation mark icon intersecting the top edge.","zones":["Central solid square block containing script text, with an oversized quotation mark icon intersecting the top edge."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["quote","central-focus","minimal"],"avoid":["Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Impact statements"],"evidence_pages":["page-02"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Purely abstract composition consisting solely of scattered organic blobs in the established color palette.","zones":["Purely abstract composition consisting solely of scattered organic blobs in the established color palette."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, overlapping amoeba-like background vector blobs.","Vertical tracking text aligned to the far left and right screen edges.","Prominent, oversized serif typography for numbers and section markers in slide corners."],"optional_variants":["abstract-pattern","closing","shapes-only"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Transitions","Background plates"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Keep image frames strictly rectangular to contrast with organic background shapes.
- Allow images to occasionally break the margin or bleed to the edge in collage layouts.
- Use solid-color geometric blocks (rectangles/squares) overlapping images to hold prominent text.

【图标与装饰】
- Minimal use of traditional icons. Rely on oversized punctuation (quotation marks) as graphic elements.

【数据页构图】
- Three-column text layout with a large two-tone serif header on the left and a script quote on the right, anchored by corner blobs.

【图表风格】
- No explicit charts provided, but data visualization should use flat, solid Morandi colors without borders or 3D effects.

【章节页构图】
- Three-column text layout with a large two-tone serif header on the left and a script quote on the right, anchored by corner blobs.

【收尾页构图】
- Purely abstract composition consisting solely of scattered organic blobs in the established color palette.

【禁止】
- Avoid harsh primary colors; stick to muted, desaturated tones.
- Do not use rounded rectangles or circles for images; keep them sharp-edged.
- Avoid heavy drop shadows or gradients on background shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks or portfolio presentations.、Lifestyle brand guidelines.、Elegant product showcases.、Creative agency creds decks.。
