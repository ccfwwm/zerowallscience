# 47 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-47-e6c2b929

## 风格ID
linzi-morandi-2-21-ppt-ppt-47-e6c2b929

## 风格名称
47 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-47-e6c2b929

## 风格描述
Editorial fashion-inspired presentation featuring muted earth tones, delicate serif typography, asymmetrical grids, and an ambient leaf shadow overlay.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Base light textured gray/beige canvas; rich earth-tone accents (rust, olive, muted navy); outer slide margin in darker taupe.
- fonts: Elegant serif for primary headings; clean, lightweight sans-serif for body text; dramatic flowing script for decorative watermarks.
- spacing: Generous outer margins creating a 'card' effect; internal elements often overlap rather than maintaining strict padding.
- shape_language: Strictly orthogonal. Sharp rectangles for all images and color blocks. Zero rounded corners.
- texture: Subtle paper grain on the background combined with a distinct, high-contrast photorealistic shadow overlay (gobo).
- grid: Multi-column asymmetric grid. Imagery often anchored to the top or bottom edges of the inner canvas, intentionally breaking standard center alignment.
- motion_or_depth: Depth is entirely achieved via the simulated global lighting/shadow overlay and the physical 'card' look, rather than drop shadows on individual elements.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「47 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-47-e6c2b929」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial fashion-inspired presentation featuring muted earth tones, delicate serif typography, asymmetrical grids, and an ambient leaf shadow overlay.
- 推荐配色：#D6D5D2、#A44A1B、#525674、#5B6A46、#A28B73

【不可丢失的风格锚点】
- Global organic shadow overlay simulating natural sunlight through foliage
- Unframed, sharp-edged rectangular photo blocks
- Oversized script typography used as a graphical background/watermark element
- Asymmetrical, magazine-style layouts with generous negative space

【字体】
- Headings: Uppercase, elegant serif, generous tracking.
- Body: Light sans-serif, tight line height, left-aligned in compact columns.
- Accents: Large, diagonally or dynamically placed script text that purposefully overlaps images and other text as a graphic layer.

【封面页构图】
- Asymmetric split with large vertical image on the left, central oversized script watermark, and delicate typography on the right half.

【内容页构图】
- Top right landscape image balanced by top left text, with a bottom row of three horizontally aligned icon-text pairs.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetric split with large vertical image on the left, central oversized script watermark, and delicate typography on the right half.","zones":["Asymmetric split with large vertical image on the left, central oversized script watermark, and delicate typography on the right half."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["left-hero","editorial-cover"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Chapter dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_left","purpose":"Primary striking visual","bbox":[0.08,0.11,0.35,0.78],"priority":1}]}
- section: {"id":"section-primary","composition":"Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge.","zones":["Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["image-text-split","vertical-accent"],"avoid":["Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive quotes"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_vertical","purpose":"Subject portrait or detailed texture","bbox":[0.08,0.08,0.35,0.84],"priority":1}]}
- content: [{"id":"content-content","composition":"Top right landscape image balanced by top left text, with a bottom row of three horizontally aligned icon-text pairs.","zones":["Top right landscape image balanced by top left text, with a bottom row of three horizontally aligned icon-text pairs."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["top-image","three-column-footer"],"avoid":["Complex tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Value propositions","Service overviews"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"landscape_feature","purpose":"Contextual scene","bbox":[0.55,0.08,0.35,0.4],"priority":1}]},{"id":"content-comparison","composition":"Two vertical layout columns on the left, one featuring a solid color block overlaid with text at the bottom. Right side contains text and two stacked list items.","zones":["Two vertical layout columns on the left, one featuring a solid color block overlaid with text at the bottom. Right side contains text and two stacked list items."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["dual-image","color-block-overlap"],"avoid":["Single overarching narratives","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Dual product features"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"profile_main","purpose":"Primary subject portrait","bbox":[0.3,0.1,0.2,0.78],"priority":1},{"id":"profile_secondary","purpose":"Secondary subject or texture","bbox":[0.08,0.1,0.2,0.55],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"2x3 grid of perfectly square color swatches on the right, accompanied by a text-heavy left column.","zones":["2x3 grid of perfectly square color swatches on the right, accompanied by a text-heavy left column."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["swatch-grid","text-left"],"avoid":["Narrative storytelling","copying source assets, source text, or an exact source arrangement"],"best_for":["Color palettes","Categorical data","Brand guidelines"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge.","zones":["Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["image-text-split","vertical-accent"],"avoid":["Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive quotes"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_vertical","purpose":"Subject portrait or detailed texture","bbox":[0.08,0.08,0.35,0.84],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge.","zones":["Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["image-text-split","vertical-accent"],"avoid":["Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Executive quotes"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_vertical","purpose":"Subject portrait or detailed texture","bbox":[0.08,0.08,0.35,0.84],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Slight variation of the cover slide: Large vertical image on the left, prominent 'THANKS' typography centrally aligned in the right negative space.","zones":["Slight variation of the cover slide: Large vertical image on the left, prominent 'THANKS' typography centrally aligned in the right negative space."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Global organic shadow overlay simulating natural sunlight through foliage","Unframed, sharp-edged rectangular photo blocks","Oversized script typography used as a graphical background/watermark element"],"optional_variants":["closing","left-hero"],"avoid":["Complex data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_hero","purpose":"Final impression image","bbox":[0.1,0.11,0.35,0.78],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full bleed within sharp rectangular grid areas.
- No borders, strokes, or corner radii.
- Often layered with solid color blocks (like rust orange) positioned as adjacent structural counterparts.

【图标与装饰】
- Minimalist, thin-line vector icons used sparingly for list items.
- Contained within small negative spaces or integrated directly into text blocks.

【数据页构图】
- 2x3 grid of perfectly square color swatches on the right, accompanied by a text-heavy left column.

【图表风格】
- No traditional charts present. Data is represented via minimal lists or thematic color swatches arranged in tight grids.

【章节页构图】
- Left-aligned vertical image, central text block, and a distinctive vertical color bar accent on the far right edge.

【收尾页构图】
- Slight variation of the cover slide: Large vertical image on the left, prominent 'THANKS' typography centrally aligned in the right negative space.

【禁止】
- Avoid rounded corners on images or shapes.
- Avoid bright, highly saturated primary colors (neon, pure cyan/magenta).
- Do not use individual drop shadows on objects; rely on the global shadow overlay.
- Avoid perfectly symmetrical, strictly centered layouts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Brand moodboards、Editorial style guides、Boutique agency credentials。
