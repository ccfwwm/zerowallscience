# 93 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-93-b3625d4b

## 风格ID
linzi-morandi-2-21-ppt-ppt-93-b3625d4b

## 风格名称
93 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-93-b3625d4b

## 风格描述
An elegant, minimalist template featuring a Morandi color palette, vertical typography, and stylized geometric diagrams, framed by vintage floral elements.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds are off-white (#F3F1EC). Accents and shapes use a gradient of earthy, muted tones from dark plum (#765C60) to warm brown (#A7826E) and light taupe (#B29F98). Text is typically dark for headings and lighter grey for body.
- fonts: Elegant serif fonts used for primary display text, often oriented vertically. Secondary text utilizes clean, readable serif or sans-serif, kept intentionally small.
- spacing: Very airy, relying on large margins and significant negative space to create a calm, uncluttered feel.
- shape_language: A mix of organic teardrop shapes, strict circles, and sharp geometric forms (triangles, diamonds) used as content containers or data representations.
- texture: Flat color fills combined with photographic elements (if present) that have a vintage, slightly desaturated or grainy treatment.
- grid: Loose, asymmetrical grid. Content is often center-aligned or offset to balance background imagery.
- motion_or_depth: Strictly flat design. No shadows or gradients; depth is implied only by the layering of flat shapes or overlapping device mockups.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「93 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-93-b3625d4b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist template featuring a Morandi color palette, vertical typography, and stylized geometric diagrams, framed by vintage floral elements.
- 推荐配色：#F3F1EC、#765C60、#A7826E、#B29F98、#D2D2CE

【不可丢失的风格锚点】
- Muted, earthy Morandi color palette
- Vertical, elegant serif typography for major headings
- Minimalist geometric data visualizations (triangles, segmented donuts)
- Asymmetrical, loose layouts with high negative space
- Delicate line accents with circular terminators

【字体】
- Use vertical text orientation for main titles on cover, section, and closing slides.
- Keep body text font sizes small to maintain a minimalist aesthetic.
- Ensure high contrast for readability; avoid the very light grey body text seen in some examples.
- Use fine lines with open circle ends as decorative anchors near vertical text.

【封面页构图】
- Center-right vertical typography, asymmetrical decorative lines, bottom-left square image slot.

【内容页构图】
- 2x2 grid of teardrop-shaped icon containers with adjacent right-aligned text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-right vertical typography, asymmetrical decorative lines, bottom-left square image slot.","zones":["Center-right vertical typography, asymmetrical decorative lines, bottom-left square image slot."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["vertical-text","minimal","asymmetrical"],"avoid":["Long titles","Detailed subtitles","copying source assets, source text, or an exact source arrangement"],"best_for":["Title presentation","Setting aesthetic mood"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bottom-left-square","purpose":"Mood or texture image","bbox":[0.05,0.6,0.25,0.4],"priority":1}]}
- section: {"id":"section-primary","composition":"Center-left vertical typography, bottom-right square image slot.","zones":["Center-left vertical typography, bottom-right square image slot."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["vertical-text","minimal","mirrored-layout"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introduction","Chapter markers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bottom-right-square","purpose":"Section theme image","bbox":[0.7,0.6,0.25,0.4],"priority":1}]}
- content: [{"id":"content-content","composition":"2x2 grid of teardrop-shaped icon containers with adjacent right-aligned text.","zones":["2x2 grid of teardrop-shaped icon containers with adjacent right-aligned text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["icon-grid","teardrop-shapes","2x2"],"avoid":["Sequential processes","Heavy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Key features","Service offerings","Core values"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"content-comparison","composition":"Horizontal array of four geometric cross-shapes, text centered below each.","zones":["Horizontal array of four geometric cross-shapes, text centered below each."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["horizontal-list","custom-shapes","4-columns"],"avoid":["Long text descriptions","More than five items","copying source assets, source text, or an exact source arrangement"],"best_for":["Four-step processes","Parallel concepts","Product pillars"],"evidence_pages":["page-06"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Left-aligned hierarchical tree diagram using circular nodes, right-aligned legend/text.","zones":["Left-aligned hierarchical tree diagram using circular nodes, right-aligned legend/text."],"content_capacity":{"density":"medium","max_items":10},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["hierarchy","tree-diagram","circular-nodes"],"avoid":["Continuous data","Time-based processes","copying source assets, source text, or an exact source arrangement"],"best_for":["Organizational charts","Decision trees","Categorization"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Center-left vertical typography, bottom-right square image slot.","zones":["Center-left vertical typography, bottom-right square image slot."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["vertical-text","minimal","mirrored-layout"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introduction","Chapter markers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bottom-right-square","purpose":"Section theme image","bbox":[0.7,0.6,0.25,0.4],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Center-right vertical typography, asymmetrical decorative lines, bottom-left square image slot.","zones":["Center-right vertical typography, asymmetrical decorative lines, bottom-left square image slot."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy Morandi color palette","Vertical, elegant serif typography for major headings","Minimalist geometric data visualizations (triangles, segmented donuts)"],"optional_variants":["vertical-text","minimal","bookend"],"avoid":["Summaries","Calls to action requiring heavy text","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Final contact info (if brief)"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bottom-left-square-closing","purpose":"Mood or texture image","bbox":[0.05,0.6,0.25,0.4],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should follow the desaturated, low-contrast, vintage aesthetic of the template.
- Use geometric crops (squares, phone screens) for embedded imagery.
- Avoid edge-to-edge photos; use images as localized elements within the ample white space.

【图标与装饰】
- Icons should be solid white, placed inside colored geometric or organic shapes.
- Keep icon styles simple, flat, and consistent in weight.

【数据页构图】
- Left-aligned hierarchical tree diagram using circular nodes, right-aligned legend/text.

【图表风格】
- Abstract data using pure geometric shapes (e.g., overlapping triangles for area charts, segmented donuts for pie charts).
- Remove traditional axes and gridlines; use floating text labels and simple connecting lines.
- Color-code data series strictly using the defined Morandi palette.

【章节页构图】
- Center-left vertical typography, bottom-right square image slot.

【收尾页构图】
- Center-right vertical typography, asymmetrical decorative lines, bottom-left square image slot.

【禁止】
- No bright, saturated, or neon colors.
- No heavy drop shadows or 3D effects.
- Avoid dense blocks of text; prioritize brevity and negative space.
- Do not use default, unstyled Excel charts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art or design portfolios、Boutique brand presentations、Mood boards or stylistic pitches、Minimalist concept explanations。
