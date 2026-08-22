# 109 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-109-163f94b5

## 风格ID
linzi-morandi-2-21-ppt-ppt-109-163f94b5

## 风格名称
109 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-109-163f94b5

## 风格描述
A minimalist, elegant presentation template featuring a muted Morandi color palette, organic fluid framing, and clean circular diagrams.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dusty purple-grey (#9793A3) acts as the primary accent and structural color. Light beige/mauve (#DFD5D6) provides secondary warmth. Dark charcoal (#424242) for primary text. White/Off-white for backgrounds.
- fonts: Clean, lightweight sans-serif for headings and body. Generous line height and letter spacing for an airy feel.
- spacing: Ample negative space, relying on a central vertical axis for most title headers and centered content blocks.
- shape_language: Soft and rounded. Fluid blobs, perfect circles, rounded rectangles, and pill shapes dominate.
- texture: Flat and matte. No gradients, shadows, or glossy effects. Relies entirely on solid, muted color fills.
- grid: Center-aligned headers with symmetrical column layouts (2, 3, or 4 columns) beneath.
- motion_or_depth: Completely flat. Depth is only suggested through the overlapping of flat organic shapes in the background.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「109 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-109-163f94b5」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, elegant presentation template featuring a muted Morandi color palette, organic fluid framing, and clean circular diagrams.
- 推荐配色：#9793A3、#DFD5D6、#F2F2F2、#424242、#FFFFFF

【不可丢失的风格锚点】
- Organic, fluid background blobs anchoring corners
- Muted, low-saturation color palette (Morandi style)
- Extensive use of perfect circles for images and icons
- Thick, rounded directional arrows in diagrams

【字体】
- Titles are typically centered at the top of the slide in dark charcoal.
- Subtitles use a smaller font size and a lighter grey tone.
- Labels within diagrams use the primary dark charcoal or white if overlaid on dark primary shapes.
- Text tracking is slightly loose, adding to the elegant, modern aesthetic.

【封面页构图】
- Centered title and subtitle bounded by organic fluid shapes in the corners, with a central pill-shaped badge at the bottom.

【内容页构图】
- Central circular image intersected by a thin horizontal line connecting multiple numbered circular nodes.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title and subtitle bounded by organic fluid shapes in the corners, with a central pill-shaped badge at the bottom.","zones":["Centered title and subtitle bounded by organic fluid shapes in the corners, with a central pill-shaped badge at the bottom."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["minimal","fluid-frame","centered"],"avoid":["Data-heavy reporting","Complex diagrams","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Ascending stepped timeline using rounded rectangular blocks connected by thick, curved directional arrows.","zones":["Ascending stepped timeline using rounded rectangular blocks connected by thick, curved directional arrows."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["timeline","ascending","stepped"],"avoid":["Non-sequential lists","Large bodies of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Historical milestones"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Central circular image intersected by a thin horizontal line connecting multiple numbered circular nodes.","zones":["Central circular image intersected by a thin horizontal line connecting multiple numbered circular nodes."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["horizontal-sequence","central-image","alternating-text"],"avoid":["Hierarchical data","Lengthy text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Horizontal timelines","Linear processes with a central theme","Features lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-node","purpose":"Thematic visual anchor for the sequence","bbox":[0.4,0.35,0.2,0.35],"priority":1}]},{"id":"content-comparison","composition":"Top-down hierarchical tree starting with an image node, branching to two secondary nodes, and culminating in four horizontal pill-shaped text boxes.","zones":["Top-down hierarchical tree starting with an image node, branching to two secondary nodes, and culminating in four horizontal pill-shaped text boxes."],"content_capacity":{"density":"medium","max_items":7},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["hierarchy","tree","top-down"],"avoid":["Cyclical processes","Unrelated bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Organizational charts","Process breakdowns","Categorization flows"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"top-node","purpose":"Visual representation of the parent category","bbox":[0.45,0.15,0.1,0.18],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Concentric circles with a solid center node and orbiting text/icon nodes on the outer rings, alongside a left-aligned text block.","zones":["Concentric circles with a solid center node and orbiting text/icon nodes on the outer rings, alongside a left-aligned text block."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["radial","concentric","orbit"],"avoid":["Linear timelines","Comparison tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Core concept models","Layered architectures","Hub-and-spoke relationships"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Ascending stepped timeline using rounded rectangular blocks connected by thick, curved directional arrows.","zones":["Ascending stepped timeline using rounded rectangular blocks connected by thick, curved directional arrows."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["timeline","ascending","stepped"],"avoid":["Non-sequential lists","Large bodies of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Process steps","Historical milestones"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered closing text bounded by organic fluid shapes in the corners, mirroring the cover layout.","zones":["Centered closing text bounded by organic fluid shapes in the corners, mirroring the cover layout."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Organic, fluid background blobs anchoring corners","Muted, low-saturation color palette (Morandi style)","Extensive use of perfect circles for images and icons"],"optional_variants":["closing","minimal","bookend"],"avoid":["Any content delivery","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are strictly contained within perfect circular masks for diagrams/nodes.
- Large photographic elements are used as full-width horizontal banners or split-screen blocks.
- Images maintain a muted or desaturated tone to match the presentation's palette.

【图标与装饰】
- Minimalist line-art icons.
- Icons are typically white when placed inside primary color-filled circular badges.
- Icons act as primary focal points for modular text blocks.

【数据页构图】
- Concentric circles with a solid center node and orbiting text/icon nodes on the outer rings, alongside a left-aligned text block.

【图表风格】
- Diagrams avoid standard charts in favor of custom shapes like concentric circles and branching nodes.
- Lines are thin and solid, used mostly to connect sequenced elements.
- Progressive steps are shown using thick, rounded arrows pointing to the next block.

【章节页构图】
- Ascending stepped timeline using rounded rectangular blocks connected by thick, curved directional arrows.

【收尾页构图】
- Centered closing text bounded by organic fluid shapes in the corners, mirroring the cover layout.

【禁止】
- Avoid high-saturation or neon colors; they will break the Morandi aesthetic.
- Do not use sharp right angles for content boxes; always use rounded corners or circles.
- Avoid drop shadows or 3D effects on shapes.
- Do not clutter the edges; leave room for the fluid background shapes to breathe.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Corporate overviews requiring a soft, human-centric touch.、Design or lifestyle product proposals.、HR or team onboarding decks.、Year-end summaries or soft-skills training materials.。
