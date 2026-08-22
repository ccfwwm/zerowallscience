# 优雅线条（20）---木七设计 · ppt模板 / linzi-morandi-ppt-20-ceb0976c

## 风格ID
linzi-morandi-ppt-20-ceb0976c

## 风格名称
优雅线条（20）---木七设计 · ppt模板 / linzi-morandi-ppt-20-ceb0976c

## 风格描述
Elegant, minimalist presentation template featuring a Morandi color palette, organic vector blobs, and clean sans-serif typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream/off-white background with dark slate, muted terracotta, sage green, and warm mustard acting as balanced, equal-weight accents.
- fonts: Clean, highly legible sans-serif for both headers and body; dark gray (#333) rather than pure black for softer contrast.
- spacing: Generous margins, relying on asymmetrical negative space balanced by heavy vector blobs in opposing corners.
- shape_language: Primarily organic and fluid (wavy lines, scattered dots, smooth blobs) contrasted with strict rounded rectangles for specific content zones.
- texture: Flat vector color with very subtle drop shadows on floating content cards.
- grid: Loose, asymmetrical grid. Content is either strictly centered (covers) or split into 40/60 asymmetrical columns.
- motion_or_depth: Moderate depth created by white content cards 'floating' above the busy organic background layers.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（20）---木七设计 · ppt模板 / linzi-morandi-ppt-20-ceb0976c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, minimalist presentation template featuring a Morandi color palette, organic vector blobs, and clean sans-serif typography.
- 推荐配色：#EAE5D9、#2F3E40、#D2987D、#9D9D72、#DAB87A

【不可丢失的风格锚点】
- Organic, asymmetrical 'blob' and wavy line vector backgrounds
- Muted, earthy 'Morandi' accent colors
- Soft rounded-rectangle content containment cards
- Floating, overlapping asymmetrical image collage grids
- Vertical accent lines for quotes and edge anchoring

【字体】
- Centered alignment for covers and section dividers.
- Left-aligned text for detailed content pages.
- Use of vertical dividing lines or bolded leading text to denote quotes or key takeaways.
- Large, muted numerals used as subtle section anchors.

【封面页构图】
- Centered text locked inside an organic, fluidly framed canvas

【内容页构图】
- Left side masonry image grid, right side text content with vertical accent markers

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered text locked inside an organic, fluidly framed canvas","zones":["Centered text locked inside an organic, fluidly framed canvas"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["centered","organic-frame","minimal"],"avoid":["Detailed data","Dense lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Welcome screen"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered large numeral over a primary title, framed by organic corner shapes","zones":["Centered large numeral over a primary title, framed by organic corner shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["section-divider","large-number","centered"],"avoid":["Content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transition","Chapter title"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left side masonry image grid, right side text content with vertical accent markers","zones":["Left side masonry image grid, right side text content with vertical accent markers"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["masonry-grid","split-column","image-heavy"],"avoid":["Heavy data tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Portfolio showcase","Case study overview","Product highlights"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"img-top-left","purpose":"Square accent image","bbox":[0.07,0.05,0.17,0.4],"priority":2},{"id":"img-tall-center","purpose":"Primary vertical image","bbox":[0.25,0.05,0.17,0.44],"priority":1},{"id":"img-bottom-left","purpose":"Tall accent image","bbox":[0.07,0.48,0.17,0.5],"priority":3}]},{"id":"content-comparison","composition":"Asymmetrical collage of overlapping color blocks and images, with right-aligned text blocks","zones":["Asymmetrical collage of overlapping color blocks and images, with right-aligned text blocks"],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["collage","asymmetrical","mixed-media"],"avoid":["Standard bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Moodboards","Mixed media stats","Service summaries"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"collage-img-1","purpose":"Atmospheric image square","bbox":[0.2,0.3,0.18,0.33],"priority":2},{"id":"collage-img-2","purpose":"Atmospheric image wide","bbox":[0.36,0.34,0.22,0.3],"priority":1},{"id":"collage-img-3","purpose":"Atmospheric image horizontal","bbox":[0.33,0.69,0.23,0.28],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Horizontal timeline with bouncing curved connector on a floating white card","zones":["Horizontal timeline with bouncing curved connector on a floating white card"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["timeline","floating-card","horizontal-process"],"avoid":["Large blocks of text","Photographic content","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Historical timeline","Sequential phases"],"evidence_pages":["page-02"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered large numeral over a primary title, framed by organic corner shapes","zones":["Centered large numeral over a primary title, framed by organic corner shapes"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["section-divider","large-number","centered"],"avoid":["Content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transition","Chapter title"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered text locked inside an organic, fluidly framed canvas (mirroring cover)","zones":["Centered text locked inside an organic, fluidly framed canvas (mirroring cover)"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, asymmetrical 'blob' and wavy line vector backgrounds","Muted, earthy 'Morandi' accent colors","Soft rounded-rectangle content containment cards"],"optional_variants":["closing","centered","organic-frame"],"avoid":["New information","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Sharp-edged or lightly rounded rectangles.
- Masonry or asymmetrical collage arrangements rather than strict symmetrical grids.
- Images often overlap slightly with solid color blocks of similar aspect ratios.

【图标与装饰】
- Minimalist, monoline white icons placed inside solid colored shapes.
- Use of simple colored circles to anchor list items or timeline nodes.

【数据页构图】
- Horizontal timeline with bouncing curved connector on a floating white card

【图表风格】
- Timelines use a continuous 'bouncing' curved path connecting circular nodes.
- Hierarchical charts use solid color blocks without borders, linked by thin, rigid lines.

【章节页构图】
- Centered large numeral over a primary title, framed by organic corner shapes

【收尾页构图】
- Centered text locked inside an organic, fluidly framed canvas (mirroring cover)

【禁止】
- Avoid harsh primary colors; stick strictly to muted earthy tones.
- Avoid sharp, aggressive geometry like triangles or jagged stars.
- Do not clutter the white space inside the floating content cards.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolio presentations、Art, lifestyle, or wellness brand decks、Modern, minimalist corporate reports、Event agendas and conceptual moodboards。
