# 80 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-80-dcfbfb5a

## 风格ID
linzi-morandi-2-21-ppt-ppt-80-dcfbfb5a

## 风格名称
80 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-80-dcfbfb5a

## 风格描述
Modern editorial presentation template featuring asymmetric layouts, vertical typography, creative image masking, and an earthy green and beige color palette.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Dark green as dominant structural and accent color; beige for secondary accents and tabs; white for primary backgrounds; dark gray for text.
- fonts: Bold, geometric sans-serif for headings (often uppercase and rotated); clean, legible sans-serif for body copy.
- spacing: Generous outer margins, structured and tight gutters within image collages, ample whitespace around text blocks.
- shape_language: Mix of sharp geometry (rectangles, slanted panels) and soft forms (circles, organic blobs). Use of thin offset framing lines.
- texture: Clean flat color blocks contrasting with rich photographic textures.
- grid: Complex asymmetric grids, frequently employing 50/50 splits or multi-column masonry arrangements.
- motion_or_depth: Flat design with depth implied through overlapping elements (e.g., frames over images, shapes over text areas).

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「80 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-80-dcfbfb5a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Modern editorial presentation template featuring asymmetric layouts, vertical typography, creative image masking, and an earthy green and beige color palette.
- 推荐配色：#365343、#D5B48B、#FFFFFF、#1A1A1A、#F4F4F4、#7D7D7D

【不可丢失的风格锚点】
- Oversized rotated vertical typography sidebars
- Creative image masking including slanted panels and organic shapes
- Asymmetric split compositions
- Earthy, muted accent colors against generous whitespace

【字体】
- Use oversized, bold, all-caps sans-serif for primary section titles, often rotated -90 degrees and placed in sidebars.
- Body text should be highly legible sans-serif, using dark gray for contrast on light backgrounds.
- Maintain strict left-alignment for lists and body copy blocks.
- Use color contrast (green/white, dark/light) to establish clear hierarchy.

【封面页构图】
- Solid vertical sidebar with rotated text paired with a dominant right-side image container featuring a top accent tab.

【内容页构图】
- Asymmetric split with a masonry image/data grid on the left and a structured icon list on the right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Solid vertical sidebar with rotated text paired with a dominant right-side image container featuring a top accent tab.","zones":["Solid vertical sidebar with rotated text paired with a dominant right-side image container featuring a top accent tab."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["vertical-title","split-cover","accent-tab"],"avoid":["Dense data display","Long text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation covers","Major section breaks"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Main background or mood image","bbox":[0.3,0.1,0.65,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Three-column layout with offset framing on images and a solid right-hand block with vertical text.","zones":["Three-column layout with offset framing on images and a solid right-hand block with vertical text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["image-trio","offset-frame","vertical-anchor"],"avoid":["Text-heavy content","Charts and graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Image galleries","Team introductions","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-left","purpose":"Left featured portrait","bbox":[0.05,0.15,0.25,0.7],"priority":1},{"id":"portrait-center","purpose":"Center featured portrait","bbox":[0.3,0.15,0.25,0.7],"priority":2}]}
- content: [{"id":"content-content","composition":"Asymmetric split with a masonry image/data grid on the left and a structured icon list on the right.","zones":["Asymmetric split with a masonry image/data grid on the left and a structured icon list on the right."],"content_capacity":{"density":"medium","max_items":7},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["masonry-grid","data-callout","icon-list"],"avoid":["Continuous narrative text","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics mixed with imagery","Feature overviews","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"grid-top","purpose":"Top grid image","bbox":[0.05,0.05,0.2,0.35],"priority":2},{"id":"grid-tall","purpose":"Tall grid image","bbox":[0.05,0.45,0.2,0.5],"priority":1},{"id":"grid-bottom","purpose":"Bottom grid image","bbox":[0.27,0.8,0.18,0.15],"priority":3}]},{"id":"content-comparison","composition":"Numbered list on the left balanced by a large image masked by diagonal parallelograms on the right.","zones":["Numbered list on the left balanced by a large image masked by diagonal parallelograms on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["diagonal-mask","numbered-list","dynamic-image"],"avoid":["Dense data display","Multiple distinct images","copying source assets, source text, or an exact source arrangement"],"best_for":["Step-by-step instructions","Core principles","Agenda items"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"diagonal-hero","purpose":"Large image seen through diagonal masks","bbox":[0.4,0.0,0.6,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three-column layout with offset framing on images and a solid right-hand block with vertical text.","zones":["Three-column layout with offset framing on images and a solid right-hand block with vertical text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["image-trio","offset-frame","vertical-anchor"],"avoid":["Text-heavy content","Charts and graphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Image galleries","Team introductions","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-left","purpose":"Left featured portrait","bbox":[0.05,0.15,0.25,0.7],"priority":1},{"id":"portrait-center","purpose":"Center featured portrait","bbox":[0.3,0.15,0.25,0.7],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetric split with a masonry image/data grid on the left and a structured icon list on the right.","zones":["Asymmetric split with a masonry image/data grid on the left and a structured icon list on the right."],"content_capacity":{"density":"medium","max_items":7},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["masonry-grid","data-callout","icon-list"],"avoid":["Continuous narrative text","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Key statistics mixed with imagery","Feature overviews","Service lists"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"grid-top","purpose":"Top grid image","bbox":[0.05,0.05,0.2,0.35],"priority":2},{"id":"grid-tall","purpose":"Tall grid image","bbox":[0.05,0.45,0.2,0.5],"priority":1},{"id":"grid-bottom","purpose":"Bottom grid image","bbox":[0.27,0.8,0.18,0.15],"priority":3}]}]
- closing: {"id":"closing-primary","composition":"Solid vertical sidebar with rotated text paired with a dominant right-side image container featuring a top accent tab. (Mirrors cover layout).","zones":["Solid vertical sidebar with rotated text paired with a dominant right-side image container featuring a top accent tab. (Mirrors cover layout)."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Oversized rotated vertical typography sidebars","Creative image masking including slanted panels and organic shapes","Asymmetric split compositions"],"optional_variants":["vertical-title","split-closing","bookend"],"avoid":["Detailed content","Data presentation","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Q&A prompts","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-bg","purpose":"Main background or mood image","bbox":[0.3,0.1,0.65,0.8],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Employ diverse masking: standard rectangles, slanted parallelograms, and organic fluid shapes.
- Use tight masonry grids for multi-image collages.
- Allow images to bleed off the edges of the slide.
- Overlay thin line frames slightly offset from image boundaries to create visual interest.

【图标与装饰】
- Use simple, flat, solid icons.
- House icons within solid-colored circular or square containers that match the brand palette.

【数据页构图】
- Three-column layout with offset framing on images and a solid right-hand block with vertical text.

【图表风格】
- No traditional charts present; data is represented through oversized typographic callouts paired with icons.

【章节页构图】
- Three-column layout with offset framing on images and a solid right-hand block with vertical text.

【收尾页构图】
- Solid vertical sidebar with rotated text paired with a dominant right-side image container featuring a top accent tab. (Mirrors cover layout).

【禁止】
- Avoid centering large blocks of text; stick to strong edge alignments.
- Do not use drop shadows or 3D effects; maintain a flat, editorial aesthetic.
- Avoid bright, neon, or primary colors that clash with the muted, earthy palette.
- Do not clutter slides; preserve significant whitespace.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Lifestyle brand presentations、Creative agency credentials、Editorial-style reports。
