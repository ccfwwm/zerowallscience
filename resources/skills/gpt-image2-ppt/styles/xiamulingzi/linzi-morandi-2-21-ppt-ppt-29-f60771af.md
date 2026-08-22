# 29 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-29-f60771af

## 风格ID
linzi-morandi-2-21-ppt-ppt-29-f60771af

## 风格名称
29 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-29-f60771af

## 风格描述
A personal, vlog-style scrapbook presentation featuring a soft Morandi pastel palette, watercolor brush strokes, and Polaroid-style photo layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dusty pink and beige serve as primary alternating backgrounds; warm white for structural cards/borders; muted grey-brown for typography.
- fonts: Lightweight, elegant sans-serif or delicate serif for headings; thin sans-serif with wide tracking for body text.
- spacing: Loose spacing with generous margins; text blocks are allowed to float freely rather than locking to a strict grid.
- shape_language: A mix of soft, organic watercolor textures and rigid geometric masks (triangles, circles, hollow squares).
- texture: Watercolor smears and soft gradient drop shadows provide an analog, tactile feel.
- grid: Informal, scrapbook-style overlapping grid; split-screen foundations are common but elements intentionally break across the median.
- motion_or_depth: Depth achieved through overlapping polaroid frames, hollow square overlays, and background watercolor splashes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「29 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-29-f60771af」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A personal, vlog-style scrapbook presentation featuring a soft Morandi pastel palette, watercolor brush strokes, and Polaroid-style photo layouts.
- 推荐配色：#E3CDCE、#D7C4B1、#FFFFFF、#8C827A、#F4D37A

【不可丢失的风格锚点】
- Morandi pastel color palette (dusty pinks and beiges)
- Watercolor brush stroke accents under text
- Thick white borders on photos (Polaroid effect)
- Geometric photo masking (circles, row of triangles)
- Generous, airy line spacing with wide letter tracking

【字体】
- Headings use lightweight fonts and are often paired with informal icons or emojis.
- Body text is muted (low contrast grey-brown instead of black) to maintain the soft aesthetic.
- Wide letter spacing (tracking) and line height are used to make text blocks feel airy and poetic.

【封面页构图】
- Full-bleed background image with top-left title overlapping organic brush strokes and floating vector accents.

