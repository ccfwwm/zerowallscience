# 92 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-92-528a050a

## 风格ID
linzi-morandi-2-21-ppt-ppt-92-528a050a

## 风格名称
92 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-92-528a050a

## 风格描述
A minimalist, Morandi-inspired presentation featuring a dusty pink palette, consistent dashed border framing, bold typography, and flat geometric layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dusty pink acts as a universal canvas, white provides high-contrast foregrounding, and a tri-color set (peach, teal, coral) serves as categorical accents.
- fonts: Clean, modern sans-serif. Heavy/Bold weights for headers to ensure contrast, regular weight for paragraphs.
- spacing: Generous interior margins defined by the inset dashed border. Elements are allowed to purposefully 'break' this border for visual tension.
- shape_language: Strictly geometric. Primary use of circles (badges, diagrams) and rectangles (image masks, structural color blocks).
- texture: Entirely flat and matte. Zero use of gradients, bevels, or drop shadows.
- grid: Symmetrical centered layouts for covers/transitions, and structured 2-column or 50/50 splits for content pages.
- motion_or_depth: Extremely flat. Depth is only suggested through the direct overlap of opaque shapes over images.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「92 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-92-528a050a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, Morandi-inspired presentation featuring a dusty pink palette, consistent dashed border framing, bold typography, and flat geometric layouts.
- 推荐配色：#A8726A、#FFFFFF、#FBA465、#254441、#F17B68

【不可丢失的风格锚点】
- Inset white dashed border framing the perimeter of most slides
- Three-dot horizontal decorative motif in peach, teal, and coral
- Flat, solid circular badges used for numbering, icons, and overlaps
- High-contrast, stark white bold typography against muted backgrounds

【字体】
- Titles must be uppercase or prominent, set in stark white against the dark background
- Body copy should be significantly smaller and lighter in weight to establish strong hierarchy
- Use geometric sans-serif typefaces to match the flat aesthetic

【封面页构图】
- Centered typographic hierarchy bordered by a dashed inset frame, accented with a top icon and bottom 3-dot motif.

【内容页构图】
- Large right-aligned image partially overlapped by a prominent white circular badge containing a quote/text, paired with left-aligned body copy.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typographic hierarchy bordered by a dashed inset frame, accented with a top icon and bottom 3-dot motif.","zones":["Centered typographic hierarchy bordered by a dashed inset frame, accented with a top icon and bottom 3-dot motif."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["centered","minimal","cover"],"avoid":["Data heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Module openers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Asymmetrical split screen. Left side features a tall vertical image. Right side contains text blocks over white and dark background patches, anchored by a massive watermark-style number.","zones":["Asymmetrical split screen. Left side features a tall vertical image. Right side contains text blocks over white and dark background patches, anchored by a massive watermark-style number."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["asymmetrical","huge-number","split-screen"],"avoid":["Standard body content","copying source assets, source text, or an exact source arrangement"],"best_for":["Section breaks","Chapter titles","Big numbers/stats"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"vertical-hero","purpose":"Atmospheric section image","bbox":[0.05,0.12,0.33,0.88],"priority":1}]}
- content: [{"id":"content-content","composition":"Large right-aligned image partially overlapped by a prominent white circular badge containing a quote/text, paired with left-aligned body copy.","zones":["Large right-aligned image partially overlapped by a prominent white circular badge containing a quote/text, paired with left-aligned body copy."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["overlap","quote","image-right"],"avoid":["Long sequential lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Pull quotes","Team member highlights","Product features"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-right","purpose":"Main focal image","bbox":[0.42,0.09,0.45,0.82],"priority":1}]},{"id":"content-comparison","composition":"Left column text layout accented by vertical color bars, right column occupied by a large square image that breaks the dashed border.","zones":["Left column text layout accented by vertical color bars, right column occupied by a large square image that breaks the dashed border."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["split-column","heavy-text","image-right"],"avoid":["Multi-item grids","copying source assets, source text, or an exact source arrangement"],"best_for":["Concept explanations","Product spotlights"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"right-square","purpose":"Illustrative graphic or photo","bbox":[0.5,0.09,0.45,0.82],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Radial cross diagram composed of five white circles with short block arrows, flanked by text blocks in the four corners.","zones":["Radial cross diagram composed of five white circles with short block arrows, flanked by text blocks in the four corners."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["diagram","radial","symmetrical"],"avoid":["Linear timelines","Heavy paragraph text","copying source assets, source text, or an exact source arrangement"],"best_for":["Core concepts","SWOT analysis","Directional strategies"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned partial bleed image slot with a right-aligned vertical list utilizing alternating colored circular bullets.","zones":["Left-aligned partial bleed image slot with a right-aligned vertical list utilizing alternating colored circular bullets."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["split-layout","list","image-left"],"avoid":["Dense paragraphs","Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Key takeaways","Step-by-step lists"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-left","purpose":"Visual anchor for list","bbox":[0.0,0.26,0.5,0.55],"priority":1}]}]
- agenda: {"id":"agenda-primary","composition":"Left-aligned partial bleed image slot with a right-aligned vertical list utilizing alternating colored circular bullets.","zones":["Left-aligned partial bleed image slot with a right-aligned vertical list utilizing alternating colored circular bullets."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["split-layout","list","image-left"],"avoid":["Dense paragraphs","Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Key takeaways","Step-by-step lists"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero-left","purpose":"Visual anchor for list","bbox":[0.0,0.26,0.5,0.55],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Exact mirror of the cover page structure, featuring a centered 'Thanks' message within the dashed border.","zones":["Exact mirror of the cover page structure, featuring a centered 'Thanks' message within the dashed border."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Inset white dashed border framing the perimeter of most slides","Three-dot horizontal decorative motif in peach, teal, and coral","Flat, solid circular badges used for numbering, icons, and overlaps"],"optional_variants":["closing","centered","minimal"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should have a slightly muted, desaturated, or moody tone to complement the dusty pink palette
- Images often bleed to the edges or purposefully intersect the dashed frame line
- Use hard rectangular masks without rounded corners for photography

【图标与装饰】
- Icons must be simple, flat, white line-art or silhouettes
- Icons are consistently housed within perfectly circular, colored backgrounds
- Avoid 3D or overly complex illustrative icons

【数据页构图】
- Radial cross diagram composed of five white circles with short block arrows, flanked by text blocks in the four corners.

【图表风格】
- Diagrams are built from flat geometric nodes (circles)
- Connectors use simple, flat block arrows
- Keep data visualizations strictly 2D and aligned to the dominant grid structure

【章节页构图】
- Asymmetrical split screen. Left side features a tall vertical image. Right side contains text blocks over white and dark background patches, anchored by a massive watermark-style number.

【收尾页构图】
- Exact mirror of the cover page structure, featuring a centered 'Thanks' message within the dashed border.

【禁止】
- Drop shadows, glows, or gradients of any kind
- Bright, highly saturated primary colors (neon, bright red, pure blue)
- Curved, wavy, or organic structural shapes (stick to circles and rectangles)
- Cluttered text over complex image backgrounds without an opaque text block
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Boutique brand guidelines、Minimalist corporate overviews、Editorial lookbooks。
