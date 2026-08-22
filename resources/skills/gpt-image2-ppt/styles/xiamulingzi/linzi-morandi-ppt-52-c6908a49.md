# 优雅线条（52）---木七设计 · ppt模板 / linzi-morandi-ppt-52-c6908a49

## 风格ID
linzi-morandi-ppt-52-c6908a49

## 风格名称
优雅线条（52）---木七设计 · ppt模板 / linzi-morandi-ppt-52-c6908a49

## 风格描述
A minimalist, geometric presentation template featuring a muted Morandi color palette, sharp triangle accents, and clean split-screen layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds predominantly light beige (#F4F1ED) with major structural blocks in muted purple-grey (#7B7581). Accents in taupe (#D1C7C1).
- fonts: Clean, modern sans-serif typography. Titles use dark purple-grey, subtitles use medium grey. High legibility.
- spacing: Generous margins. Strict vertical alignment in lists and strong central axis in cover/section slides.
- shape_language: Sharp geometric corners (triangles) contrasted with perfectly round functional containers (circles, pills).
- texture: Completely flat and matte, relying entirely on subtle color contrasts rather than gradients or shadows.
- grid: Flexible column grid supporting 1/2 horizontal splits, 2/3 vertical splits, and centered focal compositions.
- motion_or_depth: Flat hierarchy with minimal overlap, except in decorative corner triangle clusters which layer outlined and solid shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（52）---木七设计 · ppt模板 / linzi-morandi-ppt-52-c6908a49」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, geometric presentation template featuring a muted Morandi color palette, sharp triangle accents, and clean split-screen layouts.
- 推荐配色：#F4F1ED、#7B7581、#D1C7C1、#A8A2A8

【不可丢失的风格锚点】
- Muted, low-saturation Morandi color combinations
- Asymmetric clusters of overlapping solid and outlined triangles in corners
- Pill-shaped badges for small metadata or section markers
- Clean 40/60 and 50/50 split background blocks for content segregation

【字体】
- Titles: Centered on covers, left-aligned on split layouts. Darkest contrast color.
- Body text: Left-aligned, high line-height (approx 1.5x), medium contrast.
- Badges: Uppercase, centered text inside rounded rectangle pills.

【封面页构图】
- Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped badge below the text.

【内容页构图】
- Left column containing a vertical list with circular numeric bullet points, right side featuring an interconnected abstract diagram.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped badge below the text.","zones":["Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped badge below the text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["centered","geometric-corners","minimal"],"avoid":["Data-heavy content","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major event introductions"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped section marker below.","zones":["Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped section marker below."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["section-divider","centered"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left column containing a vertical list with circular numeric bullet points, right side featuring an interconnected abstract diagram.","zones":["Left column containing a vertical list with circular numeric bullet points, right side featuring an interconnected abstract diagram."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["list","diagram","two-column"],"avoid":["High-density text","Large datasets","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Key takeaways","Feature lists"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Vertical split layout: left side full-bleed image (approx 40%), right side solid dark block with a vertical icon-based list.","zones":["Vertical split layout: left side full-bleed image (approx 40%), right side solid dark block with a vertical icon-based list."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["vertical-split","image-left","icon-list"],"avoid":["Charts","Long-form paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Service overviews","Team introductions","Visual feature lists"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"hero-left","purpose":"contextual background or subject photo","bbox":[0.0,0.25,0.4,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Vertical split layout: left side light background with custom block bar chart, right side solid dark block with a numbered vertical list.","zones":["Vertical split layout: left side light background with custom block bar chart, right side solid dark block with a numbered vertical list."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["chart","split-layout","data-visualization"],"avoid":["Complex line graphs","Large image showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Statistical overviews","Performance metrics","Comparison data"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped section marker below.","zones":["Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped section marker below."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["section-divider","centered"],"avoid":["Detailed content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- quote: {"id":"quote-primary","composition":"Vertical split layout: left side image (approx 60%), right side solid dark block with an oversized quotation graphic, text paragraph, and lower accent banner.","zones":["Vertical split layout: left side image (approx 60%), right side solid dark block with an oversized quotation graphic, text paragraph, and lower accent banner."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["vertical-split","quote","image-left"],"avoid":["Data visualization","Multi-step processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key statements","Mission statements"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"hero-left-large","purpose":"atmospheric or subject photo","bbox":[0.0,0.25,0.6,0.6],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped badge below the text.","zones":["Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped badge below the text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation Morandi color combinations","Asymmetric clusters of overlapping solid and outlined triangles in corners","Pill-shaped badges for small metadata or section markers"],"optional_variants":["closing","centered","geometric-corners"],"avoid":["New content introduction","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in strict rectangular full-bleed blocks taking up 40% to 60% of the slide width.
- No edge rounding or organic masking for photos.

【图标与装饰】
- Solid flat icons placed inside circular containers or directly on solid color blocks.
- Monochrome treatment, typically white or light beige depending on background contrast.

【数据页构图】
- Vertical split layout: left side light background with custom block bar chart, right side solid dark block with a numbered vertical list.

【图表风格】
- Simplified, custom-built bar charts using stacked rectangular blocks.
- No axis lines or complex grid backgrounds; data numbers float directly above bars.

【章节页构图】
- Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped section marker below.

【收尾页构图】
- Centered title and subtitle flanked by top-left and bottom-right overlapping triangle clusters, with a pill-shaped badge below the text.

【禁止】
- Avoid high-saturation or neon colors; strictly adhere to the muted palette.
- Avoid drop shadows, gradients, or 3D effects.
- Do not use organic or blob shapes; stick to rigid geometry.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Corporate summaries、Design portfolios、Minimalist project proposals、Quarterly reviews requiring a calm, professional aesthetic。
