# 优雅线条（19）---木七设计 · ppt模板 / linzi-morandi-ppt-19-dba00d7a

## 风格ID
linzi-morandi-ppt-19-dba00d7a

## 风格名称
优雅线条（19）---木七设计 · ppt模板 / linzi-morandi-ppt-19-dba00d7a

## 风格描述
An elegant, minimalist presentation template featuring a muted 'Morandi' color palette, organic fluid shapes, and textured accent lines for a calming aesthetic.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Cream background (#F8F6F1) with Mocha (#3F3635) for body text. Sage (#647C73) and Blush (#DDB8A4) used for headings, graphics, and accents.
- fonts: Clean, light-to-regular weight sans-serif for modern minimalism. Headings use slightly larger tracking.
- spacing: Loose and airy rhythm. Large margins (approx 10-15%) with content blocks separated by significant whitespace.
- shape_language: Primarily fluid, amoeba-like organic curves. Secondary shapes are perfect circles used as masks or nodes.
- texture: Smooth flat color fills contrasted with rough, dry-brush textured accent lines and scattered small dot clusters.
- grid: Asymmetrical grid heavily influenced by the negative space left by corner organic graphics.
- motion_or_depth: 2.5D depth achieved through flat shapes overlapping each other, without drop shadows.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（19）---木七设计 · ppt模板 / linzi-morandi-ppt-19-dba00d7a」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- An elegant, minimalist presentation template featuring a muted 'Morandi' color palette, organic fluid shapes, and textured accent lines for a calming aesthetic.
- 推荐配色：#F8F6F1、#3F3635、#647C73、#DDB8A4

【不可丢失的风格锚点】
- Overlapping organic corner blobs
- Muted, low-saturation color palette
- Thin, textured hand-drawn accent curves
- Generous use of negative space

【字体】
- Headings use theme accent colors (Sage or Blush) to stand out against the cream background.
- Body text uses dark mocha instead of pure black for softer contrast.
- Vertical separator lines often pair with primary titles for structural grounding.

【封面页构图】
- Centered title block with a stylized organic logo, bracketed by heavy organic shape clusters in the top-left and bottom-right corners.

【内容页构图】
- Split layout: top-centered main heading. Left column contains body text and a vertical list of circular thumbnail items. Right column contains a large vertical hero image.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Centered title block with a stylized organic logo, bracketed by heavy organic shape clusters in the top-left and bottom-right corners.","zones":["Centered title block with a stylized organic logo, bracketed by heavy organic shape clusters in the top-left and bottom-right corners."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["diagonal-balance","minimal-title","organic-frame"],"avoid":["Detailed content","Image heavy layouts","copying source assets, source text, or an exact source arrangement"],"best_for":["Deck title","Main opening slide"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Left-aligned title block with a vertical separator line, flanked by identical top-left and bottom-right organic corner frames as the cover.","zones":["Left-aligned title block with a vertical separator line, flanked by identical top-left and bottom-right organic corner frames as the cover."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["left-aligned-title","section-break","asymmetrical"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda markers"],"evidence_pages":["page-01"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Split layout: top-centered main heading. Left column contains body text and a vertical list of circular thumbnail items. Right column contains a large vertical hero image.","zones":["Split layout: top-centered main heading. Left column contains body text and a vertical list of circular thumbnail items. Right column contains a large vertical hero image."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["split-layout","text-with-hero","circular-thumbnails"],"avoid":["Heavy data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Team member introductions","Product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-image","purpose":"Primary visual support","bbox":[0.64,0.26,0.27,0.64],"priority":1},{"id":"thumbnail-1","purpose":"Secondary supporting visual","bbox":[0.09,0.61,0.06,0.11],"priority":2},{"id":"thumbnail-2","purpose":"Secondary supporting visual","bbox":[0.09,0.79,0.06,0.11],"priority":3}]},{"id":"content-comparison","composition":"U-shaped/arc diagram layout. A dashed curved line connects four circular nodes. Top-centered main heading. Text blocks are paired with each node.","zones":["U-shaped/arc diagram layout. A dashed curved line connects four circular nodes. Top-centered main heading. Text blocks are paired with each node."],"content_capacity":{"density":"medium","max_items":6},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["process-arc","timeline","node-diagram"],"avoid":["Unrelated bullet points","copying source assets, source text, or an exact source arrangement"],"best_for":["Timelines","Step-by-step processes","Milestone tracking"],"evidence_pages":["page-04"],"external_image_slots":[]}]
- data: [{"id":"data-metrics","composition":"Left-aligned title block with a vertical separator line, flanked by identical top-left and bottom-right organic corner frames as the cover.","zones":["Left-aligned title block with a vertical separator line, flanked by identical top-left and bottom-right organic corner frames as the cover."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["left-aligned-title","section-break","asymmetrical"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter transitions","Agenda markers"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Split layout: top-centered main heading. Left column contains body text and a vertical list of circular thumbnail items. Right column contains a large vertical hero image.","zones":["Split layout: top-centered main heading. Left column contains body text and a vertical list of circular thumbnail items. Right column contains a large vertical hero image."],"content_capacity":{"density":"medium","max_items":5},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["split-layout","text-with-hero","circular-thumbnails"],"avoid":["Heavy data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Executive summaries","Team member introductions","Product highlights"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"hero-image","purpose":"Primary visual support","bbox":[0.64,0.26,0.27,0.64],"priority":1},{"id":"thumbnail-1","purpose":"Secondary supporting visual","bbox":[0.09,0.61,0.06,0.11],"priority":2},{"id":"thumbnail-2","purpose":"Secondary supporting visual","bbox":[0.09,0.79,0.06,0.11],"priority":3}]}]
- closing: {"id":"closing-primary","composition":"Left-aligned closing message block. Heavy, clustered, cascading organic shapes occupying the entire top-right to bottom-right quadrant.","zones":["Left-aligned closing message block. Heavy, clustered, cascading organic shapes occupying the entire top-right to bottom-right quadrant."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Overlapping organic corner blobs","Muted, low-saturation color palette","Thin, textured hand-drawn accent curves"],"optional_variants":["heavy-right-balance","closing-message","asymmetrical-outro"],"avoid":["Standard content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Q&A prompts","Thank you slide","Contact information"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Photographs are used primarily unedited but strictly framed either in soft rectangles or perfect circular masks.
- Images sit flush within the layout, never overlapping the primary corner organic graphics.

【图标与装饰】
- Flat, minimalist white silhouette icons placed inside solid circular colored nodes.
- Icons are scaled down to allow ample breathing room within their enclosing circles.

【数据页构图】
- Left-aligned title block with a vertical separator line, flanked by identical top-left and bottom-right organic corner frames as the cover.

【图表风格】
- No traditional data charts present. Data/processes are represented via geometric node-and-connector diagrams.

【章节页构图】
- Left-aligned title block with a vertical separator line, flanked by identical top-left and bottom-right organic corner frames as the cover.

【收尾页构图】
- Left-aligned closing message block. Heavy, clustered, cascading organic shapes occupying the entire top-right to bottom-right quadrant.

【禁止】
- Strict geometric shapes with sharp corners (e.g., sharp triangles or heavy rectangles) as background elements.
- High saturation or neon colors.
- Heavy drop shadows or 3D bevel effects on text or shapes.
- Edge-to-edge text layouts; crowding the negative space.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolio presentations、Lifestyle or wellness brand pitches、End-of-year summaries or reflective reports、HR and culture deck templates。
