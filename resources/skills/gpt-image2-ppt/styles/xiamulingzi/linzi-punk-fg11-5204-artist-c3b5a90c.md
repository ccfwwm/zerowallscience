# 5204-Artist · FG11【朋克酷风】 / linzi-punk-fg11-5204-artist-c3b5a90c

## 风格ID
linzi-punk-fg11-5204-artist-c3b5a90c

## 风格名称
5204-Artist · FG11【朋克酷风】 / linzi-punk-fg11-5204-artist-c3b5a90c

## 风格描述
Edgy, brutalist presentation style featuring giant repeating typography, neon-on-black color blocking, and asymmetric geometric overlaps.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Black and white form the structural foundation, while neon cyan and magenta act as aggressive highlight blocks and line accents.
- fonts: Heavy, bold sans-serif display type, frequently uppercase and italicized, paired with neutral sans-serif body copy.
- spacing: Tight, aggressive leading on display typography contrasted with expansive white space around structural content blocks.
- shape_language: Hard-edged rectangles, thick border lines, and sharp horizontal/vertical intersections.
- texture: Watermark typography and thin neon structural lines over solid dark blocks.
- grid: Asymmetric and brutalist, deliberately breaking alignments to overlap images, text, and color fields.
- motion_or_depth: Flat structural layers (z-index stacking) relying on high contrast rather than shadows to create depth.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「5204-Artist · FG11【朋克酷风】 / linzi-punk-fg11-5204-artist-c3b5a90c」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Edgy, brutalist presentation style featuring giant repeating typography, neon-on-black color blocking, and asymmetric geometric overlaps.
- 推荐配色：#000000、#FFFFFF、#00FF9D、#FF0066

【不可丢失的风格锚点】
- Giant, overlapping, and bleeding background typography
- Extreme contrast using black backgrounds with sparse neon cyan/magenta accents
- Stark geometric intersections (black rectangles cutting into photos and text)
- Repeated/staggered typographic lines for texture

【字体】
- Use oversized, bold, italic uppercase sans-serifs as background textures, bleeding off edges.
- Overlap large numbers or headers directly across the boundary of photos and negative space.
- Apply curved or circular paths to large text for transition slides.

【封面页构图】
- Full-bleed background with central glitched/staggered typography and corner-anchored structural text blocks.

