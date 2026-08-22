# 莫兰迪风格PPT (35) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-35-1dc1d3b3

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-35-1dc1d3b3

## 风格名称
莫兰迪风格PPT (35) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-35-1dc1d3b3

## 风格描述
An elegant, editorial-style template featuring a muted Morandi color palette, extreme typographic contrast, and minimalist geometric image framing.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream (#F4F2E6) as primary background, with strong alternating section backgrounds in Mustard (#D99A29), Crimson (#8A151B), and Olive (#697A59). Charcoal (#3A3A3A) for primary text.
- fonts: High-contrast, elegant serif (e.g., Playfair Display or Bodoni) for macro titles; clean, wide geometric sans-serif for micro text and UI elements.
- spacing: Generous negative space, utilizing a wide-margin editorial grid to isolate imagery and typography.
- shape_language: Strictly orthogonal rectangles intermixed with stark half-circle/letterform masking.
- texture: Completely flat, relying on solid blocks of color and high-quality photography rather than gradients or physical textures.
- grid: Multi-column editorial grid, often asymmetric, with deliberate overlapping of image containers and color blocks.
- motion_or_depth: Flat design with depth implied exclusively through the overlapping of 2D planes (images over color blocks).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (35) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-35-1dc1d3b3」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style template featuring a muted Morandi color palette, extreme typographic contrast, and minimalist geometric image framing.
- 推荐配色：#F4F2E6、#D99A29、#3A3A3A、#697A59、#8A151B

【不可丢失的风格锚点】
- Persistent thin-line 'navigation' header and footer across most slides
- Extreme contrast between oversized serif display text and tiny sans-serif body copy
- Solid color offset blocks behind images serving as pseudo drop-shadows
- Distinctive geometric letterform masking (e.g., D-shape)
- Boxed text treatments with delicate 1px borders

【字体】
- Display titles must use an elegant serif, set at massive scales, often spanning multiple lines or breaking grid boundaries.
- Meta-information, headers, and footers use uppercase sans-serif with wide tracking (letter-spacing).
- Body text is kept unusually small and dense, acting almost as a textural element alongside large imagery.

【封面页构图】
- Massive D-shaped image mask juxtaposed with oversized horizontal/vertical serif typography

【内容页构图】
- Overwhelmingly large left-aligned typography paired with an edge-anchored image and color block combination

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Massive D-shaped image mask juxtaposed with oversized horizontal/vertical serif typography","zones":["Massive D-shaped image mask juxtaposed with oversized horizontal/vertical serif typography"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Persistent thin-line 'navigation' header and footer across most slides","Extreme contrast between oversized serif display text and tiny sans-serif body copy","Solid color offset blocks behind images serving as pseudo drop-shadows"],"optional_variants":["letter-mask","hero-cover","macro-typography"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Bold thematic introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_mask","purpose":"Primary thematic visual","bbox":[0.57,0.19,0.28,0.61],"priority":1}]}
- section: {"id":"section-primary","composition":"Solid colored background with a staggered two-image layout and floating typographic elements","zones":["Solid colored background with a staggered two-image layout and floating typographic elements"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Persistent thin-line 'navigation' header and footer across most slides","Extreme contrast between oversized serif display text and tiny sans-serif body copy","Solid color offset blocks behind images serving as pseudo drop-shadows"],"optional_variants":["solid-background","staggered-images","dual-focus"],"avoid":["Long form text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Dual concept comparisons","Section dividers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image_left","purpose":"Supporting portrait or detail shot","bbox":[0.07,0.45,0.23,0.41],"priority":2},{"id":"image_right","purpose":"Primary subject portrait","bbox":[0.68,0.27,0.23,0.36],"priority":1}]}
- content: [{"id":"content-content","composition":"Overwhelmingly large left-aligned typography paired with an edge-anchored image and color block combination","zones":["Overwhelmingly large left-aligned typography paired with an edge-anchored image and color block combination"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Persistent thin-line 'navigation' header and footer across most slides","Extreme contrast between oversized serif display text and tiny sans-serif body copy","Solid color offset blocks behind images serving as pseudo drop-shadows"],"optional_variants":["macro-typography","edge-anchored","color-block-extension"],"avoid":["Complex lists","Detailed charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Impact statements","Key takeaways","Chapter headers"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image_right","purpose":"Thematic context","bbox":[0.63,0.24,0.18,0.4],"priority":1}]},{"id":"content-comparison","composition":"Centered/right image framed by an asymmetrical, overlapping solid color rectangle","zones":["Centered/right image framed by an asymmetrical, overlapping solid color rectangle"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Persistent thin-line 'navigation' header and footer across most slides","Extreme contrast between oversized serif display text and tiny sans-serif body copy","Solid color offset blocks behind images serving as pseudo drop-shadows"],"optional_variants":["offset-frame","asymmetrical-balance","image-focus"],"avoid":["Multi-data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Product highlights","Single concept explanations"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"main_image","purpose":"Core visual subject","bbox":[0.56,0.31,0.32,0.37],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Solid dark background with a minimalist, unstyled bar chart and strong vertical divider","zones":["Solid dark background with a minimalist, unstyled bar chart and strong vertical divider"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Persistent thin-line 'navigation' header and footer across most slides","Extreme contrast between oversized serif display text and tiny sans-serif body copy","Solid color offset blocks behind images serving as pseudo drop-shadows"],"optional_variants":["solid-background","minimal-chart","dark-mode-data"],"avoid":["Complex multi-axis data","copying source assets, source text, or an exact source arrangement"],"best_for":["Financial summaries","Trend visualization","Metric highlights"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Solid colored background with a staggered two-image layout and floating typographic elements","zones":["Solid colored background with a staggered two-image layout and floating typographic elements"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Persistent thin-line 'navigation' header and footer across most slides","Extreme contrast between oversized serif display text and tiny sans-serif body copy","Solid color offset blocks behind images serving as pseudo drop-shadows"],"optional_variants":["solid-background","staggered-images","dual-focus"],"avoid":["Long form text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Dual concept comparisons","Section dividers"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"image_left","purpose":"Supporting portrait or detail shot","bbox":[0.07,0.45,0.23,0.41],"priority":2},{"id":"image_right","purpose":"Primary subject portrait","bbox":[0.68,0.27,0.23,0.36],"priority":1}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in sharp rectangular containers or specific geometric masks (like half-circles).
- Photos are frequently paired with an adjacent or overlapping solid color block (mustard or olive) of roughly equal size.
- Full-bleed images are avoided in favor of inset, bordered frames to maintain the editorial layout.

【图标与装饰】
- Monocolor, flat vector icons.
- Icons are kept small and used strictly for utility or data representation, never as illustrative centerpieces.

【数据页构图】
- Solid dark background with a minimalist, unstyled bar chart and strong vertical divider

【图表风格】
- Minimalist structural lines.
- Data series use solid, muted template colors without gradients or 3D effects.
- Gridlines are extremely thin (1px) and low contrast (e.g., white on crimson).

【章节页构图】
- Solid colored background with a staggered two-image layout and floating typographic elements

【收尾页构图】
- Massive D-shaped image mask juxtaposed with oversized horizontal/vertical serif typography

【禁止】
- Avoid soft drop shadows or glow effects; rely on solid offset blocks.
- Do not use highly saturated neon colors; strictly adhere to the muted Morandi palette.
- Avoid casual or handwritten fonts; typography must remain strictly formal and high-contrast.
- Do not cram text; negative space is a core component of this design.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lookbook presentations、High-end architecture or interior design portfolios、Boutique agency capabilities decks、Editorial-style brand guidelines。
