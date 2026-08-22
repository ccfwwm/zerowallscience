# 莫兰迪风格PPT (31) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-31-485ae190

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-31-485ae190

## 风格名称
莫兰迪风格PPT (31) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-31-485ae190

## 风格描述
Minimalist Morandi-style template featuring muted earth tones, subtle marble textures, asymmetrical splits, and polaroid-style image framing with soft shadows.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Primary background is white, flanked by light grey/marble (#F4F4F4) and beige (#C6B398) structural blocks. Text relies on a warm charcoal/brown (#7C7876).
- fonts: Geometric sans-serif for primary headings (often capitalized and tracked out). Clean sans-serif for body. Occasional script font for subtle decorative accents.
- spacing: Generous margins, prioritizing negative space. Text blocks are compact and clearly separated from imagery.
- shape_language: Primarily orthogonal (rectangles, sharp lines) contrasted with large, intentionally cropped circular background elements and circular portrait crops.
- texture: Light marble texture used as a grounding element or side panel, contrasting with flat matte colors.
- grid: Modular and asymmetrical. Elements frequently bridge the dividing line between two different background color zones.
- motion_or_depth: Depth is consistently achieved by placing crisp white-bordered images with soft, realistic drop shadows over flat or textured backgrounds.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (31) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-31-485ae190」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Minimalist Morandi-style template featuring muted earth tones, subtle marble textures, asymmetrical splits, and polaroid-style image framing with soft shadows.
- 推荐配色：#FFFFFF、#C6B398、#7C7876、#F4F4F4

【不可丢失的风格锚点】
- Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)
- Subtle marble texture applied to specific layout zones or geometric shapes
- Polaroid-style image frames with prominent white borders and soft drop shadows
- Large, cropped geometric background elements (circles, diagonal sections)

【字体】
- Headings: Uppercase, heavily tracked (letter-spaced), typically in dark grey/brown.
- Body: Standard sentence case, lighter weight, slightly muted grey.
- Vertical Text: Used as edge framing or section markers (e.g., 'CREATED BY').

【封面页构图】
- Asymmetrical split background with overlapping vertical accent block, large cropped background circle, and edge-aligned vertical text.

【内容页构图】
- Three-column vertical card layout on a textured background, with the center card highlighted via an inverted background color.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Asymmetrical split background with overlapping vertical accent block, large cropped background circle, and edge-aligned vertical text.","zones":["Asymmetrical split background with overlapping vertical accent block, large cropped background circle, and edge-aligned vertical text."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["minimalist","split-background","typographic"],"avoid":["Dense data","Image galleries","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Section breaker"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Narrow left sidebar with date/metadata and oversized typography, alongside a massive edge-to-edge landscape image anchored by a bottom banner.","zones":["Narrow left sidebar with date/metadata and oversized typography, alongside a massive edge-to-edge landscape image anchored by a bottom banner."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["hero-image","date-focus","sidebar"],"avoid":["Standard bullet points","Multi-image layouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Event announcements","Portfolio dividers"],"evidence_pages":["page-05"],"external_image_slots":[{"id":"hero-landscape","purpose":"Full-bleed section image","bbox":[0.27,0.1,0.7,0.8],"priority":1}]}
- content: [{"id":"content-content","composition":"Three-column vertical card layout on a textured background, with the center card highlighted via an inverted background color.","zones":["Three-column vertical card layout on a textured background, with the center card highlighted via an inverted background color."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["3-column","cards","gallery"],"avoid":["Long-form text","Complex timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Service pillars","Portfolio gallery"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"card-left","purpose":"Left feature image","bbox":[0.08,0.26,0.24,0.35],"priority":2},{"id":"card-center","purpose":"Center feature image","bbox":[0.38,0.26,0.24,0.35],"priority":1},{"id":"card-right","purpose":"Right feature image","bbox":[0.67,0.26,0.24,0.35],"priority":2}]},{"id":"content-comparison","composition":"Left-aligned text blocks with a prominently overlapping, polaroid-style framed image on the right, bridging a split background.","zones":["Left-aligned text blocks with a prominently overlapping, polaroid-style framed image on the right, bridging a split background."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["polaroid","overlap","focus"],"avoid":["Multiple data points","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Single item showcase","Team member highlight","Key concept introduction"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-showcase","purpose":"Primary subject showcase","bbox":[0.46,0.14,0.37,0.72],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Three-column vertical card layout on a textured background, with the center card highlighted via an inverted background color.","zones":["Three-column vertical card layout on a textured background, with the center card highlighted via an inverted background color."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["3-column","cards","gallery"],"avoid":["Long-form text","Complex timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Product features","Service pillars","Portfolio gallery"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"card-left","purpose":"Left feature image","bbox":[0.08,0.26,0.24,0.35],"priority":2},{"id":"card-center","purpose":"Center feature image","bbox":[0.38,0.26,0.24,0.35],"priority":1},{"id":"card-right","purpose":"Right feature image","bbox":[0.67,0.26,0.24,0.35],"priority":2}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned text blocks with a prominently overlapping, polaroid-style framed image on the right, bridging a split background.","zones":["Left-aligned text blocks with a prominently overlapping, polaroid-style framed image on the right, bridging a split background."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["polaroid","overlap","focus"],"avoid":["Multiple data points","Lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Single item showcase","Team member highlight","Key concept introduction"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"main-showcase","purpose":"Primary subject showcase","bbox":[0.46,0.14,0.37,0.72],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Polaroid-style image overlapping a large cropped background circle on the left, paired with right-aligned text featuring decorative quotation marks.","zones":["Polaroid-style image overlapping a large cropped background circle on the left, paired with right-aligned text featuring decorative quotation marks."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["quote","geometric-accent","framed-image"],"avoid":["Data charts","Process flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Client quotes","Mission statements","Executive summaries"],"evidence_pages":["page-06"],"external_image_slots":[{"id":"quote-context","purpose":"Image accompanying the quote","bbox":[0.07,0.29,0.41,0.42],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Asymmetrical split background with overlapping vertical accent block, large cropped background circle, and edge-aligned vertical text, mirroring the cover.","zones":["Asymmetrical split background with overlapping vertical accent block, large cropped background circle, and edge-aligned vertical text, mirroring the cover."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Asymmetrical split-screen backgrounds (often 20/80 or 30/70 ratios)","Subtle marble texture applied to specific layout zones or geometric shapes","Polaroid-style image frames with prominent white borders and soft drop shadows"],"optional_variants":["closing","bookend","minimalist"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Polaroid-style: Rectangular with a thick white border and soft drop shadow.
- Edge-to-edge: Spanning the full width of a predefined bounding box or layout zone.
- Circular crops: Used specifically for human subjects/profiles.

【图标与装饰】
- Monochromatic, flat silhouettes or simple shapes matching the primary beige accent color.

【数据页构图】
- Three-column vertical card layout on a textured background, with the center card highlighted via an inverted background color.

【图表风格】
- No complex data charts present; structured data relies on icons, horizontal timelines, and clean typographic lists.

【章节页构图】
- Narrow left sidebar with date/metadata and oversized typography, alongside a massive edge-to-edge landscape image anchored by a bottom banner.

【收尾页构图】
- Asymmetrical split background with overlapping vertical accent block, large cropped background circle, and edge-aligned vertical text, mirroring the cover.

【禁止】
- Highly saturated or neon colors.
- Harsh black text (use warm dark grey instead).
- Cluttered layouts lacking significant white space.
- Images without white borders or shadows when floating over split backgrounds.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lookbooks and fashion portfolios、Architecture and interior design proposals、Boutique brand agency presentations、Minimalist corporate overviews。
