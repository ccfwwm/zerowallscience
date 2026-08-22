# 7 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-7-b48ed3b5

## 风格ID
linzi-morandi-2-21-ppt-ppt-7-b48ed3b5

## 风格名称
7 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-7-b48ed3b5

## 风格描述
Abstract, artistic presentation template featuring a muted 'Morandi' color palette, organic fluid shapes, and textured brushstrokes for a calm, creative aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Backgrounds are warm off-white; large organic shapes use desaturated pinks, greens, and slates; text uses dark charcoal for contrast.
- fonts: Elegant serif for primary headings to convey an artistic mood; clean sans-serif for body copy and smaller details.
- spacing: Generous negative space, especially in the center of transition slides; content is often padded well away from the decorative organic edges.
- shape_language: Highly organic and soft for background elements (blobs, brushstrokes); strict geometry (squares, rectangles) reserved strictly for functional content containers like images and icons.
- texture: Visual texture is introduced via stylized brushstrokes and scattered irregular dots, contrasting with flat color fills.
- grid: Primarily relies on centered single-column layouts for titles/transitions, and structured two-column or multi-row grids for detail slides.
- motion_or_depth: Essentially flat design with overlapping elements (blobs over brushstrokes, text boxes over images) creating a 2D collage effect without drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「7 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-7-b48ed3b5」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Abstract, artistic presentation template featuring a muted 'Morandi' color palette, organic fluid shapes, and textured brushstrokes for a calm, creative aesthetic.
- 推荐配色：#FAF7F2、#D8B2A7、#9EAC9F、#70807E、#596261

【不可丢失的风格锚点】
- Muted, earthy 'Morandi' color palette
- Fluid, organic 'amoeba' shapes acting as corner or edge frames
- Dry-brush paint stroke textures used as subtle background elements
- Scattered small organic seed/dot patterns adding textural detail

【字体】
- Use serif fonts for large headers to maintain the editorial/artistic vibe.
- Body text should be sans-serif and left-aligned for readability.
- Stylized slashes ('/') can be used as decorative separators in large titles, but avoid overlapping them with small text.
- Maintain high contrast by using dark charcoal text on light backgrounds and white text on dark slate backgrounds.

【封面页构图】
- Centered typographic composition with stylized dividers, heavily framed by large organic blobs and brushstrokes in the corners.

【内容页构图】
- Split layout: left side features an image collage overlaid with a prominent text block; right side contains a vertically stacked list with geometric bullets.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered typographic composition with stylized dividers, heavily framed by large organic blobs and brushstrokes in the corners.","zones":["Centered typographic composition with stylized dividers, heavily framed by large organic blobs and brushstrokes in the corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["title-slide","organic-frame","centered-text"],"avoid":["Detailed information","Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Main thematic introduction"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Minimalist centered text with a subtle geometric underline, framed by organic shapes in opposing corners.","zones":["Minimalist centered text with a subtle geometric underline, framed by organic shapes in opposing corners."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["divider","minimal","diagonal-frame"],"avoid":["Data presentation","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key transition statements"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout: left side features an image collage overlaid with a prominent text block; right side contains a vertically stacked list with geometric bullets.","zones":["Split layout: left side features an image collage overlaid with a prominent text block; right side contains a vertically stacked list with geometric bullets."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["split-layout","image-collage","vertical-list"],"avoid":["Single large charts","Full-screen imagery","copying source assets, source text, or an exact source arrangement"],"best_for":["Project highlights","Feature lists alongside visual evidence"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"collage-left","purpose":"Background visual context","bbox":[0.0,0.1,0.4,0.8],"priority":1}]},{"id":"content-comparison","composition":"Text-heavy layout with a left-aligned header and multi-paragraph body, framed by abstract elements on the top left, right edge, and bottom right.","zones":["Text-heavy layout with a left-aligned header and multi-paragraph body, framed by abstract elements on the top left, right edge, and bottom right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["text-heavy","asymmetrical-frame","left-aligned"],"avoid":["Image-heavy content","Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Detailed explanatory text","Quotes"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"An 8-step process flowchart arranged in a serpentine (S-shape) path, using square icon nodes and straight connecting lines.","zones":["An 8-step process flowchart arranged in a serpentine (S-shape) path, using square icon nodes and straight connecting lines."],"content_capacity":{"density":"high","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["process-flow","timeline","s-curve"],"avoid":["Quantitative data charts","Large blocks of text","copying source assets, source text, or an exact source arrangement"],"best_for":["Project timelines","Methodology steps","Workflow diagrams"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Minimalist centered text with a subtle geometric underline, framed by organic shapes in opposing corners.","zones":["Minimalist centered text with a subtle geometric underline, framed by organic shapes in opposing corners."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["divider","minimal","diagonal-frame"],"avoid":["Data presentation","Complex lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Key transition statements"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered typographic composition heavily framed by large organic blobs, brushstrokes, and dot textures on all sides.","zones":["Centered typographic composition heavily framed by large organic blobs, brushstrokes, and dot textures on all sides."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, earthy 'Morandi' color palette","Fluid, organic 'amoeba' shapes acting as corner or edge frames","Dry-brush paint stroke textures used as subtle background elements"],"optional_variants":["closing","heavy-frame","centered-text"],"avoid":["New information","Summaries","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slide","Contact information","Final thought"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be unmasked rectangles or squares, providing a geometric contrast to the organic background.
- Use images in tight grid collages or as standalone block elements.
- Images can be partially obscured by solid color text boxes for layered compositions.

【图标与装饰】
- Icons are minimalist, solid white silhouettes.
- Icons are always housed within solid, colored square containers.
- Square containers use colors derived from the main abstract palette (pink, green, slate).

【数据页构图】
- An 8-step process flowchart arranged in a serpentine (S-shape) path, using square icon nodes and straight connecting lines.

【图表风格】
- Process flows utilize simple geometric nodes (squares) connected by thin, straight lines with directional arrows.
- Keep nodes evenly spaced and use a snake/S-pattern for sequences with many steps to maximize slide space.

【章节页构图】
- Minimalist centered text with a subtle geometric underline, framed by organic shapes in opposing corners.

【收尾页构图】
- Centered typographic composition heavily framed by large organic blobs, brushstrokes, and dot textures on all sides.

【禁止】
- Do not overlap small, critical text with complex background textures or decorative typographic marks (like large slashes) where it becomes illegible.
- Avoid highly saturated or neon colors; stick strictly to muted, desaturated tones.
- Avoid soft drop shadows or 3D effects; maintain the flat, collaged aesthetic.
- Do not use organic shapes as masks for photos; keep photos rectangular.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios or pitch decks.、Artistic project summaries or case studies.、Lifestyle, wellness, or interior design brand presentations.、Any content requiring a calm, sophisticated, and handcrafted visual tone.。
