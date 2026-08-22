# 优雅线条（14）---木七设计 · ppt模板 / linzi-morandi-ppt-14-0f11263c

## 风格ID
linzi-morandi-ppt-14-0f11263c

## 风格名称
优雅线条（14）---木七设计 · ppt模板 / linzi-morandi-ppt-14-0f11263c

## 风格描述
Elegant minimalist presentation using a Morandi earth-tone palette, fluid organic background shapes, and strict geometric framing.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds are predominantly warm beige/off-white. Elements and text use contrasting dark brown. Accents and secondary layers use mid-tone khakis.
- fonts: Clean geometric sans-serif. Wide tracking for uppercase headers. Standard tracking for sentence-case body text.
- spacing: Generous margins. Fluid shapes act as negative space delineators. Dense content is tightly grouped within distinct geometric boundaries.
- shape_language: Contrast between chaotic organic blobs in the background and perfect circles/rectangles in the foreground.
- texture: Flat matte vector shapes with occasional subtle grain in photo masks. No gradients or inner shadows.
- grid: Asymmetrical background masking a strict 1-column, 2-column, or 3-column foreground alignment.
- motion_or_depth: Completely flat 2D layering. Depth is achieved purely through color contrast and overlapping vector shapes, completely avoiding drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（14）---木七设计 · ppt模板 / linzi-morandi-ppt-14-0f11263c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant minimalist presentation using a Morandi earth-tone palette, fluid organic background shapes, and strict geometric framing.
- 推荐配色：#EBE7DF、#825F4B、#A98C78、#CBBFA8、#FFFFFF

【不可丢失的风格锚点】
- Fluid, overlapping organic background blobs
- Muted, low-saturation earth tones (Morandi palette)
- Scattered minimalist white dash accents
- Content enclosed in perfect circles or stark rectangular intersections
- Wide letter-spacing for all-caps primary titles

【字体】
- Primary titles: All-caps, wide tracking, dark brown.
- Subtitles: Smaller, standard tracking, centered or aligned with body text.
- Body text: Left-aligned for distinct text blocks, centered for column items.
- Slide numbers: White text inside a solid dark brown circle in the top-left corner.

【封面页构图】
- Central perfect white circle over organic overlapping fluid shapes and scattered dashes.

【内容页构图】
- Three centered columns with oversized numbered circles acting as headers.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central perfect white circle over organic overlapping fluid shapes and scattered dashes.","zones":["Central perfect white circle over organic overlapping fluid shapes and scattered dashes."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["hero-circle","organic-cover","minimalist-title"],"avoid":["Data heavy slides","Long introductory paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","Section breaker"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Minimalist layout with a thin central circle containing scattered letters, accompanied by opposing corner text blocks and thin curved background lines.","zones":["Minimalist layout with a thin central circle containing scattered letters, accompanied by opposing corner text blocks and thin curved background lines."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["scattered-text","minimal-divider","line-art"],"avoid":["Detailed information display","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Evocative quotes"],"evidence_pages":["page-06"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three centered columns with oversized numbered circles acting as headers.","zones":["Three centered columns with oversized numbered circles acting as headers."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["three-columns","numbered-circles","centered-lists"],"avoid":["Complex technical diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Three-step processes","Service pillars"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Left-aligned text block balanced by a large circular image mask on the right.","zones":["Left-aligned text block balanced by a large circular image mask on the right."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["image-right","text-left","circular-mask"],"avoid":["Multi-metric dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Team member introductions","Concept explanations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"circular-feature","purpose":"Replaceable visual or photo","bbox":[0.6,0.25,0.35,0.5],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Minimalist combo chart (bars + filled line) floating without a bounding box or heavy axes.","zones":["Minimalist combo chart (bars + filled line) floating without a bounding box or heavy axes."],"content_capacity":{"density":"medium","max_items":1},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["bar-chart","combo-chart","clean-data"],"avoid":["Complex multi-variable scatter plots","copying source assets, source text, or an exact source arrangement"],"best_for":["Annual performance data","Financial reporting","Monthly trends"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three centered columns with oversized numbered circles acting as headers.","zones":["Three centered columns with oversized numbered circles acting as headers."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["three-columns","numbered-circles","centered-lists"],"avoid":["Complex technical diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Three-step processes","Service pillars"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered typography directly on the organic background, mirroring the cover but lacking the central framing circle.","zones":["Centered typography directly on the organic background, mirroring the cover but lacking the central framing circle."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, overlapping organic background blobs","Muted, low-saturation earth tones (Morandi palette)","Scattered minimalist white dash accents"],"optional_variants":["closing","bookend","floating-text"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact information slide"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are heavily masked into perfect circles or borderless rectangles that bleed off the edge.
- Photos should ideally share the warm, muted, low-saturation aesthetic of the template.

【图标与装饰】
- Minimalist to non-existent. Relies on large typographic numbers and basic geometric shapes (arrows, speech bubbles) rather than traditional icons.

【数据页构图】
- Minimalist combo chart (bars + filled line) floating without a bounding box or heavy axes.

【图表风格】
- Highly simplified combo charts. Minimalist bars with matching earth tones.
- Overlaid line graphs use thin grey lines with subtle shaded areas.
- Removal of y-axis lines, gridlines, and borders to maintain a clean aesthetic.

【章节页构图】
- Minimalist layout with a thin central circle containing scattered letters, accompanied by opposing corner text blocks and thin curved background lines.

【收尾页构图】
- Centered typography directly on the organic background, mirroring the cover but lacking the central framing circle.

【禁止】
- Drop shadows or 3D bevels.
- Highly saturated or neon colors.
- Cluttered text outside of geometric bounding areas.
- Default Office chart styling with heavy gridlines.
- Sharp, jagged background vectors (must remain fluid and smooth).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion and lifestyle lookbooks、Creative agency portfolios、Minimalist corporate overviews、Art direction pitches、Wellness and beauty brand presentations。
