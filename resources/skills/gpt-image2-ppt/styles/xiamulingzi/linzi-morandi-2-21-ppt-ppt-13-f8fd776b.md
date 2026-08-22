# 13 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-13-f8fd776b

## 风格ID
linzi-morandi-2-21-ppt-ppt-13-f8fd776b

## 风格名称
13 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-13-f8fd776b

## 风格描述
Elegant lifestyle presentation system featuring asymmetrical layouts, Morandi color accents, and prominent botanical shadow backgrounds.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Earthy Morandi tones (ochre, taupe, dark olive) used as flat accents against a warm beige base.
- fonts: Elegant, high-contrast serif for primary display headers paired with a clean sans-serif for structured body copy.
- spacing: Generous whitespace with deliberate overlapping of images and solid color blocks to create depth without drop shadows.
- shape_language: Strict orthogonal rectangles with sharp corners; varying aspect ratios for image containers.
- texture: Soft, blurred photorealistic botanical leaf shadows cast across the base layer.
- grid: Loose, asymmetrical grid favoring dynamic, staggered placements over rigid columns.
- motion_or_depth: Depth is achieved through the physical overlapping of flat planes and the interplay with the global shadow texture layer.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「13 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-13-f8fd776b」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant lifestyle presentation system featuring asymmetrical layouts, Morandi color accents, and prominent botanical shadow backgrounds.
- 推荐配色：#EBE8E3、#4A453F、#9D6B19、#9A8471、#1C1E1D

【不可丢失的风格锚点】
- Photorealistic botanical shadow overlays
- Asymmetrical overlapping image clusters
- Thick solid-color geometric framing blocks
- High-contrast serif typography

【字体】
- Left-aligned primary headers
- Body text constrained to narrow column widths for readability
- Oversized numbers used as structural graphic elements

【封面页构图】
- Full-bleed background image with centered elegant typography overlay

【内容页构图】
- Large split-color background with a dominant framed image and a secondary inset image

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with centered elegant typography overlay","zones":["Full-bleed background image with centered elegant typography overlay"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Photorealistic botanical shadow overlays","Asymmetrical overlapping image clusters","Thick solid-color geometric framing blocks"],"optional_variants":["full-bleed","minimal","centered"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section transitions"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"cover-bg","purpose":"Full bleed background image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Full-bleed background image with centered large typographic title","zones":["Full-bleed background image with centered large typographic title"],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Photorealistic botanical shadow overlays","Asymmetrical overlapping image clusters","Thick solid-color geometric framing blocks"],"optional_variants":["full-bleed","divider","minimal"],"avoid":["Information delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section dividers","Quote slides"],"evidence_pages":["page-08"],"external_image_slots":[{"id":"section-bg","purpose":"Thematic background image","bbox":[0,0,1,1],"priority":1}]}
- content: [{"id":"content-content","composition":"Large split-color background with a dominant framed image and a secondary inset image","zones":["Large split-color background with a dominant framed image and a secondary inset image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Photorealistic botanical shadow overlays","Asymmetrical overlapping image clusters","Thick solid-color geometric framing blocks"],"optional_variants":["split-background","framed-image","asymmetrical"],"avoid":["Complex data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Brand introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"primary-img","purpose":"Main visual focus anchored by color block","bbox":[0.08,0.12,0.41,0.76],"priority":1},{"id":"secondary-img","purpose":"Supporting context image","bbox":[0.56,0.25,0.17,0.28],"priority":2}]},{"id":"content-comparison","composition":"Staggered cascade of vertical portrait images with an oversized numeral","zones":["Staggered cascade of vertical portrait images with an oversized numeral"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Photorealistic botanical shadow overlays","Asymmetrical overlapping image clusters","Thick solid-color geometric framing blocks"],"optional_variants":["cascade","portraits","overlapping"],"avoid":["Text-heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Team profiles","Product showcases"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-1","purpose":"Leftmost overlapping portrait","bbox":[0.41,0,0.23,0.73],"priority":1},{"id":"img-2","purpose":"Top right portrait","bbox":[0.64,0.16,0.18,0.54],"priority":2},{"id":"img-3","purpose":"Bottom right portrait","bbox":[0.8,0.33,0.2,0.67],"priority":3}]}]
- data: [{"id":"data-metrics","composition":"Left-aligned text with a dominant right-aligned borderless stacked area chart","zones":["Left-aligned text with a dominant right-aligned borderless stacked area chart"],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Photorealistic botanical shadow overlays","Asymmetrical overlapping image clusters","Thick solid-color geometric framing blocks"],"optional_variants":["area-chart","data-visualization","clean"],"avoid":["Precise numerical tables","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend visualization","Metric overviews"],"evidence_pages":["page-05"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large split-color background with a dominant framed image and a secondary inset image","zones":["Large split-color background with a dominant framed image and a secondary inset image"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Photorealistic botanical shadow overlays","Asymmetrical overlapping image clusters","Thick solid-color geometric framing blocks"],"optional_variants":["split-background","framed-image","asymmetrical"],"avoid":["Complex data","Bullet lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Brand introductions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"primary-img","purpose":"Main visual focus anchored by color block","bbox":[0.08,0.12,0.41,0.76],"priority":1},{"id":"secondary-img","purpose":"Supporting context image","bbox":[0.56,0.25,0.17,0.28],"priority":2}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Sharp-cornered rectangles without borders
- Staggered and overlapping multi-image arrangements
- Frequently anchored by solid background color blocks behind the image

【图标与装饰】
- Flat, monochromatic silhouette style
- Sized uniformly in tight grid formations

【数据页构图】
- Left-aligned text with a dominant right-aligned borderless stacked area chart

【图表风格】
- Stacked area chart without segment borders
- X/Y axes minimized or invisible
- Legend uses simple square swatches

【章节页构图】
- Full-bleed background image with centered large typographic title

【收尾页构图】
- Full-bleed background image with centered elegant typography overlay

【禁止】
- Avoid heavy digital drop shadows on individual elements
- Avoid rounded corners on images or shapes
- Avoid bright, saturated, or neon color accents
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Creative agency portfolios、Lifestyle brand decks、Editorial content presentations。
