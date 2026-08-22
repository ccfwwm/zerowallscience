# 优雅线条（60）---木七设计 · ppt模板 / linzi-morandi-ppt-60-17f1ff7a

## 风格ID
linzi-morandi-ppt-60-17f1ff7a

## 风格名称
优雅线条（60）---木七设计 · ppt模板 / linzi-morandi-ppt-60-17f1ff7a

## 风格描述
An elegant, minimalist presentation template featuring a muted Morandi pastel palette, subtle paper textures, organic fluid shapes, and delicate botanical line art.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Off-white paper background (#FDFCF9) sets the canvas. Medium-dark gray (#6E6E6E) for primary typography. Pastel accents (dusty rose, mustard, sage green) used for organic shapes and chart data.
- fonts: Elegant, lightweight sans-serif for headings, paired with smaller English subtitles. Extremely light sans-serif for body copy. High dependence on centered alignments.
- spacing: Generous margins, breathing room around centered title blocks, and wide gutters between column elements.
- shape_language: Contrast between perfectly rectangular functional image slots and highly organic, amoeba-like background decorative shapes.
- texture: Subtle paper grain applied globally. Watercolor edge bleeding on organic blobs. Subtle metallic/textured brush strokes on botanical line art.
- grid: Symmetrical centered vertical axis for main structural elements, dividing into balanced 2-column or 4-column horizontal arrays for content.
- motion_or_depth: Primarily flat composition. Minimal depth created exclusively by overlapping line-art over fluid color shapes.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（60）---木七设计 · ppt模板 / linzi-morandi-ppt-60-17f1ff7a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template featuring a muted Morandi pastel palette, subtle paper textures, organic fluid shapes, and delicate botanical line art.
- 推荐配色：#FDFCF9、#6E6E6E、#D4A8A3、#E7C686、#A4B396、#CFC5B8

【不可丢失的风格锚点】
- Subtle off-white paper texture background
- Organic, fluid watercolor-style shapes anchored to edges and corners
- Delicate, textured botanical line-art overlays on shapes
- Centered title clusters with thin dashed separator lines
- Muted, low-saturation pastel color blocking

【字体】
- Main titles are strictly centered with a thin, short dashed line directly beneath them.
- Headings often utilize a primary language layered above a smaller, secondary language subtitle.
- Body text is kept ultra-lightweight and uses muted grays instead of stark black.

【封面页构图】
- Centered title block enveloped by organic shapes in all four corners

【内容页构图】
- Balanced two-column layout with upper image slots and lower text blocks

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title block enveloped by organic shapes in all four corners","zones":["Centered title block enveloped by organic shapes in all four corners"],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["centered","framed","organic-corners"],"avoid":["Heavy data","Dense text","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Section dividers"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Centered title block with lateral organic decorative shapes","zones":["Centered title block with lateral organic decorative shapes"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["minimal","transition","lateral-shapes"],"avoid":["Multi-column data","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Key quotes"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Balanced two-column layout with upper image slots and lower text blocks","zones":["Balanced two-column layout with upper image slots and lower text blocks"],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["2-column","image-text","balanced"],"avoid":["Single narrative flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Comparisons","Dual concepts","Team profiles"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"image-left","purpose":"Visual representation of left concept","bbox":[0.05,0.2,0.4,0.5],"priority":1},{"id":"image-right","purpose":"Visual representation of right concept","bbox":[0.55,0.2,0.4,0.5],"priority":2}]},{"id":"content-comparison","composition":"Two-column grid with wide images atop text blocks featuring circular indicator badges","zones":["Two-column grid with wide images atop text blocks featuring circular indicator badges"],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["2-column","badges","landscape-images"],"avoid":["Dense data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Numbered lists with visual context"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"image-top-left","purpose":"Visual context","bbox":[0.05,0.2,0.42,0.45],"priority":1},{"id":"image-top-right","purpose":"Visual context","bbox":[0.53,0.2,0.42,0.45],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Asymmetrical split with media on the left and dual circular charts on the right","zones":["Asymmetrical split with media on the left and dual circular charts on the right"],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["split-layout","donuts","data-showcase"],"avoid":["Complex tables","Long form text","copying source assets, source text, or an exact source arrangement"],"best_for":["High-level statistics","KPI highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"media-context","purpose":"Contextual image for data","bbox":[0.05,0.25,0.4,0.4],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Centered title block with lateral organic decorative shapes","zones":["Centered title block with lateral organic decorative shapes"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["minimal","transition","lateral-shapes"],"avoid":["Multi-column data","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Key quotes"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Symmetrical centered layout enveloped by organic shapes, mirroring the cover","zones":["Symmetrical centered layout enveloped by organic shapes, mirroring the cover"],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Subtle off-white paper texture background","Organic, fluid watercolor-style shapes anchored to edges and corners","Delicate, textured botanical line-art overlays on shapes"],"optional_variants":["bookend","centered","closing"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing remarks","Q&A slides"],"evidence_pages":["page-08"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are housed in sharp, unrounded rectangular frames.
- Occasional use of diagonal slicing or masking for visual interest (as seen in architectural compositions).
- Images occasionally overlap muted background color bands to break the grid.

【图标与装饰】
- Monochromatic flat icons matching the dusty rose accent color.
- Circular minimalist badges used for list enumerations and timeline nodes.

【数据页构图】
- Asymmetrical split with media on the left and dual circular charts on the right

【图表风格】
- Ultra-minimalist donut charts using the template's pastel palette.
- Large, airy typography placed directly inside the center of donut charts.

【章节页构图】
- Centered title block with lateral organic decorative shapes

【收尾页构图】
- Symmetrical centered layout enveloped by organic shapes, mirroring the cover

【禁止】
- Avoid high-saturation or neon colors that break the Morandi theme.
- Do not use heavy drop shadows or 3D bevel effects.
- Avoid thick, blocky, or aggressive typography.
- Do not clutter the edges; leave space for the organic decorative shapes.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Lifestyle and wellness branding、Boutique agency portfolios、Art and design concept pitches、Feminine or elegant corporate summaries。
