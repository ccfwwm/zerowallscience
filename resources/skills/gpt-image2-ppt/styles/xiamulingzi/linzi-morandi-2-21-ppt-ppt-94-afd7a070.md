# 94 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-94-afd7a070

## 风格ID
linzi-morandi-2-21-ppt-ppt-94-afd7a070

## 风格名称
94 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-94-afd7a070

## 风格描述
A minimalist, nature-inspired presentation template utilizing a desaturated 'Morandi' green color palette, floating cards, and elegant typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Pale sage backgrounds with pure white floating containers. Dark muted green used for primary text and accents to maintain low contrast.
- fonts: Sophisticated Serif font for prominent titles and numbers; highly legible light Sans-serif for secondary text.
- spacing: Extremely generous padding inside floating cards; wide margins around the edge of the slide frame.
- shape_language: Soft and organic. Heavily rounded rectangles and perfect circles. No sharp corners on primary containers.
- texture: Clean matte finish with paper-like soft drop shadows.
- grid: Symmetrical center alignments for anchors, with strict 2-column or 4-column subdivision on content pages.
- motion_or_depth: 2.5D depth achieved by placing solid white rounded cards with blurred drop shadows over flat colored backgrounds.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「94 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-94-afd7a070」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, nature-inspired presentation template utilizing a desaturated 'Morandi' green color palette, floating cards, and elegant typography.
- 推荐配色：#DCE3DC、#FFFFFF、#8C9B87、#A7B3A3、#5A6556

【不可丢失的风格锚点】
- Large, central floating white cards with heavily rounded corners
- Desaturated, low-contrast sage green background elements
- Soft, uniform drop shadows to create a layered 'paper' effect
- Minimalist typography mixing elegant serifs for headers and clean sans-serifs for body text

【字体】
- Center-align titles on covers and section breaks
- Use dark, muted green for text instead of stark black or dark gray
- Include subtle English subtitles under primary localized titles for a sophisticated typographic texture

【封面页构图】
- Centered large floating rounded rectangle with centered title and subtitle, framed by corner accents

【内容页构图】
- Asymmetrical split background (60/40) with left-aligned text column and right-aligned device frame media

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered large floating rounded rectangle with centered title and subtitle, framed by corner accents","zones":["Centered large floating rounded rectangle with centered title and subtitle, framed by corner accents"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["card-layout","centered","minimal"],"avoid":["data presentation","bulleted lists","copying source assets, source text, or an exact source arrangement"],"best_for":["deck title","welcome message"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered large floating card containing a circular number badge above a centered title","zones":["Centered large floating card containing a circular number badge above a centered title"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["section-break","numbered-card"],"avoid":["detailed content","media display","copying source assets, source text, or an exact source arrangement"],"best_for":["section transitions","chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetrical split background (60/40) with left-aligned text column and right-aligned device frame media","zones":["Asymmetrical split background (60/40) with left-aligned text column and right-aligned device frame media"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["split-background","device-mockup","two-column"],"avoid":["dense text formatting","multi-chart dashboards","copying source assets, source text, or an exact source arrangement"],"best_for":["product showcases","software screenshots","image+text pairings"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"device-screen","purpose":"replaceable screenshot or image within device frame","bbox":[0.58,0.31,0.31,0.36],"priority":1}]},{"id":"content-comparison","composition":"Two contrasting text blocks side-by-side (one dark/filled, one light/floating) with a top-left universal section header","zones":["Two contrasting text blocks side-by-side (one dark/filled, one light/floating) with a top-left universal section header"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["two-column","contrast-blocks","text-heavy"],"avoid":["large images","data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["comparisons","pros and cons","dual perspectives"],"evidence_pages":["page-06"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Four equal-width vertical content cards aligned horizontally, each containing top icon, text, and bottom number badge","zones":["Four equal-width vertical content cards aligned horizontally, each containing top icon, text, and bottom number badge"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["four-column","cards","vertical-flow"],"avoid":["long paragraphs","complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["process steps","core features","team members"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered large floating card containing a circular number badge above a centered title","zones":["Centered large floating card containing a circular number badge above a centered title"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["section-break","numbered-card"],"avoid":["detailed content","media display","copying source assets, source text, or an exact source arrangement"],"best_for":["section transitions","chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered large floating rounded rectangle with concluding centered text, framed by corner accents","zones":["Centered large floating rounded rectangle with concluding centered text, framed by corner accents"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Large, central floating white cards with heavily rounded corners","Desaturated, low-contrast sage green background elements","Soft, uniform drop shadows to create a layered 'paper' effect"],"optional_variants":["card-layout","centered","bookend"],"avoid":["detailed summaries","data","copying source assets, source text, or an exact source arrangement"],"best_for":["closing message","thank you","contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Embed images inside clean device mockups (e.g., monitors) or soft-rounded rectangular masks
- Prefer well-lit, minimalist photography that matches the low-saturation aesthetic

【图标与装饰】
- Solid flat icons enclosed in circular or rounded-rectangular badges
- Icons should match the primary accent color (white on green, or green on light backgrounds)

【数据页构图】
- Four equal-width vertical content cards aligned horizontally, each containing top icon, text, and bottom number badge

【图表风格】
- No explicit charts provided; if added, they should use the desaturated Morandi palette with soft rounded bar tops and no harsh borders.

【章节页构图】
- Centered large floating card containing a circular number badge above a centered title

【收尾页构图】
- Centered large floating rounded rectangle with concluding centered text, framed by corner accents

【禁止】
- Do not reuse the specific bamboo leaf illustrations, as they are likely protected graphic assets
- Avoid high-contrast, highly saturated colors like pure red or bright blue
- Avoid sharp 90-degree corners on prominent layout containers
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Wellness, spa, or natural product brand decks、Minimalist portfolio presentations、High-end, elegant corporate overviews、Environmental or sustainability reports。
