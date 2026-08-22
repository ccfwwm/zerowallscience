# 精选科技风10 · 模板 / linzi-tech-10-ab71ea82

## 风格ID
linzi-tech-10-ab71ea82

## 风格名称
精选科技风10 · 模板 / linzi-tech-10-ab71ea82

## 风格描述
A high-contrast, tech-focused dark mode theme utilizing vibrant, luminous abstract textures contrasted with sharp, minimal geometric UI accents.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Pure black backgrounds (#000000) with crisp white text. Vibrant cyan/blue (#00AEEF) strictly for key structural accents, active states, and single-word highlights. Solid dark greys for secondary panel backgrounds.
- fonts: Bold, wide geometric sans-serif for primary headers. Clean, lighter sans-serif for body copy. Occasional italic sans-serif for subtle secondary labels.
- spacing: Generous framing around centralized glowing elements. Distinct horizontal and vertical banding for content separation.
- shape_language: Sharp, angular geometric UI accents (hollow squares, triangles, distinct rectangles) contrasting sharply with soft, ethereal background textures.
- texture: High contrast between smooth, flat foreground panels and intensely granular, glowing, gaseous/particle abstract background plates.
- grid: Flexible systems utilizing 50/50 vertical splits, stark horizontal banding, and structured radial or serpentine paths.
- motion_or_depth: Extreme simulated depth achieved by placing flat, crisp UI layers atop deep, dark, chaotic luminous backgrounds.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「精选科技风10 · 模板 / linzi-tech-10-ab71ea82」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A high-contrast, tech-focused dark mode theme utilizing vibrant, luminous abstract textures contrasted with sharp, minimal geometric UI accents.
- 推荐配色：#000000、#FFFFFF、#00AEEF、#1C2026、#FCA311

【不可丢失的风格锚点】
- Deep black void backgrounds
- Luminous, organic, particle-based central focal textures
- Sharp, electric cyan typographic and structural accents
- Strict separation between flat foreground UI elements and deep background elements

【字体】
- Scale headers massively to act as primary visual elements alongside central textures
- Use pure white for primary reading text, reserving the vibrant accent color for singular key words or small sub-labels
- Ensure high line-height for body copy to maintain legibility against dark backgrounds

【封面页构图】
- Centered massive typography overlapping an organic central texture, framed by dark void

【内容页构图】
- Asymmetric split: Left dark content block, right full-height image with large numeric indicator and transparent colored overlay

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered massive typography overlapping an organic central texture, framed by dark void","zones":["Centered massive typography overlapping an organic central texture, framed by dark void"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["hero","centered","dark-mode"],"avoid":["Detailed content or lists","copying source assets, source text, or an exact source arrangement"],"best_for":["High-impact title introductions","Setting the visual theme"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero_texture","purpose":"Replaceable abstract focal texture","bbox":[0.1,0.1,0.8,0.8],"priority":1}]}
- section: {"id":"section-primary","composition":"Serpentine S-curve path connecting icon nodes, flanked by partial circular textures on edges","zones":["Serpentine S-curve path connecting icon nodes, flanked by partial circular textures on edges"],"content_capacity":{"density":"low","max_items":6},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["path","s-curve","process","dark-mode"],"avoid":["Heavy text descriptions per node","copying source assets, source text, or an exact source arrangement"],"best_for":["Process flows","User journeys","Simple roadmaps"],"evidence_pages":["page-03"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Asymmetric split: Left dark content block, right full-height image with large numeric indicator and transparent colored overlay","zones":["Asymmetric split: Left dark content block, right full-height image with large numeric indicator and transparent colored overlay"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["split-vertical","image-overlay","numbered"],"avoid":["Dense multi-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Detailed feature explanation","Case studies with associated imagery"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right_hero_image","purpose":"Full height contextual image","bbox":[0.5,0.0,0.5,1.0],"priority":1},{"id":"left_inset_image","purpose":"Supporting detail image","bbox":[0.05,0.58,0.4,0.3],"priority":2}]},{"id":"content-comparison","composition":"Two-column layout: Left text with sharp geometric accents, right large device mockup framing a visual","zones":["Two-column layout: Left text with sharp geometric accents, right large device mockup framing a visual"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["mockup","split","buttons"],"avoid":["Data-heavy reporting","copying source assets, source text, or an exact source arrangement"],"best_for":["Software or digital product showcases","Key visual features"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"device_screen","purpose":"Showcase content inside device frame","bbox":[0.55,0.1,0.4,0.7],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Upper stylized, multi-colored peaked area chart; lower row of distinct text cards with colored top borders","zones":["Upper stylized, multi-colored peaked area chart; lower row of distinct text cards with colored top borders"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["chart","area-graph","cards","neon"],"avoid":["Precise, highly detailed statistical readouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend visualization","Comparative data phases"],"evidence_pages":["page-05"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Horizontal split: Top wide image band, bottom dark area with a 4-column icon/text grid","zones":["Horizontal split: Top wide image band, bottom dark area with a 4-column icon/text grid"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["split-horizontal","icon-grid","image-header"],"avoid":["Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Core feature highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"header_panorama","purpose":"Atmospheric wide image","bbox":[0.0,0.1,1.0,0.5],"priority":1}]}]
- agenda: {"id":"agenda-primary","composition":"Horizontal split: Top wide image band, bottom dark area with a 4-column icon/text grid","zones":["Horizontal split: Top wide image band, bottom dark area with a 4-column icon/text grid"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["agenda","numbered-list"],"min_items":3,"max_items":8},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["split-horizontal","icon-grid","image-header"],"avoid":["Complex data visualizations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Core feature highlights"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"header_panorama","purpose":"Atmospheric wide image","bbox":[0.0,0.1,1.0,0.5],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered massive typography over a chaotic, glowing background texture, mirroring the cover","zones":["Centered massive typography over a chaotic, glowing background texture, mirroring the cover"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Deep black void backgrounds","Luminous, organic, particle-based central focal textures","Sharp, electric cyan typographic and structural accents"],"optional_variants":["outro","centered","hero"],"avoid":["Summary lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Final thank you slides","Final call to action"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing_texture","purpose":"Final atmospheric background","bbox":[0.0,0.0,1.0,1.0],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Utilize abstract, luminous, organic forms as hero backgrounds rather than literal photography
- If literal photography is used, apply heavy dark or colored overlays to push them into the background and maintain the low-key aesthetic
- Frame complex visuals inside device mockups or strict geometric clipping masks when integrating with content

【图标与装饰】
- Employ simple, strictly line-art icons in pure white or the primary cyan accent
- Keep icons visually lightweight so they do not compete with the heavy background textures

【数据页构图】
- Upper stylized, multi-colored peaked area chart; lower row of distinct text cards with colored top borders

【图表风格】
- Use highly stylized area or line charts devoid of complex gridlines
- Fill data areas with vibrant, saturated, opaque colors that punch out dramatically against the black background
- Avoid subtle gradients in data shapes; prefer solid neon/jewel tones

【章节页构图】
- Serpentine S-curve path connecting icon nodes, flanked by partial circular textures on edges

【收尾页构图】
- Centered massive typography over a chaotic, glowing background texture, mirroring the cover

【禁止】
- Do not use light or white backgrounds for primary slides
- Avoid drop shadows on text or UI elements; rely entirely on color contrast
- Do not mix organic shapes into the flat UI layer
- Avoid low-contrast or pastel accent colors
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Future-focused technology pitches、Cybersecurity or data-heavy service overviews、Conceptual product or feature reveals、High-impact mainstage keynote presentations。
