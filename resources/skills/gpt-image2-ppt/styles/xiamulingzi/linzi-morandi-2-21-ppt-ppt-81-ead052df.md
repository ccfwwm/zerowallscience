# 81 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-81-ead052df

## 风格ID
linzi-morandi-2-21-ppt-ppt-81-ead052df

## 风格名称
81 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-81-ead052df

## 风格描述
A minimalist, Zen-inspired presentation template featuring a soft Morandi palette, elegant typography, and a signature 'folded paper' card motif.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Sage green (#B1BCB5) acts as the primary atmospheric background; Cream (#F4F4EB) serves as the main content canvas; Dusty rose (#9E6B6C) and slate (#828692) provide muted structural accents.
- fonts: Elegant traditional serif for display numbers/primary focal text; Clean, light sans-serif for subtitles, body copy, and annotations.
- spacing: Extremely generous padding; content is grouped tightly but surrounded by massive structural negative space (macro-whitespace).
- shape_language: Primarily orthogonal with a distinct organic/geometric interruption: the folded corner (dog-ear) on the bottom right of content canvases.
- texture: Flat, matte finish resembling smooth art paper, enhanced by the subtle folding shadow.
- grid: Framed canvas grid; content pages utilize an inset box with roughly 5% margins, often split into 50/50 or 40/60 vertical columns.
- motion_or_depth: Shallow depth achieved through a single layered effect (the cream card sitting on the sage background with a corner peel).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「81 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-81-ead052df」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, Zen-inspired presentation template featuring a soft Morandi palette, elegant typography, and a signature 'folded paper' card motif.
- 推荐配色：#B1BCB5、#F4F4EB、#9E6B6C、#828692、#595959

【不可丢失的风格锚点】
- Muted Morandi color scheme (sage, cream, dusty rose, slate)
- Centered serif typography framed by minimalist horizontal rules
- Inset cream 'paper' cards with a subtle bottom-right folded corner
- High-margin, generous negative space layouts

【字体】
- Primary display elements (numbers/short titles) use a large, elegant serif font, centered and isolated.
- Body copy is sans-serif, set with loose line height (approx 1.5x) to maintain a breathable, airy feel.
- Subtitles and small structural text use wide letter-spacing (tracking) for a sophisticated editorial look.
- Hierarchy is established through extreme size contrast between the focal serif glyphs and the secondary sans-serif body.

【封面页构图】
- Centered typography framed by top and bottom horizontal lines on a solid background.

【内容页构图】
- Inset canvas with a folded corner, split horizontally: text block left, edge-to-edge image right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography framed by top and bottom horizontal lines on a solid background.","zones":["Centered typography framed by top and bottom horizontal lines on a solid background."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["centered","minimal","text-only"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Minimalist section openers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered single large display character flanked by horizontal lines and a subtitle.","zones":["Centered single large display character flanked by horizontal lines and a subtitle."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["chapter-marker","typographic","centered"],"avoid":["Detailed content summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Pause slides"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Inset canvas with a folded corner, split horizontally: text block left, edge-to-edge image right.","zones":["Inset canvas with a folded corner, split horizontally: text block left, edge-to-edge image right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["split-layout","image-right","paper-effect"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Introduction to a topic","Image and description pairing"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-column-image","purpose":"Visual anchor for the slide's narrative","bbox":[0.51,0.04,0.44,0.92],"priority":1}]},{"id":"content-comparison","composition":"Inset canvas with a numbered list on the left and a large portrait image on the right.","zones":["Inset canvas with a numbered list on the left and a large portrait image on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["numbered-list","image-right","balanced"],"avoid":["Long textual paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Step-by-step concepts"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"right-portrait-image","purpose":"Illustrative lifestyle or conceptual imagery","bbox":[0.48,0.07,0.39,0.86],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Inset canvas featuring a central circular four-part diagram flanked by four corresponding text blocks.","zones":["Inset canvas featuring a central circular four-part diagram flanked by four corresponding text blocks."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["diagram","circular-process","symmetrical"],"avoid":["Linear timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Cyclical processes","Interconnected core pillars","Four-step frameworks"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered single large display character flanked by horizontal lines and a subtitle.","zones":["Centered single large display character flanked by horizontal lines and a subtitle."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["chapter-marker","typographic","centered"],"avoid":["Detailed content summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Pause slides"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered, minimal typography mirroring the cover and section dividers to signal conclusion.","zones":["Centered, minimal typography mirroring the cover and section dividers to signal conclusion."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted Morandi color scheme (sage, cream, dusty rose, slate)","Centered serif typography framed by minimalist horizontal rules","Inset cream 'paper' cards with a subtle bottom-right folded corner"],"optional_variants":["closing","centered","minimal"],"avoid":["Contact information lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Ending slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are cropped to clean rectangles, often stretching vertically to fill their assigned column within the inset canvas.
- No borders, drop shadows, or rounded corners on images; they rely on flush alignment with the grid.
- Photography matches the muted, low-contrast Morandi palette to avoid breaking the visual harmony.

【图标与装饰】
- Extremely minimal; relies on typography (e.g., large numbers) and simple geometric shapes (circles, lines) rather than illustrative icons.

【数据页构图】
- Inset canvas featuring a central circular four-part diagram flanked by four corresponding text blocks.

【图表风格】
- Diagrams are flat, using intersecting organic shapes (like a pinwheel or overlapping petals).
- Diagram colors strictly pull from the primary palette (slate, dark green) without gradients or 3D effects.
- Data points/labels are integrated directly into the negative space of the shapes.

【章节页构图】
- Centered single large display character flanked by horizontal lines and a subtitle.

【收尾页构图】
- Centered, minimal typography mirroring the cover and section dividers to signal conclusion.

【禁止】
- Avoid high-contrast, highly saturated, or neon colors that would destroy the delicate Morandi aesthetic.
- Do not use heavy drop shadows or 3D bevel effects.
- Avoid dense blocks of text; maintain high negative space.
- Do not break the inset canvas frame on content slides.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios、Minimalist brand guidelines、Wellness, lifestyle, or boutique business pitches、Poetry, literature, or philosophical presentations。
