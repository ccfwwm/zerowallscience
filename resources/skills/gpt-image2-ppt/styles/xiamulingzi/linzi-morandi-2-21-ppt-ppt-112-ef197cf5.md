# 112 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-112-ef197cf5

## 风格ID
linzi-morandi-2-21-ppt-ppt-112-ef197cf5

## 风格名称
112 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-112-ef197cf5

## 风格描述
An elegant, artistic presentation template featuring a muted Morandi color palette, organic line-art illustrations, and creative image masking.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light warm beige backgrounds with dark espresso text; accents use muted tan, slate blue, and dusty rose to establish hierarchy and container boundaries.
- fonts: Sophisticated serif font for primary headings to convey elegance; clean sans-serif for body copy to ensure legibility.
- spacing: Generous interior padding with content clustered symmetrically in the center; expansive margins occupied by abstract decorative elements.
- shape_language: A mix of soft organic blobs, sweeping curved lines, circles, and heavily rounded rectangles.
- texture: Flat, matte vector layers overlapping to create a sense of shallow depth without using drop shadows.
- grid: Symmetrical multi-column grids (2-column, 3-column, 4-quadrant) balanced against asymmetrical organic background elements.
- motion_or_depth: Depth is achieved purely through 2D overlapping of solid color shapes and continuous line drawings.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「112 · PPT源文件 / linzi-morandi-2-21-ppt-ppt-112-ef197cf5」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, artistic presentation template featuring a muted Morandi color palette, organic line-art illustrations, and creative image masking.
- 推荐配色：#EAE6E1、#3A312B、#B58E71、#657989、#A67C74

【不可丢失的风格锚点】
- Muted, low-saturation earth tones (Morandi palette)
- Organic, overlapping continuous line-art botanical shapes
- Creative non-standard image masks (slices, rotated squares)
- Elegant serif typography combined with minimalist flat graphics

【字体】
- Headings use large, tracked-out elegant serif typography.
- Body text is muted, small, and highly legible in sans-serif.
- Section markers combine large prominent numbers with smaller structural subtitles.

【封面页构图】
- Centered title cluster framed by asymmetrical organic botanical line-art and color blobs in the corners.

【内容页构图】
- Left-side vertically sliced image composition paired with a right-side hierarchical text layout (main point above, two sub-points below).

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title cluster framed by asymmetrical organic botanical line-art and color blobs in the corners.","zones":["Centered title cluster framed by asymmetrical organic botanical line-art and color blobs in the corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["cover","centered","organic-frame","elegant"],"avoid":["Heavy data","Detailed agendas","copying source assets, source text, or an exact source arrangement"],"best_for":["Main presentation title","Minimalist welcoming screens"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned prominent section marker text balanced by a massive, overlapping organic leaf/blob illustration on the right.","zones":["Left-aligned prominent section marker text balanced by a massive, overlapping organic leaf/blob illustration on the right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["section-divider","asymmetrical","bold-typography","botanical"],"avoid":["Content-heavy lists","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Left-side vertically sliced image composition paired with a right-side hierarchical text layout (main point above, two sub-points below).","zones":["Left-side vertically sliced image composition paired with a right-side hierarchical text layout (main point above, two sub-points below)."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["image-slices","text-hierarchy","split-layout"],"avoid":["Data-heavy comparisons","Timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Feature highlights","Service overviews","Concept introductions"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"sliced-image-left","purpose":"Replaceable stylistic image representation","bbox":[0.05,0.2,0.35,0.7],"priority":1}]},{"id":"content-comparison","composition":"Scattered, tilted, rounded-square image masks on the left counterbalancing two stacked text blocks on the right.","zones":["Scattered, tilted, rounded-square image masks on the left counterbalancing two stacked text blocks on the right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["tilted-images","collage","split-layout"],"avoid":["Strict corporate reporting","Financial data","copying source assets, source text, or an exact source arrangement"],"best_for":["Gallery highlights","Before/after concepts","Dual-feature descriptions"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"tilted-image-1","purpose":"Upper image in collage","bbox":[0.1,0.15,0.25,0.4],"priority":1},{"id":"tilted-image-2","purpose":"Lower image in collage","bbox":[0.25,0.55,0.25,0.4],"priority":2}]}]
- data: [{"id":"data-metrics","composition":"Centered header above a 3-column layout featuring thick, concentric partial ring charts/icons.","zones":["Centered header above a 3-column layout featuring thick, concentric partial ring charts/icons."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["3-column","ring-graphics","symmetrical","metrics"],"avoid":["Long-form paragraphs","Complex line charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Key metrics","Three-step processes","Core value pillars"],"evidence_pages":["page-03"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Left-aligned prominent section marker text balanced by a massive, overlapping organic leaf/blob illustration on the right.","zones":["Left-aligned prominent section marker text balanced by a massive, overlapping organic leaf/blob illustration on the right."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["section-divider","asymmetrical","bold-typography","botanical"],"avoid":["Content-heavy lists","Complex charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Framed white canvas with thick colored borders top/bottom; lower-left QR code block, upper-right stylistic image element, central contact text.","zones":["Framed white canvas with thick colored borders top/bottom; lower-left QR code block, upper-right stylistic image element, central contact text."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-saturation earth tones (Morandi palette)","Organic, overlapping continuous line-art botanical shapes","Creative non-standard image masks (slices, rotated squares)"],"optional_variants":["closing","contact","qr-code","framed"],"avoid":["Core presentation content","copying source assets, source text, or an exact source arrangement"],"best_for":["Contact information","Q&A prompts","Back covers"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"handwritten-note","purpose":"Stylistic sign-off or logo placement","bbox":[0.75,0.1,0.15,0.25],"priority":1},{"id":"qr-code","purpose":"Functional contact link","bbox":[0.08,0.6,0.12,0.2],"priority":2}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are rarely standard rectangles; they are sliced into vertical strips or masked into rotated, rounded squares.
- Photography should be desaturated or naturally match the warm, earthy aesthetic of the deck.

【图标与装饰】
- Flat, solid white icons placed centrally within colored geometric containers (circles, squares).
- Minimalist and easily readable at small sizes.

【数据页构图】
- Centered header above a 3-column layout featuring thick, concentric partial ring charts/icons.

【图表风格】
- Data visualizations rely on bold geometric abstractions (e.g., thick partial ring charts or connected node matrices) using the core muted palette.

【章节页构图】
- Left-aligned prominent section marker text balanced by a massive, overlapping organic leaf/blob illustration on the right.

【收尾页构图】
- Framed white canvas with thick colored borders top/bottom; lower-left QR code block, upper-right stylistic image element, central contact text.

【禁止】
- Avoid harsh, highly saturated primary colors.
- Do not use sharp, unstyled rectangular image placements.
- Avoid heavy drop shadows or 3D bevel effects.
- Do not clutter the decorative margins with text.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative agency portfolios、Artistic brand guidelines、Lifestyle, fashion, or wellness product pitches、Elegant annual reports。
