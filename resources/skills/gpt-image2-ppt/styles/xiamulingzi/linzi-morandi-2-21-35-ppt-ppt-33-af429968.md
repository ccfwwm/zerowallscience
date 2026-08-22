# 莫兰迪风格PPT (33) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-33-af429968

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-33-af429968

## 风格名称
莫兰迪风格PPT (33) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-33-af429968

## 风格描述
Minimalist editorial presentation featuring muted beige accents, overlapping rectangular planes, and textural backgrounds for an elegant, modern aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: White backgrounds dominated by large textured gray/white panels, anchored by muted beige (#C1B195) accent shapes and high-contrast dark gray text.
- fonts: Clean geometric sans-serif for primary headings (often all-caps), standard legible sans-serif for body copy, occasional script for tiny accents.
- spacing: Generous margins with dense localized content clusters; intentional overlapping of elements creates spatial tension.
- shape_language: Strictly orthogonal; sharp rectangular solid blocks, vertical structural strips, and perfectly square accent blocks.
- texture: Prominent use of soft, light marble textures functioning as solid shapes rather than full backgrounds.
- grid: Modular, asymmetrical grid frequently split into unequal thirds or offset halves.
- motion_or_depth: Depth is achieved through z-axis overlapping of opaque rectangular planes (e.g., beige block over an image) rather than shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (33) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-33-af429968」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist editorial presentation featuring muted beige accents, overlapping rectangular planes, and textural backgrounds for an elegant, modern aesthetic.
- 推荐配色：#C1B195、#FFFFFF、#F3F3F3、#2A2A2A、#767676

【不可丢失的风格锚点】
- Muted beige/khaki solid blocks overlapping imagery
- Subtle marble texture used as structural background panels
- Asymmetrical grid mixing vertical and horizontal planes
- Oversized decorative quotation marks acting as graphical elements
- High-contrast, widely spaced sans-serif typography

【字体】
- Headings use all-caps with moderate tracking for an editorial feel.
- Body copy is set in a lighter weight and lighter color (medium gray) than headings to establish clear hierarchy.
- Oversized numerals and punctuation are used as structural anchors in layouts.

【封面页构图】
- Centered symmetrical framing with nested rectangular blocks

【内容页构图】
- Three-column structure with oversized numeric anchor and quotation marks

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered symmetrical framing with nested rectangular blocks","zones":["Centered symmetrical framing with nested rectangular blocks"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["symmetrical","nested-boxes","minimal"],"avoid":["Data-heavy content","Multi-point agendas","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"background-texture","purpose":"Textured backdrop for title card","bbox":[0.1,0.18,0.8,0.64],"priority":1}]}
- section: {"id":"section-primary","composition":"Split-screen layout with an overlapping floating photo card","zones":["Split-screen layout with an overlapping floating photo card"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["asymmetrical","floating-card","split-background"],"avoid":["Dense text blocks","Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member introductions","Product highlights","Chapter intros"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"polaroid-photo","purpose":"Primary subject portrait","bbox":[0.55,0.22,0.28,0.35],"priority":1}]}
- content: [{"id":"content-content","composition":"Three-column structure with oversized numeric anchor and quotation marks","zones":["Three-column structure with oversized numeric anchor and quotation marks"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["three-column","big-numbers","portrait-image"],"avoid":["Large data charts","Full-width imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Step-by-step processes","Testimonials","Core value statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-portrait","purpose":"Central focal image","bbox":[0.18,0.15,0.32,0.7],"priority":1}]},{"id":"content-comparison","composition":"Large right-aligned image with overlapping title block on the edge","zones":["Large right-aligned image with overlapping title block on the edge"],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["hero-image","overlapping-title","edge-aligned"],"avoid":["Bullet-point lists","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Hero image showcases","Portfolio pieces","Section headers"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"hero-right","purpose":"Large showcase image","bbox":[0.28,0.18,0.68,0.64],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Split-screen layout with an overlapping floating photo card","zones":["Split-screen layout with an overlapping floating photo card"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["asymmetrical","floating-card","split-background"],"avoid":["Dense text blocks","Timeline graphics","copying source assets, source text, or an exact source arrangement"],"best_for":["Team member introductions","Product highlights","Chapter intros"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"polaroid-photo","purpose":"Primary subject portrait","bbox":[0.55,0.22,0.28,0.35],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three-column structure with oversized numeric anchor and quotation marks","zones":["Three-column structure with oversized numeric anchor and quotation marks"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["three-column","big-numbers","portrait-image"],"avoid":["Large data charts","Full-width imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Step-by-step processes","Testimonials","Core value statements"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-portrait","purpose":"Central focal image","bbox":[0.18,0.15,0.32,0.7],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Centered symmetrical framing identical to cover","zones":["Centered symmetrical framing identical to cover"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted beige/khaki solid blocks overlapping imagery","Subtle marble texture used as structural background panels","Asymmetrical grid mixing vertical and horizontal planes"],"optional_variants":["symmetrical","nested-boxes","closing"],"avoid":["Contact details lists","Summary data","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing statements","Thank you slides","Final logo presentation"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"background-texture-closing","purpose":"Textured backdrop for closing card","bbox":[0.1,0.18,0.8,0.64],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are typically uncropped rectangular blocks (landscape, portrait, or square).
- Photography is frequently layered beneath a solid accent-color text block that bridges the image and the background.
- Device mockups (laptops, monitors) are used to frame landscape imagery.

【图标与装饰】
- Minimalist line-art icons in accent color used sparsely in row or column arrays.
- Icons share the same line weight to maintain visual consistency.

【数据页构图】
- Split-screen layout with an overlapping floating photo card

【图表风格】
- No traditional data charts present; structured data is handled via grids, lists, and masonry layouts.

【章节页构图】
- Split-screen layout with an overlapping floating photo card

【收尾页构图】
- Centered symmetrical framing identical to cover

【禁止】
- Avoid using heavily saturated or neon colors that break the muted Morandi palette.
- Do not round corners; the strict rectangular shape language must remain intact.
- Avoid complex gradients; use solid flat colors or photographic textures.
- Do not copy the specific QR code or promotional layouts, as they are ad-specific.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion/editorial portfolios、Minimalist corporate introductions、Interior design or architectural proposals、High-end product showcases。
