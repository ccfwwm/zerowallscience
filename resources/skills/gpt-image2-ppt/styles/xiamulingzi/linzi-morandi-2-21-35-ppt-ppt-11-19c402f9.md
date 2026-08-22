# 莫兰迪风格PPT (11) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-11-19c402f9

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-11-19c402f9

## 风格名称
莫兰迪风格PPT (11) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-11-19c402f9

## 风格描述
An elegant, editorial-style presentation utilizing a muted sage and cream palette, characterized by overlapping layout zones and sophisticated serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Sage green for structural background zones; cream/off-white for layered content cards; mustard orange for interactive/highlight elements; deep black for high-contrast text.
- fonts: Elegant transitional serif for primary headings; clean, highly legible sans-serif for body copy and metadata. Inter/Playfair Display equivalents.
- spacing: Generous outer margins with tight clustering of related text. Frequent use of 50/50 or 30/40/30 split vertical column structures.
- shape_language: Strictly rectilinear containers with sharp corners, contrasted strictly by perfect pill-shaped buttons and circular icon backgrounds.
- texture: Flat, matte color zones paired with rich, full-bleed photography. No gradients or drop shadows.
- grid: Modular vertical column system (2-column and 3-column) heavily utilizing vertical slices that break standard horizontal reading lines.
- motion_or_depth: Depth is achieved purely through literal 2D overlapping of solid color boxes over photography.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (11) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-11-19c402f9」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, editorial-style presentation utilizing a muted sage and cream palette, characterized by overlapping layout zones and sophisticated serif typography.
- 推荐配色：#8A9588、#F4F1EA、#FFFFFF、#1A1A1A、#E59B39

【不可丢失的风格锚点】
- Asymmetric color-block backgrounds flanking content
- Underscore-prefixed bold serif headers
- Floating, overlapping text containers on top of photography
- Pill-shaped outlined or solid colored buttons
- High-contrast mix of large serif and small sans-serif typography

【字体】
- Headings must use a high-contrast serif typeface, often styled with a preceding underscore or integrated directly over images.
- Body text must remain small, highly legible sans-serif, with line height >1.4, generally aligned left.
- Horizontal separator lines are used to anchor section headers above corresponding body columns.

【封面页构图】
- Split asymmetric background with center-overlapping image and floating offset text card

【内容页构图】
- Three-column, two-row balanced grid with central image spine

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Split asymmetric background with center-overlapping image and floating offset text card","zones":["Split asymmetric background with center-overlapping image and floating offset text card"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["overlapping-card","split-background","editorial-cover"],"avoid":["Data heavy content","Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Deck covers","Major section introductions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_center","purpose":"Primary striking visual","bbox":[0.34,0.0,0.41,1.0],"priority":1}]}
- section: {"id":"section-primary","composition":"Large edge-bleed image alongside structured text column with inline button","zones":["Large edge-bleed image alongside structured text column with inline button"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["edge-bleed","image-overlay","call-to-action"],"avoid":["Complex data","Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Hero statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_hero","purpose":"Immersive visual context","bbox":[0.12,0.05,0.51,0.9],"priority":1}]}
- content: [{"id":"content-content","composition":"Three-column, two-row balanced grid with central image spine","zones":["Three-column, two-row balanced grid with central image spine"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["3-column-grid","square-crop","balanced-text"],"avoid":["Long form narrative","Large chart displays","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product feature pairings","Timeline milestones"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top_center_square","purpose":"Profile or detail shot","bbox":[0.4,0.1,0.2,0.35],"priority":1},{"id":"bottom_center_square","purpose":"Profile or detail shot","bbox":[0.4,0.5,0.2,0.35],"priority":2}]},{"id":"content-comparison","composition":"Split-pane background with overlapping central image and offset UI card","zones":["Split-pane background with overlapping central image and offset UI card"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["split-pane","floating-card","asymmetric-balance"],"avoid":["Standard bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Contact information","App downloads","Product highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center_portrait","purpose":"Contextual human or product shot","bbox":[0.26,0.25,0.17,0.5],"priority":1},{"id":"floating_ui_card","purpose":"Highlight graphic or secondary contextual image","bbox":[0.44,0.3,0.46,0.4],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Three-column icon feature with solid footer block","zones":["Three-column icon feature with solid footer block"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["3-column","icon-driven","solid-footer"],"avoid":["Detailed technical specs","Photography-led content","copying source assets, source text, or an exact source arrangement"],"best_for":["Core values","Service pillars","Summarized takeaways"],"evidence_pages":["page-06"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large edge-bleed image alongside structured text column with inline button","zones":["Large edge-bleed image alongside structured text column with inline button"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["edge-bleed","image-overlay","call-to-action"],"avoid":["Complex data","Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Hero statements"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"left_hero","purpose":"Immersive visual context","bbox":[0.12,0.05,0.51,0.9],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Triple-pane vertical layout with thick margin line and separated text block","zones":["Triple-pane vertical layout with thick margin line and separated text block"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["thick-margin","horizontal-rule","right-aligned-text"],"avoid":["Detailed statistical data","copying source assets, source text, or an exact source arrangement"],"best_for":["Quotes","Key takeaways","Mission statements"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"column_image","purpose":"Mood or texture establishing shot","bbox":[0.17,0.05,0.33,0.9],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Minimalist centered text inside a thick continuous border","zones":["Minimalist centered text inside a thick continuous border"],"content_capacity":{"density":"very low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetric color-block backgrounds flanking content","Underscore-prefixed bold serif headers","Floating, overlapping text containers on top of photography"],"optional_variants":["thick-border","absolute-center","minimalist"],"avoid":["Any descriptive content","copying source assets, source text, or an exact source arrangement"],"best_for":["Endings","Massive single-word impacts","Transition pauses"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images act as structural columns or full-bleed background zones rather than framed pictures.
- Vertical portrait and perfect square aspect ratios are preferred over standard landscape.
- Photography should ideally feature low contrast, vintage, or muted color grading to match the background palette.

【图标与装饰】
- Minimalist line-art icons housed within solid circular background containers.
- Icons must match the muted secondary background colors.

【数据页构图】
- Three-column icon feature with solid footer block

【图表风格】
- No explicit charts shown, but data should be presented via modular text-and-number grids utilizing the established column layouts.

【章节页构图】
- Large edge-bleed image alongside structured text column with inline button

【收尾页构图】
- Minimalist centered text inside a thick continuous border

【禁止】
- Do not use drop shadows, gradients, or 3D effects.
- Avoid bright, highly saturated colors that break the muted editorial aesthetic.
- Do not center-align long blocks of body text; maintain strong left alignment.
- Avoid standard framed 4:3 images; force images to edge bleed or strict structural column dimensions.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion or lifestyle brand lookbooks、Creative agency credentials or portfolios、Editorial-style annual reports、High-end product or team showcases。
