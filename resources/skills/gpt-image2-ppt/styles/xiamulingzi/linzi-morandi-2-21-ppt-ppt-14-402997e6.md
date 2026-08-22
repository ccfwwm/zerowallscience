# 14 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-14-402997e6

## 风格ID
linzi-morandi-2-21-ppt-ppt-14-402997e6

## 风格名称
14 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-14-402997e6

## 风格描述
Editorial lookbook presentation featuring deep color blocking, sharp geometric image frames, and soft shadow overlays.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary dark green background with solid deep red and mustard yellow accent panels. Text is stark white or muted light gray.
- fonts: Modern, clean sans-serif (Geometric or Neo-grotesque) for all structural text. Large bold weights for headings, high line-height regular weights for body copy.
- spacing: Generous outer margins with content often constrained to strict halves or quadrants. Tight padding inside color blocks.
- shape_language: Strictly orthogonal. Perfect rectangles and squares for both images and solid color blocks.
- texture: Subtle, blurred leafy shadow overlays applied to the dark green background. Occasional film grain/noise treatments on photography.
- grid: Modular grid heavily relying on 2-column splits, triptychs, and bento-box style quadrants.
- motion_or_depth: Flat geometric blocks combined with overlapping layers (images over color blocks) to create a shallow, editorial depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「14 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-14-402997e6」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial lookbook presentation featuring deep color blocking, sharp geometric image frames, and soft shadow overlays.
- 推荐配色：#183324、#8E1010、#D69B2A、#FFFFFF、#A0AAB0

【不可丢失的风格锚点】
- Deep forest green primary background
- Soft botanical shadow overlays (gobo effect)
- Strict rectangular color-blocking in deep red and mustard yellow
- Recurring oversized script/signature graphic motif
- Sharp-edged image containers without corner radii

【字体】
- Headings are large, bold, and often span multiple lines in sentence or title case.
- Body text is deliberately small with generous line height for a refined, airy look.
- Consistent use of small, all-caps navigational elements at the top and bottom corners.
- A decorative script is used strictly as a graphic accent, not for readable structural text.

【封面页构图】
- Asymmetrical split with a left-anchored hero image overlaid by a bottom-aligned accent color block. Right side features staggered typography over a textured background.

