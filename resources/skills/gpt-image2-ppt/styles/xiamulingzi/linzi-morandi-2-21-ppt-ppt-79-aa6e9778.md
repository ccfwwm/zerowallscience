# 79 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-79-aa6e9778

## 风格ID
linzi-morandi-2-21-ppt-ppt-79-aa6e9778

## 风格名称
79 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-79-aa6e9778

## 风格描述
Minimalist editorial presentation with dusty blue tones, thin typographic accents, geometric overlays, and staggered layouts.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background off-white, dominant accent block/overlay dusty blue, text charcoal for light backgrounds and white for dark/image backgrounds.
- fonts: Elegant, ultra-light sans-serif headers (uppercase, wide tracking), readable sans-serif body copy.
- spacing: Generous margins, negative space prioritized over content density, staggered padding.
- shape_language: Perfect circles (masks and overlays) mixed with strict rectangles, accented by 1px solid lines.
- texture: Flat vector shapes combined with translucent alpha overlays to interact with photographic backgrounds.
- grid: Asymmetric editorial grid with intentional overlaps and off-axis center alignment.
- motion_or_depth: Depth achieved through semi-transparent overlays, offset solid drop-shadow blocks behind images, and floating text.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「79 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-79-aa6e9778」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist editorial presentation with dusty blue tones, thin typographic accents, geometric overlays, and staggered layouts.
- 推荐配色：#F0F1F3、#7D889E、#3A3A3A、#FFFFFF

【不可丢失的风格锚点】
- Dusty blue and off-white dual-tone palette
- Large transparent/translucent geometric overlays (circles, rectangles)
- Thin, offset corner framing lines
- Asymmetrical, staggered image and text blocks
- Wide-tracked, light uppercase sans-serif typography

【字体】
- Headers are universally uppercase, widely tracked, and use a light or ultra-light font weight.
- Massive scale contrast: headers are often 4x-6x larger than body text.
- Body text is right-aligned or left-aligned depending on its anchor column, rarely centered unless in a strict grid.
- Use thin horizontal accent lines near or striking through section headers.

【封面页构图】
- Full-bleed background image with a massive, centered translucent circle overlay and oversized centered typography.

【内容页构图】
- Asymmetric split layout: left side staggered portrait image with offset background block, right side right-aligned text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with a massive, centered translucent circle overlay and oversized centered typography.","zones":["Full-bleed background image with a massive, centered translucent circle overlay and oversized centered typography."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["hero","circle-overlay","centered"],"avoid":["Long titles","Data heavy slides","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section openers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-image","purpose":"Full bleed background texture or mood image","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Staggered horizontal image strips interleaved with solid color date/label blocks.","zones":["Staggered horizontal image strips interleaved with solid color date/label blocks."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["staggered","horizontal-strips","timeline"],"avoid":["Detailed text descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Historical milestones","Process steps"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"strip-1","purpose":"Top horizontal slice","bbox":[0,0.28,0.59,0.22],"priority":1},{"id":"strip-2","purpose":"Middle horizontal slice","bbox":[0.11,0.53,0.59,0.22],"priority":2},{"id":"strip-3","purpose":"Bottom horizontal slice","bbox":[0.22,0.78,0.59,0.22],"priority":3}]}
- content: [{"id":"content-content","composition":"Asymmetric split layout: left side staggered portrait image with offset background block, right side right-aligned text.","zones":["Asymmetric split layout: left side staggered portrait image with offset background block, right side right-aligned text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["split-layout","offset-shadow","right-aligned"],"avoid":["Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Founder profiles","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-image","purpose":"Vertical feature image","bbox":[0.08,0.08,0.45,0.84],"priority":1}]},{"id":"content-comparison","composition":"Full-bleed background with a large, left-aligned translucent circle overlay housing a numbered list.","zones":["Full-bleed background with a large, left-aligned translucent circle overlay housing a numbered list."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["numbered-list","circle-overlay","asymmetric"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Numbered processes","Service lists"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"bg-image","purpose":"Full bleed background image","bbox":[0,0,1,1],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Left sidebar with image/text, right area with a horizontal node timeline connecting to rectangular cards.","zones":["Left sidebar with image/text, right area with a horizontal node timeline connecting to rectangular cards."],"content_capacity":{"density":"high","max_items":6},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["timeline","cards","horizontal-flow"],"avoid":["Complex data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Project timelines","Event schedules","Roadmaps"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"sidebar-img","purpose":"Vertical accent image","bbox":[0.03,0.05,0.2,0.8],"priority":1},{"id":"card-img","purpose":"Timeline milestone image","bbox":[0.52,0.39,0.21,0.41],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetric split layout: left side staggered portrait image with offset background block, right side right-aligned text.","zones":["Asymmetric split layout: left side staggered portrait image with offset background block, right side right-aligned text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["split-layout","offset-shadow","right-aligned"],"avoid":["Multi-item lists","copying source assets, source text, or an exact source arrangement"],"best_for":["About us","Founder profiles","Product highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"portrait-image","purpose":"Vertical feature image","bbox":[0.08,0.08,0.45,0.84],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full-bleed background, large central translucent overlay with corner brackets, massive broken typography.","zones":["Full-bleed background, large central translucent overlay with corner brackets, massive broken typography."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Dusty blue and off-white dual-tone palette","Large transparent/translucent geometric overlays (circles, rectangles)","Thin, offset corner framing lines"],"optional_variants":["closing","massive-text","overlay"],"avoid":["Contact info details (if too small to read against background)","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final quotes"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-image","purpose":"Full bleed closing background","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Full-bleed backgrounds heavily masked by translucent shapes.
- Portrait or horizontal slice crops without borders.
- Circular crops with solid color concentric stroke borders.
- Images often paired with an offset solid-color rectangular block acting as a faux shadow/frame.

【图标与装饰】
- Minimal iconography; relies primarily on typography, thin lines, and imagery.
- Use of simple geometric nodes and lines for timelines.

【数据页构图】
- Left sidebar with image/text, right area with a horizontal node timeline connecting to rectangular cards.

【图表风格】
- Concentric circular rings with numerical values centered inside.
- Muted, monochromatic fill colors for charts.

【章节页构图】
- Staggered horizontal image strips interleaved with solid color date/label blocks.

【收尾页构图】
- Full-bleed background, large central translucent overlay with corner brackets, massive broken typography.

【禁止】
- Avoid dense paragraphs; limit body text to short, highly readable blocks.
- Do not use drop shadows; use solid offset shapes for depth.
- Avoid highly saturated colors; stick to muted, pastel, or grayscale tones.
- Avoid centering body text in asymmetrical layouts.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Creative agency portfolios、Architecture or interior design proposals、Minimalist brand guidelines。
