# 莫兰迪风格PPT (18) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-18-38c7e38f

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-18-38c7e38f

## 风格名称
莫兰迪风格PPT (18) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-18-38c7e38f

## 风格描述
Editorial fashion presentation with a Morandi color palette, featuring asymmetrical layouts, overlapping typography, and minimalist geometric framing.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Soft beige and taupe serve as structural accents, muted plum for data visualization, dark charcoal for primary text, on a soft off-white canvas.
- fonts: Clean geometric sans-serif for both headers and body, utilizing extreme scale contrasts (very large headers vs. small, widely spaced body text).
- spacing: Generous negative space, asymmetric balance, elements intentionally overlapping or breaking grid boundaries.
- shape_language: Strictly orthogonal. Sharp rectangles, thin framing lines, and isometric flat 3D steps.
- texture: Flat, matte color blocks contrasting with full-bleed photographic textures.
- grid: Deconstructed magazine grid. Elements align to invisible vertical axes but freely overlap horizontally.
- motion_or_depth: Depth is created through overlapping layers (text over image, image over background block) rather than shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (18) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-18-38c7e38f」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial fashion presentation with a Morandi color palette, featuring asymmetrical layouts, overlapping typography, and minimalist geometric framing.
- 推荐配色：#F7E9C8、#B5A397、#3B3D3C、#F4F4F4、#705F67

【不可丢失的风格锚点】
- Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides
- Rotated marginal metadata text (e.g., year, category)
- Oversized, occasionally broken typography used as graphical elements
- Large, faint numerical watermarks behind text
- Minimalist line-based dividers and floating frames

【字体】
- Headers are oversized and sometimes forcefully broken across multiple lines for visual impact.
- Section numbers are scaled up enormously and pushed to the background.
- Metadata and section labels are often rotated 90 degrees and placed on the extreme edges of the slide.
- Body text is small, grouped tightly, and used to balance heavy image blocks.

【封面页构图】
- Asymmetrical split with large upper image, lower text block, and structural corner color tabs with rotated text.

【内容页构图】
- Large left-aligned image with staggered right-aligned typography and massive watermark text.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split with large upper image, lower text block, and structural corner color tabs with rotated text.","zones":["Asymmetrical split with large upper image, lower text block, and structural corner color tabs with rotated text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["split-layout","magazine-cover"],"avoid":["Data heavy content","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Chapter covers"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_top","purpose":"Primary lifestyle/hero image","bbox":[0.15,0.0,0.85,0.72],"priority":1}]}
- section: {"id":"section-primary","composition":"Central vertical image pillar flanked by staggered typography and a large numerical watermark.","zones":["Central vertical image pillar flanked by staggered typography and a large numerical watermark."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["vertical-crop","staggered-text"],"avoid":["Detailed descriptions","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Key statements"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"center_pillar","purpose":"Vertical feature image","bbox":[0.33,0.09,0.33,0.81],"priority":1}]}
- content: [{"id":"content-content","composition":"Large left-aligned image with staggered right-aligned typography and massive watermark text.","zones":["Large left-aligned image with staggered right-aligned typography and massive watermark text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["watermark-text","asymmetric"],"avoid":["Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Showcasing a single striking image alongside a brief statement"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"main_content","purpose":"Showcase photography","bbox":[0.0,0.05,0.74,0.69],"priority":1}]},{"id":"content-comparison","composition":"Full-slide framed image with centered overlay typography and a horizontal divider.","zones":["Full-slide framed image with centered overlay typography and a horizontal divider."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["framed-image","center-overlay"],"avoid":["Data or lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Quote slides","Major section titles"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"framed_background","purpose":"Primary background visual","bbox":[0.07,0.07,0.86,0.86],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Ascending isometric platforms with floating icons and staggered descriptive text.","zones":["Ascending isometric platforms with floating icons and staggered descriptive text."],"content_capacity":{"density":"medium","max_items":8},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["isometric-steps","timeline"],"avoid":["Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Process timelines","Step-by-step guides"],"evidence_pages":["page-07"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large left-aligned image with staggered right-aligned typography and massive watermark text.","zones":["Large left-aligned image with staggered right-aligned typography and massive watermark text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["watermark-text","asymmetric"],"avoid":["Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Showcasing a single striking image alongside a brief statement"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"main_content","purpose":"Showcase photography","bbox":[0.0,0.05,0.74,0.69],"priority":1}]}]
- closing: {"id":"closing-primary","composition":"Full background image with a thin inset geometric frame and centered closing text.","zones":["Full background image with a thin inset geometric frame and centered closing text."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Persistent corner color blocks (beige top-right, taupe bottom-left) framing the slides","Rotated marginal metadata text (e.g., year, category)","Oversized, occasionally broken typography used as graphical elements"],"optional_variants":["framed-closing","minimal"],"avoid":["Any content requiring reading","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final impactful statement"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_background","purpose":"Final impression image","bbox":[0.06,0.09,0.88,0.81],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are used as large architectural blocks, often cropped tightly to vertical or panoramic aspect ratios.
- Thin overlapping strokes or frames sometimes border the images.
- Typography frequently overlaps the boundary between image and background.

【图标与装饰】
- Minimalist, thin-line vector icons.
- Icons in data slides are often placed inside or above circular/geometric containers with dotted connector lines.

【数据页构图】
- Ascending isometric platforms with floating icons and staggered descriptive text.

【图表风格】
- Abstract geometric representations of data (e.g., ascending 3D isometric squares).
- Segmented horizontal color bars used to denote categories or progress.
- Large, prominent percentage numbers aligned with vertical icon columns.

【章节页构图】
- Central vertical image pillar flanked by staggered typography and a large numerical watermark.

【收尾页构图】
- Full background image with a thin inset geometric frame and centered closing text.

【禁止】
- Avoid using the broken-word typographic style if readability or automated text-wrapping is required.
- Do not break the persistent marginal tab layout unless intentionally signaling a new presentation section.
- Avoid jarring, highly saturated colors that break the muted Morandi palette (e.g., neon or bright primary colors).
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Editorial portfolios、Design agency credentials、High-end lifestyle product pitches。
