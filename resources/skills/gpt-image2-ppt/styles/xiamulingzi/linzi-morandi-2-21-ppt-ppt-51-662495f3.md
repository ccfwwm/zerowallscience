# 51 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-51-662495f3

## 风格ID
linzi-morandi-2-21-ppt-ppt-51-662495f3

## 风格名称
51 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-51-662495f3

## 风格描述
Editorial, high-fashion presentation template relying heavily on stark contrast, monochrome blocking, and full-bleed moody photography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Monochrome core: White backgrounds, charcoal/black panels, and mid-gray accent bars. Relies on photography for color saturation.
- fonts: Elegant high-contrast Serif for hero titles; clean, bold geometric Sans-Serif for headings and body. Heavy use of ALL CAPS.
- spacing: Generous negative space, asymmetrical margins, tight grouping of related text blocks contrasting with open empty zones.
- shape_language: Strictly orthogonal. Sharp corners, un-rounded rectangles, stark lines.
- texture: Flat, matte color blocks contrasting with high-fidelity, softly lit photographic textures.
- grid: Deconstructed modular grid. Elements often span multiple columns but intentionally leave adjacent columns completely empty.
- motion_or_depth: Flat layered depth achieved through translucent overlays (e.g., white semi-transparent bars over images) and overlapping text.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「51 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-51-662495f3」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Editorial, high-fashion presentation template relying heavily on stark contrast, monochrome blocking, and full-bleed moody photography.
- 推荐配色：#FFFFFF、#3A3A3A、#111111、#8B8B8B、#EAEAEA

【不可丢失的风格锚点】
- High-contrast editorial typography (mix of elegant serif and bold sans-serif)
- Stark monochrome geometry (sharp black, white, and gray rectangles)
- Asymmetrical image placements with generous negative space
- Rotated and overlapping typographic elements

【字体】
- Use ALL CAPS for primary headings and section titles.
- Maintain extreme contrast in scale between hero titles and body copy.
- Body copy should be set in a clean sans-serif, often in contrasting color blocks (white on dark grey, dark grey on white).

【封面页构图】
- Full-bleed background image with centered, high-contrast serif typography and widely tracked subtitle.

【内容页构图】
- Asymmetrical layout with a 3-image horizontal strip centered vertically, large top-left typography, and a heavy right-side vertical color block.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background image with centered, high-contrast serif typography and widely tracked subtitle.","zones":["Full-bleed background image with centered, high-contrast serif typography and widely tracked subtitle."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["full-bleed","centered","hero","minimal"],"avoid":["Data-heavy introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Section heroes"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"bg-image","purpose":"Full bleed atmospheric background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"50/50 split layout. Left side features an image with a translucent vertical overlay containing rotated text. Right side is a dark color block with text.","zones":["50/50 split layout. Left side features an image with a translucent vertical overlay containing rotated text. Right side is a dark color block with text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["split","rotated-text","overlay","dark-mode-half"],"avoid":["Dense reading material","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Chapter headers"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"left-image","purpose":"Section hero image","bbox":[0,0,0.5,1],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetrical layout with a 3-image horizontal strip centered vertically, large top-left typography, and a heavy right-side vertical color block.","zones":["Asymmetrical layout with a 3-image horizontal strip centered vertically, large top-left typography, and a heavy right-side vertical color block."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["gallery","strip","asymmetrical","color-block"],"avoid":["Single dominant narratives","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Product galleries","Team profiles","Process steps"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-1","purpose":"Gallery item 1","bbox":[0.05,0.3,0.25,0.3],"priority":1},{"id":"img-2","purpose":"Gallery item 2","bbox":[0.32,0.3,0.25,0.3],"priority":2},{"id":"img-3","purpose":"Gallery item 3","bbox":[0.59,0.3,0.25,0.3],"priority":3}]},{"id":"content-comparison","composition":"Two disconnected content zones. Left: Image inside a dark bounding box with overlaid text. Right: Top-aligned image with bottom-aligned text.","zones":["Two disconnected content zones. Left: Image inside a dark bounding box with overlaid text. Right: Top-aligned image with bottom-aligned text."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["two-column","offset","image-heavy"],"avoid":["Sequential workflows","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Dual narratives","Featured articles"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-image","purpose":"Framed image","bbox":[0.1,0.15,0.3,0.7],"priority":1},{"id":"right-image","purpose":"Unframed image","bbox":[0.45,0.1,0.45,0.45],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Full-bleed monochromatic image with centered, multi-line sans-serif text overlay.","zones":["Full-bleed monochromatic image with centered, multi-line sans-serif text overlay."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["overlay","quote","monochrome"],"avoid":["Detailed content","Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Key quotes","Manifestos"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bg-image","purpose":"Darkened full bleed background","bbox":[0.05,0.05,0.9,0.9],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Asymmetrical layout with a 3-image horizontal strip centered vertically, large top-left typography, and a heavy right-side vertical color block.","zones":["Asymmetrical layout with a 3-image horizontal strip centered vertically, large top-left typography, and a heavy right-side vertical color block."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["gallery","strip","asymmetrical","color-block"],"avoid":["Single dominant narratives","Charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Product galleries","Team profiles","Process steps"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"img-1","purpose":"Gallery item 1","bbox":[0.05,0.3,0.25,0.3],"priority":1},{"id":"img-2","purpose":"Gallery item 2","bbox":[0.32,0.3,0.25,0.3],"priority":2},{"id":"img-3","purpose":"Gallery item 3","bbox":[0.59,0.3,0.25,0.3],"priority":3}]}]
- quote: {"id":"quote-primary","composition":"Full-bleed monochromatic image with centered, multi-line sans-serif text overlay.","zones":["Full-bleed monochromatic image with centered, multi-line sans-serif text overlay."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["overlay","quote","monochrome"],"avoid":["Detailed content","Bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Mission statements","Key quotes","Manifestos"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bg-image","purpose":"Darkened full bleed background","bbox":[0.05,0.05,0.9,0.9],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Full-bleed background image with massive, centered, all-caps sans-serif text.","zones":["Full-bleed background image with massive, centered, all-caps sans-serif text."],"content_capacity":{"density":"low","max_items":1},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["High-contrast editorial typography (mix of elegant serif and bold sans-serif)","Stark monochrome geometry (sharp black, white, and gray rectangles)","Asymmetrical image placements with generous negative space"],"optional_variants":["closing","full-bleed","massive-text"],"avoid":["Contact detail lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slides","Final calls to action"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"bg-image","purpose":"Dramatic full-bleed closer","bbox":[0,0,1,1],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be desaturated, moody, or explicitly black-and-white to match the template's stark tone.
- Utilize full-bleed scaling for hero/divider slides.
- For interior content, use strict rectangular crops without borders, sometimes overlapping color blocks.

【图标与装饰】
- Minimalist, flat, monochromatic icons (e.g., social media logos or simple navigation arrows).

【数据页构图】
- Full-bleed monochromatic image with centered, multi-line sans-serif text overlay.

【图表风格】
- No charts present, but any data visualization would require strict adherence to monochrome/grayscale palettes to avoid breaking the aesthetic.

【章节页构图】
- 50/50 split layout. Left side features an image with a translucent vertical overlay containing rotated text. Right side is a dark color block with text.

【收尾页构图】
- Full-bleed background image with massive, centered, all-caps sans-serif text.

【禁止】
- No bright, saturated primary colors.
- No rounded corners, soft drop shadows, or bubbly shapes.
- Avoid generic, highly lit corporate stock photography; it will break the editorial mood.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Fashion lookbooks、Photography portfolios、High-end luxury brand pitches、Minimalist design agency presentations。
