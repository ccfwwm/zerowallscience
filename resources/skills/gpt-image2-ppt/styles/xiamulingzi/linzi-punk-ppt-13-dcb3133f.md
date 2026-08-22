# 个性朋克（13）---木七设计 · ppt模板 / linzi-punk-ppt-13-dcb3133f

## 风格ID
linzi-punk-ppt-13-dcb3133f

## 风格名称
个性朋克（13）---木七设计 · ppt模板 / linzi-punk-ppt-13-dcb3133f

## 风格描述
Edgy, high-contrast presentation style featuring full-bleed atmospheric photography, bold geometric patterns, and vibrant purple-magenta duotone accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Pure blacks and whites for structure, with vibrant purple-to-magenta gradients for accents, icons, and image overlays
- fonts: Bold, all-caps geometric sans-serif for headings; clean, highly legible sans-serif for body copy
- spacing: Generous negative space around text blocks, contrasted tightly against hard-edged image borders
- shape_language: Strictly geometric: sharp rectangles, rigid lines, perfect circles for icon containers, and repeating geometric grids
- texture: Moody photographic textures heavily filtered (B&W or duotone), overlaid with crisp, flat vector patterns
- grid: Modular grid heavily utilizing halves and thirds for stark vertical splits
- motion_or_depth: High contrast between deep atmospheric photo backgrounds and flat, stark foreground typography/vectors

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「个性朋克（13）---木七设计 · ppt模板 / linzi-punk-ppt-13-dcb3133f」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Edgy, high-contrast presentation style featuring full-bleed atmospheric photography, bold geometric patterns, and vibrant purple-magenta duotone accents.
- 推荐配色：#111111、#FFFFFF、#9B51E0、#D952D9、#F5F5F5

【不可丢失的风格锚点】
- Vibrant duotone gradients against pure black and white
- Overlaying geometric matrices (dots, hexagons, isometric lines)
- High-contrast full-bleed imagery with stark typographic overlays
- Minimalist thin-line accents separating content zones

【字体】
- Headings: Bold, all-caps, tracking slightly increased, often paired with thin horizontal dividing lines
- Body: Standard weight sans-serif, high contrast against background (white on dark, dark gray on light)
- Numbers: Oversized and bold, used structurally to anchor lists and sections

【封面页构图】
- Full-bleed background with centered, stacked typographic lockup and a prominent geometric vector graphic

【内容页构图】
- 50/50 vertical split: left full-bleed image, right content area featuring text blocks, horizontal progress bars, and a dot matrix graphic

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with centered, stacked typographic lockup and a prominent geometric vector graphic","zones":["Full-bleed background with centered, stacked typographic lockup and a prominent geometric vector graphic"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["centered","full-bleed","dark-mode","hero"],"avoid":["Heavy content introductions","Data-driven summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Main title covers","Major event announcements"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_bg","purpose":"Atmospheric, dark-tinted background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Three-pane transition: left minimalist text area, central geometric pattern column, right heavy-tinted vertical image","zones":["Three-pane transition: left minimalist text area, central geometric pattern column, right heavy-tinted vertical image"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["section-break","pane-split","duotone"],"avoid":["Standard content body","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section dividers"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"vertical_right_img","purpose":"Heavily tinted right-side media","bbox":[0.5,0,0.5,1],"priority":1}]}
- content: [{"id":"content-content","composition":"50/50 vertical split: left full-bleed image, right content area featuring text blocks, horizontal progress bars, and a dot matrix graphic","zones":["50/50 vertical split: left full-bleed image, right content area featuring text blocks, horizontal progress bars, and a dot matrix graphic"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["split-screen","progress-bars","image-left"],"avoid":["Large data sets","Multi-image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Skill breakdowns","Feature highlights","Team profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"split_media_left","purpose":"Moody vertical portrait or texture","bbox":[0,0,0.45,1],"priority":1}]},{"id":"content-comparison","composition":"Full-bleed duotone/tinted background image overlaid with a large left-aligned geometric pattern and right-aligned typographic lockup","zones":["Full-bleed duotone/tinted background image overlaid with a large left-aligned geometric pattern and right-aligned typographic lockup"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["full-bleed","overlay","pattern","tinted"],"avoid":["Detailed lists","Charts and graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Section intros","Key quotes","High-impact statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"bg_tinted","purpose":"Background texture/photo to be heavily color-tinted","bbox":[0,0,1,1],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Full-bleed dark atmospheric background with a floating line chart and minimal title in the upper left","zones":["Full-bleed dark atmospheric background with a floating line chart and minimal title in the upper left"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["chart","dark-mode","floating-data"],"avoid":["Complex data tables","Multi-bar charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend lines","High-level metrics","Performance overview"],"evidence_pages":["page-07"],"external_image_slots":[{"id":"dark_bg_chart","purpose":"Dark, unobstructed background for chart overlay","bbox":[0,0,1,1],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Solid dark background with a single central heading and a horizontal 4-column text array below","zones":["Solid dark background with a single central heading and a horizontal 4-column text array below"],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["horizontal-list","numbers","minimal","dark"],"avoid":["Complex explanations","Media-heavy showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Core values","Process steps"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- agenda: {"id":"agenda-primary","composition":"Solid dark background with a single central heading and a horizontal 4-column text array below","zones":["Solid dark background with a single central heading and a horizontal 4-column text array below"],"content_capacity":{"density":"low","max_items":5},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["horizontal-list","numbers","minimal","dark"],"avoid":["Complex explanations","Media-heavy showcases","copying source assets, source text, or an exact source arrangement"],"best_for":["Agendas","Core values","Process steps"],"evidence_pages":["page-01"],"external_image_slots":[]}
- closing: {"id":"closing-primary","composition":"Full-bleed darkened image with centered logo/graphic and title lockup","zones":["Full-bleed darkened image with centered logo/graphic and title lockup"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Vibrant duotone gradients against pure black and white","Overlaying geometric matrices (dots, hexagons, isometric lines)","High-contrast full-bleed imagery with stark typographic overlays"],"optional_variants":["closing","centered","dark-overlay"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["End of presentation","Q&A prompts","Contact info"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"closing_bg","purpose":"Darkened background image for final slide","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds with heavy dark or vibrant gradient color washes
- Black and white conversion for distinct column panels
- Layered beneath stark geometric vector graphics

【图标与装饰】
- Uniform thin-line style
- Often housed within vibrant gradient-filled circular containers or used as standalone minimal accents

【数据页构图】
- Full-bleed dark atmospheric background with a floating line chart and minimal title in the upper left

【图表风格】
- Dark mode line charts with thin, distinct accent colors
- Minimalist grid lines and axes to blend seamlessly into atmospheric backgrounds

【章节页构图】
- Three-pane transition: left minimalist text area, central geometric pattern column, right heavy-tinted vertical image

【收尾页构图】
- Full-bleed darkened image with centered logo/graphic and title lockup

【禁止】
- Avoid warm, earthy, or pastel tones that break the stark cyber/punk aesthetic
- Do not use rounded, playful, or organic typography
- Avoid unedited/unfiltered bright stock photography; images must be moody, B&W, or tinted
- Do not clutter layouts; maintain clear distinction between media and text zones
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Music festivals, nightlife, or entertainment pitches、Edgy technology or fashion brand decks、Creative agency portfolios requiring a bold, moody vibe、Event sponsorships and styling proposals。