【内容页构图】
- Right side features two vertically stacked, perfectly aligned square images. Left side contains text anchored by an accent block.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with a left-anchored hero image overlaid by a bottom-aligned accent color block. Right side features staggered typography over a textured background.","zones":["Asymmetrical split with a left-anchored hero image overlaid by a bottom-aligned accent color block. Right side features staggered typography over a textured background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["hero-image","color-block","asymmetrical"],"avoid":["Data-heavy content","Detailed lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-left","purpose":"Main cover photography","bbox":[0.09,0.12,0.34,0.61],"priority":1}]}
- section: {"id":"section-primary","composition":"Left side features two overlapping vertical/square image frames. Right side features a text block anchored by a solid color rectangle behind the heading.","zones":["Left side features two overlapping vertical/square image frames. Right side features a text block anchored by a solid color rectangle behind the heading."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["overlapping-images","text-with-accent-box"],"avoid":["Complex data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Product spotlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"background-image-left","purpose":"Secondary context image","bbox":[0.26,0.11,0.23,0.6],"priority":2},{"id":"foreground-image-left","purpose":"Primary focus image","bbox":[0.03,0.29,0.23,0.55],"priority":1}]}
- content: [{"id":"content-content","composition":"Right side features two vertically stacked, perfectly aligned square images. Left side contains text anchored by an accent block.","zones":["Right side features two vertically stacked, perfectly aligned square images. Left side contains text anchored by an accent block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["stacked-images","split-layout"],"avoid":["Long-form text","copying source assets, source text, or an exact source arrangement"],"best_for":["Image pairings","Comparison slides"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-square","purpose":"Top image in stack","bbox":[0.73,0.16,0.21,0.36],"priority":1},{"id":"bottom-right-square","purpose":"Bottom image in stack","bbox":[0.73,0.53,0.21,0.35],"priority":2}]},{"id":"content-comparison","composition":"Top half is split between a text block and a wide landscape image. Bottom half is a modular layout of two distinct color blocks containing varying text/graphics.","zones":["Top half is split between a text block and a wide landscape image. Bottom half is a modular layout of two distinct color blocks containing varying text/graphics."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["bento-box","modular-grid","color-blocking"],"avoid":["Single, focused messages","copying source assets, source text, or an exact source arrangement"],"best_for":["Multi-topic overviews","Section summaries"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"top-right-banner","purpose":"Wide context image","bbox":[0.42,0.18,0.56,0.37],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left side features a vertical timeline/list connected by a thin line with solid circular nodes. Right side features a large heading and explanatory paragraph.","zones":["Left side features a vertical timeline/list connected by a thin line with solid circular nodes. Right side features a large heading and explanatory paragraph."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["timeline","numbered-list"],"avoid":["Complex numerical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Agendas","Timelines"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left side features two overlapping vertical/square image frames. Right side features a text block anchored by a solid color rectangle behind the heading.","zones":["Left side features two overlapping vertical/square image frames. Right side features a text block anchored by a solid color rectangle behind the heading."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["overlapping-images","text-with-accent-box"],"avoid":["Complex data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Case studies","Product spotlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"background-image-left","purpose":"Secondary context image","bbox":[0.26,0.11,0.23,0.6],"priority":2},{"id":"foreground-image-left","purpose":"Primary focus image","bbox":[0.03,0.29,0.23,0.55],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Left side is dominated by a large, vertically oriented image with rounded edges extending off-canvas. Right side features a highly stylized, oversized typographic treatment (e.g., strikethrough).","zones":["Left side is dominated by a large, vertically oriented image with rounded edges extending off-canvas. Right side features a highly stylized, oversized typographic treatment (e.g., strikethrough)."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["hero-text","statement-slide"],"avoid":["Standard body content","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Key statements","Section dividers"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"left-hero-image","purpose":"Bold statement imagery","bbox":[0.09,0.31,0.36,0.69],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Mirrors the cover layout. Asymmetrical split with a left-anchored hero image overlaid by a bottom-aligned accent block. Right side contains large 'Thank You' text over a textured background.","zones":["Mirrors the cover layout. Asymmetrical split with a left-anchored hero image overlaid by a bottom-aligned accent block. Right side contains large 'Thank You' text over a textured background."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Deep forest green primary background","Soft botanical shadow overlays (gobo effect)","Strict rectangular color-blocking in deep red and mustard yellow"],"optional_variants":["closing","bookend","hero-image"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"hero-left-closing","purpose":"Final impression photography","bbox":[0.09,0.12,0.34,0.61],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are always placed in sharp rectangular or square frames.
- Images frequently overlap color blocks or other images slightly to break the grid.
- Tightly packed grids (e.g., 2x2) are used with zero margin between images.

【图标与装饰】
- Extremely minimal. Relies primarily on geometric shapes and typography rather than traditional vector icons.
- Numbers in lists are placed inside simple, high-contrast solid circles.

【数据页构图】
- Left side features a vertical timeline/list connected by a thin line with solid circular nodes. Right side features a large heading and explanatory paragraph.

【图表风格】
- No traditional data charts present. Process/timeline data is represented via minimal vertical connecting lines and circular nodes.

【章节页构图】
- Left side features two overlapping vertical/square image frames. Right side features a text block anchored by a solid color rectangle behind the heading.

【收尾页构图】
- Mirrors the cover layout. Asymmetrical split with a left-anchored hero image overlaid by a bottom-aligned accent block. Right side contains large 'Thank You' text over a textured background.

【禁止】
- Avoid rounded corners on images or shapes; it breaks the strict geometric editorial aesthetic.
- Do not use bright, saturated neon colors; stick to the muted, moody, jewel-toned palette.
- Avoid centering large blocks of body text; maintain strong left-alignment.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Photography portfolios、Interior design proposals、Brand identity guidelines、Creative agency credentials。
