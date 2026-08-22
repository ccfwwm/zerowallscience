# 优雅线条（11）---木七设计 · ppt模板 / linzi-morandi-ppt-11-708f6bfe

## 风格ID
linzi-morandi-ppt-11-708f6bfe

## 风格名称
优雅线条（11）---木七设计 · ppt模板 / linzi-morandi-ppt-11-708f6bfe

## 风格描述
Elegant, organic presentation template featuring a Morandi color palette, textured blob shapes, and a mix of heavy sans-serif and calligraphic typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background (#F5ECE3) used as canvas. Muted navy (#536A89), terracotta (#B65E3E), and mustard (#E2B25E) act as primary structural and accent colors.
- fonts: Heavy, tightly tracked sans-serif for primary numbers and English titles. Calligraphic/brush script for secondary stylistic titles. Standard legible sans-serif for body copy.
- spacing: Generous margins, relying on central focal points with asymmetrical corner accents.
- shape_language: Soft, fluid, asymmetrical blobs paired with strict horizontal banding and rigid rectangular grids for content.
- texture: Rough, chalk-like or crayon-like textures applied to the edges of the organic background shapes.
- grid: Center-aligned for transitions; clear horizontal splitting (top/middle/bottom) or vertical splitting (50/50 left/right) for content.
- motion_or_depth: Flat design with depth implied through overlapping elements (e.g., text over shapes, devices over stripes).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（11）---木七设计 · ppt模板 / linzi-morandi-ppt-11-708f6bfe」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, organic presentation template featuring a Morandi color palette, textured blob shapes, and a mix of heavy sans-serif and calligraphic typography.
- 推荐配色：#F5ECE3、#536A89、#B65E3E、#E2B25E

【不可丢失的风格锚点】
- Organic shapes with textured, brush-like edges
- Thin, winding organic line accents
- Muted, pastel Morandi color scheme
- High contrast between chunky sans-serif and flowing brush script fonts

【字体】
- Use massive, heavy sans-serif fonts for section numbers to create scale contrast.
- Pair rigid sans-serifs with expressive brush scripts for visual tension.
- Center-align titles on covers and section slides; left-align content block titles.

【封面页构图】
- Center-aligned text block framed by large, textured organic shapes in all four corners and overlaid with thin winding lines.

【内容页构图】
- Horizontal layout divided into a top header, a middle split band (text on solid color vs. image), and a bottom icon grid.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Center-aligned text block framed by large, textured organic shapes in all four corners and overlaid with thin winding lines.","zones":["Center-aligned text block framed by large, textured organic shapes in all four corners and overlaid with thin winding lines."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["organic-frame","centered-title","textured-edges"],"avoid":["Dense data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","Introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Minimalist layout with central massive numeric typography, a brush script subtitle, and sparse organic corner accents.","zones":["Minimalist layout with central massive numeric typography, a brush script subtitle, and sparse organic corner accents."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["huge-number","minimal-background","centered"],"avoid":["Detailed content","Imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Horizontal layout divided into a top header, a middle split band (text on solid color vs. image), and a bottom icon grid.","zones":["Horizontal layout divided into a top header, a middle split band (text on solid color vs. image), and a bottom icon grid."],"content_capacity":{"density":"high","max_items":7},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["horizontal-bands","split-middle","icon-row"],"avoid":["Full-screen photography","copying source assets, source text, or an exact source arrangement"],"best_for":["Project summaries","Feature highlights with imagery"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"project-image","purpose":"Showcase project or relevant photography","bbox":[0.62,0.2,0.38,0.39],"priority":1}]},{"id":"content-comparison","composition":"Central device mockup overlapping a full-width solid color stripe, flanked symmetrically by text blocks.","zones":["Central device mockup overlapping a full-width solid color stripe, flanked symmetrically by text blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["device-mockup","symmetrical-text","horizontal-stripe"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Digital product showcases","Website or app previews"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"screen-content","purpose":"Display digital content within the device frame","bbox":[0.29,0.26,0.42,0.46],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Concentric semicircle layers radiating from a bottom-center anchor, with radially placed icons and flanking text blocks.","zones":["Concentric semicircle layers radiating from a bottom-center anchor, with radially placed icons and flanking text blocks."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["radial-diagram","concentric-arches","cutout-center"],"avoid":["Strict quantitative charts (bar/line)","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","Layered concepts","Core plans"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"center-anchor-image","purpose":"Symbolic central image anchoring the diagram","bbox":[0.35,0.6,0.3,0.4],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Minimalist layout with central massive numeric typography, a brush script subtitle, and sparse organic corner accents.","zones":["Minimalist layout with central massive numeric typography, a brush script subtitle, and sparse organic corner accents."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["huge-number","minimal-background","centered"],"avoid":["Detailed content","Imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Center-aligned closing text block framed by large, textured organic shapes in all four corners, mirroring the cover.","zones":["Center-aligned closing text block framed by large, textured organic shapes in all four corners, mirroring the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic shapes with textured, brush-like edges","Thin, winding organic line accents","Muted, pastel Morandi color scheme"],"optional_variants":["organic-frame","centered-text","bookend"],"avoid":["Body content","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Q&A introduction","Contact info"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should fill dedicated rectangular grid zones without borders.
- Use device mockups (like laptops) to frame contextual imagery.
- Cutout photography can be nested inside specific diagrams (e.g., concentric arches).

【图标与装饰】
- Solid, flat icons in muted tones matching the primary color palette.
- Icons enclosed in subtle circular containers or placed directly on the background.

【数据页构图】
- Concentric semicircle layers radiating from a bottom-center anchor, with radially placed icons and flanking text blocks.

【图表风格】
- Abstract concentric rings or arches divided into segments to represent processes or connected plans.
- Data points placed radially along the curves of the arches.

【章节页构图】
- Minimalist layout with central massive numeric typography, a brush script subtitle, and sparse organic corner accents.

【收尾页构图】
- Center-aligned closing text block framed by large, textured organic shapes in all four corners, mirroring the cover.

【禁止】
- Do not use highly saturated primary colors.
- Avoid sharp, geometric background patterns (triangles, strict polygons) that break the organic theme.
- Avoid cliché stock cutouts (e.g., the shaking hands) in modern use cases.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、End-of-year summaries、Lifestyle or architectural brand pitches、Design mood boards。