【内容页构图】
- Two overlapping Polaroid-style images on the left, top-aligned header and floating body text on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with top-left title overlapping organic brush strokes and floating vector accents.","zones":["Full-bleed background image with top-left title overlapping organic brush strokes and floating vector accents."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["hero-image","brush-accents","floating-text"],"avoid":["Detailed agendas","Corporate branding","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Mood-setting hero image"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full-bleed or largely inset background mood image","bbox":[0.1,0.1,0.8,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Left side solid color block containing text, right side large image overlaid with a thick, hollow white geometric frame and centered text.","zones":["Left side solid color block containing text, right side large image overlaid with a thick, hollow white geometric frame and centered text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["split-background","hollow-frame","overlay-text"],"avoid":["Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"bg-image-half","purpose":"Right-side background covering image","bbox":[0.5,0.0,0.5,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Two overlapping Polaroid-style images on the left, top-aligned header and floating body text on the right.","zones":["Two overlapping Polaroid-style images on the left, top-aligned header and floating body text on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["polaroid-stack","split-layout","diary-entry"],"avoid":["Data-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Image duos","Storytelling or chronological entries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"polaroid-back","purpose":"Background overlapping image","bbox":[0.1,0.15,0.25,0.6],"priority":2},{"id":"polaroid-front","purpose":"Foreground overlapping image","bbox":[0.2,0.45,0.35,0.4],"priority":1}]},{"id":"content-comparison","composition":"Horizontal band of adjacent alternating triangles acting as image masks, spanning the center of the slide.","zones":["Horizontal band of adjacent alternating triangles acting as image masks, spanning the center of the slide."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["triangle-mask","horizontal-gallery","creative-crop"],"avoid":["Text-heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Product/texture showcases","Visual timelines"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"triangle-1","purpose":"First masked image","bbox":[0.05,0.25,0.15,0.4],"priority":1},{"id":"triangle-2","purpose":"Second masked image","bbox":[0.2,0.25,0.15,0.4],"priority":2},{"id":"triangle-3","purpose":"Third masked image","bbox":[0.35,0.25,0.15,0.4],"priority":3},{"id":"triangle-4","purpose":"Fourth masked image","bbox":[0.5,0.25,0.15,0.4],"priority":4},{"id":"triangle-5","purpose":"Fifth masked image","bbox":[0.65,0.25,0.15,0.4],"priority":5}]}]
- data: [{"id":"data-metrics","composition":"Two overlapping Polaroid-style images on the left, top-aligned header and floating body text on the right.","zones":["Two overlapping Polaroid-style images on the left, top-aligned header and floating body text on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["polaroid-stack","split-layout","diary-entry"],"avoid":["Data-heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Image duos","Storytelling or chronological entries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"polaroid-back","purpose":"Background overlapping image","bbox":[0.1,0.15,0.25,0.6],"priority":2},{"id":"polaroid-front","purpose":"Foreground overlapping image","bbox":[0.2,0.45,0.35,0.4],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left text block featuring highlighted ribbons, right-aligned image with an offset background accent rectangle.","zones":["Left text block featuring highlighted ribbons, right-aligned image with an offset background accent rectangle."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["text-ribbons","offset-image-shadow","asymmetrical"],"avoid":["Bullet-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Poetry or multi-line quotes","Team photos or key subject features"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"featured-image","purpose":"Main focal image on the right","bbox":[0.45,0.2,0.45,0.55],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Left text block featuring highlighted ribbons, right-aligned image with an offset background accent rectangle.","zones":["Left text block featuring highlighted ribbons, right-aligned image with an offset background accent rectangle."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["text-ribbons","offset-image-shadow","asymmetrical"],"avoid":["Bullet-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Poetry or multi-line quotes","Team photos or key subject features"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"featured-image","purpose":"Main focal image on the right","bbox":[0.45,0.2,0.45,0.55],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered landscape image with a semi-transparent overlay and solid brush strokes holding the closing text, flanked by small symmetrical icons.","zones":["Centered landscape image with a semi-transparent overlay and solid brush strokes holding the closing text, flanked by small symmetrical icons."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Morandi pastel color palette (dusty pinks and beiges)","Watercolor brush stroke accents under text","Thick white borders on photos (Polaroid effect)"],"optional_variants":["centered-outro","brush-text-plate","symmetrical"],"avoid":["Informational content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you / Closing slides","Final calls to action"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"outro-image","purpose":"Centered closing background image","bbox":[0.2,0.25,0.6,0.5],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Photos frequently use thick white strokes to simulate printed polaroids.
- Images are often masked into diverse geometric shapes (circles, adjacent triangles).
- Large lifestyle photos are sometimes overlaid with hollow white geometric frames framing central text.

【图标与装饰】
- Uses informal, standard emojis natively embedded in text blocks.
- Small hand-drawn vector illustrations (e.g., balloons, apples) used as symmetrical or floating accents.

【数据页构图】
- Two overlapping Polaroid-style images on the left, top-aligned header and floating body text on the right.

【图表风格】
- No data charts present; relies entirely on image galleries and text layouts.

【章节页构图】
- Left side solid color block containing text, right side large image overlaid with a thick, hollow white geometric frame and centered text.

【收尾页构图】
- Centered landscape image with a semi-transparent overlay and solid brush strokes holding the closing text, flanked by small symmetrical icons.

【禁止】
- Avoid high-contrast black text, which breaks the soft pastel mood.
- Avoid tight, dense text blocks.
- Avoid sharp, corporate vector graphics; prefer organic or soft-edged elements.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Personal portfolios or lifestyle vlogs、Moodboards or creative briefs、Scrapbook-style event recaps、Boutique brand storytelling。