【内容页构图】
- Asymmetric split with bottom-left image overlapped by a neon block, contrasting with a giant typographic background on a white canvas.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Full-bleed background with central glitched/staggered typography and corner-anchored structural text blocks.","zones":["Full-bleed background with central glitched/staggered typography and corner-anchored structural text blocks."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Giant, overlapping, and bleeding background typography","Extreme contrast using black backgrounds with sparse neon cyan/magenta accents","Stark geometric intersections (black rectangles cutting into photos and text)"],"optional_variants":["glitch-text","full-bleed","dark-mode"],"avoid":["Information-heavy intros","copying source assets, source text, or an exact source arrangement"],"best_for":["Title slides","Impactful event openings"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-bg","purpose":"Full bleed dark aesthetic background","bbox":[0,0,1,1],"priority":1}]}
- section: {"id":"section-primary","composition":"Left-aligned full-height image cropped aggressively, bleeding watermark text, and a giant numeral intersecting a thin neon tracking line across the page.","zones":["Left-aligned full-height image cropped aggressively, bleeding watermark text, and a giant numeral intersecting a thin neon tracking line across the page."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Giant, overlapping, and bleeding background typography","Extreme contrast using black backgrounds with sparse neon cyan/magenta accents","Stark geometric intersections (black rectangles cutting into photos and text)"],"optional_variants":["giant-number","neon-line","left-image-anchor"],"avoid":["Detailed comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Numbered section breaks","Step-by-step intros"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-column-image","purpose":"Section anchor visual","bbox":[0.08,0,0.36,1],"priority":1}]}
- content: [{"id":"content-content","composition":"Asymmetric split with bottom-left image overlapped by a neon block, contrasting with a giant typographic background on a white canvas.","zones":["Asymmetric split with bottom-left image overlapped by a neon block, contrasting with a giant typographic background on a white canvas."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Giant, overlapping, and bleeding background typography","Extreme contrast using black backgrounds with sparse neon cyan/magenta accents","Stark geometric intersections (black rectangles cutting into photos and text)"],"optional_variants":["repeating-text","neon-accent","asymmetric-split"],"avoid":["Complex data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Statement slides"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bottom-left-image","purpose":"Atmospheric rectangular crop","bbox":[0.02,0.45,0.56,0.5],"priority":1}]},{"id":"content-comparison","composition":"Heavy overlapping layers: bleeding watermark text, central top-anchored photo, intersecting black title block, and solid neon footer bands.","zones":["Heavy overlapping layers: bleeding watermark text, central top-anchored photo, intersecting black title block, and solid neon footer bands."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Giant, overlapping, and bleeding background typography","Extreme contrast using black backgrounds with sparse neon cyan/magenta accents","Stark geometric intersections (black rectangles cutting into photos and text)"],"optional_variants":["layer-intersection","color-blocking","bleed-text"],"avoid":["Bullet-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Project showcases","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-top-image","purpose":"Main visual focus intersecting blocks","bbox":[0.05,0.1,0.89,0.52],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Asymmetric split with bottom-left image overlapped by a neon block, contrasting with a giant typographic background on a white canvas.","zones":["Asymmetric split with bottom-left image overlapped by a neon block, contrasting with a giant typographic background on a white canvas."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Giant, overlapping, and bleeding background typography","Extreme contrast using black backgrounds with sparse neon cyan/magenta accents","Stark geometric intersections (black rectangles cutting into photos and text)"],"optional_variants":["repeating-text","neon-accent","asymmetric-split"],"avoid":["Complex data delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Section introductions","Statement slides"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"bottom-left-image","purpose":"Atmospheric rectangular crop","bbox":[0.02,0.45,0.56,0.5],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Heavy overlapping layers: bleeding watermark text, central top-anchored photo, intersecting black title block, and solid neon footer bands.","zones":["Heavy overlapping layers: bleeding watermark text, central top-anchored photo, intersecting black title block, and solid neon footer bands."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Giant, overlapping, and bleeding background typography","Extreme contrast using black backgrounds with sparse neon cyan/magenta accents","Stark geometric intersections (black rectangles cutting into photos and text)"],"optional_variants":["layer-intersection","color-blocking","bleed-text"],"avoid":["Bullet-point lists","copying source assets, source text, or an exact source arrangement"],"best_for":["Project showcases","Key takeaways"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"center-top-image","purpose":"Main visual focus intersecting blocks","bbox":[0.05,0.1,0.89,0.52],"priority":1}]}]

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images must be dark, high-contrast, preferably with neon lighting to match the aesthetic.
- Crop images into strict rectangles that intersect aggressively with solid black or neon color blocks.
- Overlay giant translucent text directly onto dark areas of full-bleed images.

【图标与装饰】
- Keep icons minimal, flat, and solid white or black to contrast sharply with neon background containers.
- Avoid 3D, gradient, or multi-colored illustrative icons.

【数据页构图】
- Asymmetric split with bottom-left image overlapped by a neon block, contrasting with a giant typographic background on a white canvas.

【图表风格】
- Strictly avoid the 3D, multi-colored generic vector charts seen on page 09.
- If data is needed, use flat, high-contrast geometric blocks (neon on black) with oversized typography.

【章节页构图】
- Left-aligned full-height image cropped aggressively, bleeding watermark text, and a giant numeral intersecting a thin neon tracking line across the page.

【收尾页构图】
- Full-bleed background with central glitched/staggered typography and corner-anchored structural text blocks.

【禁止】
- Do not use light, low-contrast, or soft corporate stock photography.
- Absolutely avoid generic 3D gradient vector graphics that clash with the flat brutalist theme.
- Do not center-align body text; maintain the rigid, asymmetrical grid.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Creative portfolios、Music, streetwear, or entertainment pitches、Edgy marketing campaigns、Event or festival proposals。
