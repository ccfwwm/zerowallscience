# 16 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-16-1074ff16

## 风格ID
linzi-morandi-2-21-ppt-ppt-16-1074ff16

## 风格名称
16 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-16-1074ff16

## 风格描述
An elegant, bohemian-inspired editorial presentation template featuring earthy tones, asymmetrical layouts, and organic line-art accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white backgrounds with dominant taupe/brown structural blocks and dark grey text.
- fonts: High-contrast serif (e.g., Garamond) for primary headings; geometric sans-serif (e.g., Lato) for body and technical copy.
- spacing: Generous outer margins with internal overlapping elements that break standard grid confines.
- shape_language: Strict rectangular image masks juxtaposed with fluid, organic vector line-art (leaves, flowers, arches).
- texture: Smooth flat vector colors contrasting with rich, natural photographic textures.
- grid: Asymmetrical editorial grid, frequently utilizing 60/40 splits and offset alignments.
- motion_or_depth: Shallow depth achieved through direct overlapping of structural color blocks, images, and delicate vector illustrations without drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「16 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-16-1074ff16」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, bohemian-inspired editorial presentation template featuring earthy tones, asymmetrical layouts, and organic line-art accents.
- 推荐配色：#86715B、#A88E75、#D2BCA5、#F8F7F5、#3A3A3A

【不可丢失的风格锚点】
- Muted earth-tone color scheme
- Overlapping organic botanical and geometric line-art
- High-contrast serif headings paired with clean sans-serif body
- Vertical text elements for branding or secondary labels

【字体】
- Use elegant serif fonts for primary headers, creating an editorial feel.
- Employ small, vertically oriented sans-serif text on margins for page numbers or subtle branding.
- Keep body text in a legible sans-serif, maintaining moderate line height for readability.

【封面页构图】
- Full-bleed background image with centered, high-contrast typography

【内容页构图】
- Large offset image with overlapping typography and corner block accents

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with centered, high-contrast typography","zones":["Full-bleed background image with centered, high-contrast typography"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["full-bleed","centered-text","minimal"],"avoid":["Data-heavy content","Detailed agendas","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_bg","purpose":"Atmospheric background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Top-centered image flanked by organic vector art and corner text blocks","zones":["Top-centered image flanked by organic vector art and corner text blocks"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["asymmetrical","image-top","vector-overlay"],"avoid":["Complex data","Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Welcome messages"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_image","purpose":"Primary section imagery","bbox":[0.27,0.07,0.51,0.6],"priority":1}]}
- content: [{"id":"content-content","composition":"Large offset image with overlapping typography and corner block accents","zones":["Large offset image with overlapping typography and corner block accents"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["overlapping-text","large-image","corner-accents"],"avoid":["Bullet-heavy lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Core concept explanations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main_photo","purpose":"Featured subject or texture","bbox":[0.27,0.11,0.65,0.81],"priority":1}]},{"id":"content-comparison","composition":"Split layout with clustered vertical color bars and rotated display text","zones":["Split layout with clustered vertical color bars and rotated display text"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["vertical-text","color-bars","split-layout"],"avoid":["Financial data","Dense text blocks","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Creative rationale"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"mood_image","purpose":"Inspirational or thematic image","bbox":[0.5,0.1,0.34,0.8],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Top-centered image flanked by organic vector art and corner text blocks","zones":["Top-centered image flanked by organic vector art and corner text blocks"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["asymmetrical","image-top","vector-overlay"],"avoid":["Complex data","Long paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Welcome messages"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"hero_image","purpose":"Primary section imagery","bbox":[0.27,0.07,0.51,0.6],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large offset image with overlapping typography and corner block accents","zones":["Large offset image with overlapping typography and corner block accents"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["overlapping-text","large-image","corner-accents"],"avoid":["Bullet-heavy lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Team introductions","Core concept explanations"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main_photo","purpose":"Featured subject or texture","bbox":[0.27,0.11,0.65,0.81],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Side-by-side color block and image with rotated quote text","zones":["Side-by-side color block and image with rotated quote text"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted earth-tone color scheme","Overlapping organic botanical and geometric line-art","High-contrast serif headings paired with clean sans-serif body"],"optional_variants":["split-screen","vertical-quote","block-color"],"avoid":["Standard multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Testimonials","Key statements","Profile pages"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"profile_image","purpose":"Subject photography","bbox":[0.44,0.14,0.49,0.86],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Use sharp, unrounded rectangular masks for standard images.
- Layer images over solid color blocks to create offset frames.
- Allow vector line-art to partially overlay photographic subjects to integrate them into the page.

【图标与装饰】
- Use monochromatic icons matching the primary earth-tone palette.
- Employ consistent stroke weights for outlined icons, or solid flat shapes for utilitarian symbols.

【数据页构图】
- Top-centered image flanked by organic vector art and corner text blocks

【图表风格】
- No charts provided; adapt by using solid flat colors from the earth-tone palette with minimal axis lines.

【章节页构图】
- Top-centered image flanked by organic vector art and corner text blocks

【收尾页构图】
- Full-bleed background image with centered, high-contrast typography

【禁止】
- Bright, saturated primary colors that break the muted aesthetic.
- Heavy drop shadows or 3D effects on elements.
- Rounded corners on standard image blocks.
- Cluttered text without generous whitespace.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion presentations、Interior design or architectural portfolios、Lifestyle brand guidelines、Creative agency creds decks。
