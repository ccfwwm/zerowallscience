# 9 · 3.07更新高级色25 / linzi-morandi-3-0725-9-1d1b7106

## 风格ID
linzi-morandi-3-0725-9-1d1b7106

## 风格名称
9 · 3.07更新高级色25 / linzi-morandi-3-0725-9-1d1b7106

## 风格描述
A sophisticated, academic-leaning presentation template featuring a muted Morandi palette, organic brushstroke accents, and clean split-column layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds use warm off-white (#F6F6F6). Muted teal (#7F9C9F) and slate grey (#8A9098) act as primary structural block colors. Pale mint (#CDE5DC) serves as an accent highlight.
- fonts: Clean, modern sans-serif typography with strong weight contrast between primary headings and body copy.
- spacing: Generous margins. Distinct gutters between split columns. Internal padding in colored text blocks is consistent and breathable.
- shape_language: A mix of sharp right-angled geometry for layouts and organic/fluid shapes for decorative framing. Occasional use of teardrop/leaf asymmetrically rounded cards.
- texture: Flat color blocks contrasted with textured, dry-brush edge vectors.
- grid: Strong reliance on 2-column, 3-column, and 4-column vertical grid systems.
- motion_or_depth: Primarily flat, with subtle drop shadows applied exclusively to overlapping text cards or device mockups to establish Z-index hierarchy.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「9 · 3.07更新高级色25 / linzi-morandi-3-0725-9-1d1b7106」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A sophisticated, academic-leaning presentation template featuring a muted Morandi palette, organic brushstroke accents, and clean split-column layouts.
- 推荐配色：#7F9C9F、#8A9098、#CDE5DC、#F6F6F6

【不可丢失的风格锚点】
- Muted pastel 'Morandi' color scheme
- Organic, rough-edged brushstroke vectors framing the canvas edges
- Asymmetrically rounded cards (one soft corner, three sharp corners)
- Strict vertical split-screen alignments

【字体】
- Titles are heavily weighted and center or left-aligned depending on the layout split.
- Body text is low-contrast (grey on off-white or white on dark teal) but remains legible.
- Subtitle slots frequently pair English translations below the primary title.
- List items utilize hierarchical spacing with an icon, a bold sub-header, and lighter body text.

【封面页构图】
- Centered typography framed by asymmetrical organic edge brushstrokes on the left and right.

【内容页构图】
- Left side bleed image overlaid with a floating opaque text card. Right side features clear vertical column text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typography framed by asymmetrical organic edge brushstrokes on the left and right.","zones":["Centered typography framed by asymmetrical organic edge brushstrokes on the left and right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["framed","centered","brush-edges"],"avoid":["Data-heavy content","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Major presentation demarcations"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered typography framed by asymmetrical organic edge brushstrokes, mirroring the cover.","zones":["Centered typography framed by asymmetrical organic edge brushstrokes, mirroring the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["framed","centered","transition"],"avoid":["Body content","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Section headers"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left side bleed image overlaid with a floating opaque text card. Right side features clear vertical column text.","zones":["Left side bleed image overlaid with a floating opaque text card. Right side features clear vertical column text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["image-bleed","overlapping-card","split-layout"],"avoid":["Sequential process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Background and significance","Detailed introductions","Image-driven narratives"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"background-left","purpose":"Contextual background image taking up left half","bbox":[0.0,0.0,0.6,1.0],"priority":1}]},{"id":"content-comparison","composition":"50/50 vertical split layout: full bleed image on the left, solid color block with icon list on the right.","zones":["50/50 vertical split layout: full bleed image on the left, solid color block with icon list on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["50-50-split","image-left","icon-list"],"avoid":["Complex tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Features lists","Summaries alongside a hero image"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"hero-left","purpose":"Primary contextual image","bbox":[0.05,0.2,0.35,0.6],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Four-column horizontal sequence featuring asymmetrically rounded cards with overlapping numeric tabs.","zones":["Four-column horizontal sequence featuring asymmetrically rounded cards with overlapping numeric tabs."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["four-column","process-steps","custom-shape-cards"],"avoid":["Large blocks of text","Single focal point images","copying source assets, source text, or an exact source arrangement"],"best_for":["Process steps","Methodologies","Sequential workflows"],"evidence_pages":["page-04"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: 30/70 split layout with a solid color column on the left containing large typographic markers, and a device mockup on the right.","zones":["30/70 split layout with a solid color column on the left containing large typographic markers, and a device mockup on the right."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["split-layout","device-mockup","quote-focus"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Product showcases","Executive summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"screen-mockup","purpose":"Replaceable image inside the laptop screen","bbox":[0.56,0.38,0.34,0.35],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"30/70 split layout with a solid color column on the left containing large typographic markers, and a device mockup on the right.","zones":["30/70 split layout with a solid color column on the left containing large typographic markers, and a device mockup on the right."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["split-layout","device-mockup","quote-focus"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Product showcases","Executive summaries"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"screen-mockup","purpose":"Replaceable image inside the laptop screen","bbox":[0.56,0.38,0.34,0.35],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Closing slide mirroring cover structure with organic edge framing.","zones":["Closing slide mirroring cover structure with organic edge framing."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted pastel 'Morandi' color scheme","Organic, rough-edged brushstroke vectors framing the canvas edges","Asymmetrically rounded cards (one soft corner, three sharp corners)"],"optional_variants":["framed","centered","closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are predominantly cropped into edge-to-edge vertical slices or bleed backgrounds.
- Device mockups (e.g., laptops) are used to frame contextual imagery.
- Grid collages use uniform thin white gutters between photos.

【图标与装饰】
- Line or flat solid icons used heavily in list formats.
- Icons are typically placed inside solid circular backgrounds or floating alongside text blocks.
- Simple, universal metaphors (location, gear, cart) ensuring broad applicability.

【数据页构图】
- Four-column horizontal sequence featuring asymmetrically rounded cards with overlapping numeric tabs.

【图表风格】
- No explicit data charts provided, but process steps utilize distinct sequential color cards with numeric tabs.

【章节页构图】
- Centered typography framed by asymmetrical organic edge brushstrokes, mirroring the cover.

【收尾页构图】
- Closing slide mirroring cover structure with organic edge framing.

【禁止】
- Do not use highly saturated or neon colors; it will break the Morandi aesthetic.
- Avoid complex 3D bevels or heavy gradients.
- Do not center-align body text in multi-column layouts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Academic defense or thesis presentations、Research findings reports、Minimalist corporate profiles、Creative agency case studies。
