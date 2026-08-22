# 莫兰迪风格PPT (5) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-5-b077b49a

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-5-b077b49a

## 风格名称
莫兰迪风格PPT (5) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-5-b077b49a

## 风格描述
A sophisticated, editorial-style presentation featuring a Morandi color palette, grainy organic background shapes, botanical shadow overlays, and elegant serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream/off-white acts as the base; terracotta, mustard, and sand act as structural and accent colors. Dark brown/charcoal is used for readable text.
- fonts: Primary headings utilize an elegant, classic Serif; body text and technical UI elements use a legible, modern Sans-serif.
- spacing: Generous margins with wide tracking on subtitles. Elements are separated by clear macro-whitespace, avoiding clutter.
- shape_language: Sharp, structured rectangles for content frames juxtaposed against fluid, asymmetrical organic blobs in the background.
- texture: Heavy film grain or noise applied to background shapes, paired with translucent photorealistic shadow projections.
- grid: Flexible multi-column modular grids (2, 3, and 4 columns) integrated with asymmetrical block layering.
- motion_or_depth: Distinct dual-layer depth: background (flat blobs + shadows) vs foreground (floating white cards or hard-edged image containers with drop shadows).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (5) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-5-b077b49a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, editorial-style presentation featuring a Morandi color palette, grainy organic background shapes, botanical shadow overlays, and elegant serif typography.
- 推荐配色：#A33E20、#DE9842、#C0A78E、#3A332E、#F3EFE9

【不可丢失的风格锚点】
- Floating central white content cards with soft drop shadows
- Textured, grainy organic blob shapes spanning backgrounds
- Photorealistic botanical/leaf shadow overlays on edges
- Signature three-dot decorative accent (rust, sand, mustard) placed near titles
- Pill-shaped call-to-action buttons

【字体】
- Center-aligned or left-aligned Serif for main slide titles
- Subtitles and small metadata use uppercase Sans-serif with wide letter-spacing
- Body paragraphs are set in a lightweight Sans-serif with generous line height
- Large data callouts use bold Sans-serif typography

【封面页构图】
- Floating rectangular content card centered over a grainy, organically-shaped background with botanical shadows.

【内容页构图】
- Two-column layout featuring a text/data block on the left and a large rectangular image on the right, under a centered title.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Floating rectangular content card centered over a grainy, organically-shaped background with botanical shadows.","zones":["Floating rectangular content card centered over a grainy, organically-shaped background with botanical shadows."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["minimal","floating-card","textured-background"],"avoid":["Data-heavy content","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Deck titles","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Full-bleed left image taking up half the slide, paired with a stark white right half containing right-aligned typography.","zones":["Full-bleed left image taking up half the slide, paired with a stark white right half containing right-aligned typography."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["half-bleed-image","right-aligned-text","chapter-break"],"avoid":["Detailed bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Bold statements","Chapter introductions"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"left-bleed","purpose":"Immersive section mood image","bbox":[0.0,0.0,0.55,1.0],"priority":1}]}
- content: [{"id":"content-content","composition":"Two-column layout featuring a text/data block on the left and a large rectangular image on the right, under a centered title.","zones":["Two-column layout featuring a text/data block on the left and a large rectangular image on the right, under a centered title."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["image-right","data-callout","split-column"],"avoid":["Long-form text reading","Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics alongside imagery","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-feature","purpose":"Visual anchor corresponding to data","bbox":[0.45,0.35,0.48,0.55],"priority":1}]},{"id":"content-comparison","composition":"Asymmetrical 50/50 split layout: white background with text/image on the left, solid accent background with text/button on the right.","zones":["Asymmetrical 50/50 split layout: white background with text/image on the left, solid accent background with text/button on the right."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["50-50-split","contrast-panels","interactive-prompt"],"avoid":["Dense data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Product feature deep-dives","Comparative statements","Call-to-action sections"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-media","purpose":"Product or feature visualization","bbox":[0.05,0.45,0.4,0.45],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Horizontally split layout with a solid color top header and a four-column white lower section for numbered items.","zones":["Horizontally split layout with a solid color top header and a four-column white lower section for numbered items."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["split-background","four-columns","numbered-list"],"avoid":["Large image displays","Single focus quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Multi-step processes","Core services lists"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Two-column layout featuring a text/data block on the left and a large rectangular image on the right, under a centered title.","zones":["Two-column layout featuring a text/data block on the left and a large rectangular image on the right, under a centered title."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["image-right","data-callout","split-column"],"avoid":["Long-form text reading","Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics alongside imagery","Feature highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-feature","purpose":"Visual anchor corresponding to data","bbox":[0.45,0.35,0.48,0.55],"priority":1}]}]
- agenda: {"id":"agenda-primary","composition":"Horizontally split layout with a solid color top header and a four-column white lower section for numbered items.","zones":["Horizontally split layout with a solid color top header and a four-column white lower section for numbered items."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["split-background","four-columns","numbered-list"],"avoid":["Large image displays","Single focus quotes","copying source assets, source text, or an exact source arrangement"],"best_for":["Table of contents","Multi-step processes","Core services lists"],"evidence_pages":["page-01"],"external_image_slots":[]}
- quote: {"id":"quote-primary","composition":"Minimalist layout with top-corner typography and a dominant wide, panoramic image spanning the bottom half.","zones":["Minimalist layout with top-corner typography and a dominant wide, panoramic image spanning the bottom half."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["minimalist","panoramic-image","generous-whitespace"],"avoid":["Complex data or lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Hero product shots","Impactful quotes with background imagery","Section transitions"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"panoramic-feature","purpose":"Wide hero image or mood texture","bbox":[0.05,0.38,0.9,0.53],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Closing slide mirroring the cover: Floating rectangular card centered over a grainy, organically-shaped background.","zones":["Closing slide mirroring the cover: Floating rectangular card centered over a grainy, organically-shaped background."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Floating central white content cards with soft drop shadows","Textured, grainy organic blob shapes spanning backgrounds","Photorealistic botanical/leaf shadow overlays on edges"],"optional_variants":["bookend","floating-card","minimal-closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in sharp, unrounded rectangular frames
- Photography favors warm, earthy, or desaturated tones to match the Morandi palette
- Full-bleed left-side images are used as anchoring structural elements on section slides

【图标与装饰】
- Minimalist line-art arrows enclosed in thin circular frames for 'View More' links
- Three-dot horizontal sequences act as a primary decorative separator

【数据页构图】
- Horizontally split layout with a solid color top header and a four-column white lower section for numbered items.

【图表风格】
- Data is represented typographically rather than with traditional charts
- Percentages are set in oversized bold Sans-serif, stacked above explanatory body text inside solid color blocks

【章节页构图】
- Full-bleed left image taking up half the slide, paired with a stark white right half containing right-aligned typography.

【收尾页构图】
- Closing slide mirroring the cover: Floating rectangular card centered over a grainy, organically-shaped background.

【禁止】
- Avoid stark, pure whites (#FFFFFF) or blacks (#000000) as primary backgrounds; use warm creams and dark browns instead.
- Do not use heavily rounded corners on image frames, as it breaks the contrast with the organic background blobs.
- Avoid bright neon or primary colors that clash with the muted Morandi palette.
- Do not crowd the edges; maintain the overlapping botanical shadow areas as negative space.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、High-end fashion or lifestyle brand decks、Case study presentations requiring an editorial look、Boutique agency pitches。
