# 59 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-59-1de0a6c8

## 风格ID
linzi-morandi-2-21-ppt-ppt-59-1de0a6c8

## 风格名称
59 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-59-1de0a6c8

## 风格描述
Minimalist Morandi-style presentation featuring organic fluid shapes, soft muted tones, and clean, high-whitespace layouts suitable for modern business or creative portfolios.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark slate for primary text and major shapes, soft light blue for secondary shapes, muted peach for accent lines and bullets.
- fonts: Clean, lightweight, modern sans-serif for primary and secondary text; readable at all sizes.
- spacing: Airy, high-margin layouts with content centrally or left-anchored, leaving wide padding near organic frames.
- shape_language: Soft, fluid, amoeba-like vector shapes paired with thin, graceful arcs.
- texture: Flat, matte vector elements with zero drop shadows or gradients.
- grid: Loose, asymmetrical grid dictated by the intrusion of corner blob elements.
- motion_or_depth: Strictly flat, 2D layers; depth implied only through overlapping vector shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「59 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-59-1de0a6c8」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist Morandi-style presentation featuring organic fluid shapes, soft muted tones, and clean, high-whitespace layouts suitable for modern business or creative portfolios.
- 推荐配色：#4D5B68、#BCC5D0、#D29D88、#FFFFFF

【不可丢失的风格锚点】
- Organic, asymmetrical fluid blob framing in corners
- Overlapping thin, curved vector strokes in accent color
- Muted, low-saturation 'Morandi' color palette
- High emphasis on central negative space

【字体】
- Headings use the dark slate color and thin/light font weights.
- Body text is kept relatively small with generous line height for readability.
- Use soft peach for list bullets to add subtle color pops.

【封面页构图】
- Centered title and subtitle flanked by asymmetrical fluid corner shapes

【内容页构图】
- Two-column layout over a split-color background with a device mockup overlapping the split

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle flanked by asymmetrical fluid corner shapes","zones":["Centered title and subtitle flanked by asymmetrical fluid corner shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["minimal-cover","fluid-frame","centered-text"],"avoid":["Detailed agendas","Data-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","High-level topic introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned multi-level text block with massive fluid shape occupying the right side","zones":["Left-aligned multi-level text block with massive fluid shape occupying the right side"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["asymmetrical-divider","left-text","organic-right"],"avoid":["Dense paragraphs","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Two-column layout over a split-color background with a device mockup overlapping the split","zones":["Two-column layout over a split-color background with a device mockup overlapping the split"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["device-mockup","split-background","two-column"],"avoid":["Multi-chart dashboards","Text-only deep dives","copying source assets, source text, or an exact source arrangement"],"best_for":["Product showcases","Software/website previews","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"device-screen","purpose":"Screen content for the device mockup","bbox":[0.48,0.28,0.4,0.55],"priority":1}]},{"id":"content-comparison","composition":"Asymmetrical masonry image grid in the upper half, with titles and text anchored in the lower left","zones":["Asymmetrical masonry image grid in the upper half, with titles and text anchored in the lower left"],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["masonry-grid","image-gallery","bottom-heavy-text"],"avoid":["Data visualization","Single focal point layouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Portfolio galleries","Mood boards","Team profiles"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"gallery-main","purpose":"Primary large portfolio image","bbox":[0.05,0.06,0.36,0.55],"priority":1},{"id":"gallery-top-right","purpose":"Secondary wide context image","bbox":[0.43,0.06,0.52,0.26],"priority":2},{"id":"gallery-bottom-1","purpose":"Detail image 1","bbox":[0.43,0.34,0.16,0.27],"priority":3},{"id":"gallery-bottom-2","purpose":"Detail image 2","bbox":[0.61,0.34,0.16,0.27],"priority":4},{"id":"gallery-bottom-3","purpose":"Detail image 3","bbox":[0.79,0.34,0.16,0.27],"priority":5}]}]
- data: [{"id":"data-metrics","composition":"Rows of repeating icons indicating percentages via fill state, paired with right-aligned text","zones":["Rows of repeating icons indicating percentages via fill state, paired with right-aligned text"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["icon-array","percentage-fill","row-layout"],"avoid":["Complex continuous data (line charts)","Financial tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Percentage comparisons","Survey results","Progress tracking"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned multi-level text block with massive fluid shape occupying the right side","zones":["Left-aligned multi-level text block with massive fluid shape occupying the right side"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["asymmetrical-divider","left-text","organic-right"],"avoid":["Dense paragraphs","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key takeaways"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing text flanked by asymmetrical fluid corner shapes","zones":["Centered closing text flanked by asymmetrical fluid corner shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, asymmetrical fluid blob framing in corners","Overlapping thin, curved vector strokes in accent color","Muted, low-saturation 'Morandi' color palette"],"optional_variants":["minimal-closing","fluid-frame","centered-text"],"avoid":["Content summaries","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Q&A introduction","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed within clean, sharp-edged rectangles or standard device mockups to contrast the fluid background shapes.
- Avoid applying soft edges or blob masks to photographs; keep them geometric.

【图标与装饰】
- Use flat, minimalist vector icons that match the primary text color.
- Icons can use varying opacities to indicate progress or data states (e.g., filled vs. empty).

【数据页构图】
- Rows of repeating icons indicating percentages via fill state, paired with right-aligned text

【图表风格】
- Data visualizations should use minimalist rings or flat filled icons.
- Charts strictly adhere to the muted 3-color palette without introducing external hues.

【章节页构图】
- Left-aligned multi-level text block with massive fluid shape occupying the right side

【收尾页构图】
- Centered closing text flanked by asymmetrical fluid corner shapes

【禁止】
- Do not use harsh, highly saturated primary colors.
- Avoid 3D effects, bevels, or heavy drop shadows.
- Do not clutter the central white space; maintain the minimalist aesthetic.
- Avoid rigid geometric backgrounds that conflict with the fluid shape language.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios and lookbooks、Modern, minimalist corporate overviews、Art and design summaries、Lifestyle brand decks。
