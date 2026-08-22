# 莫兰迪风格PPT (8) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-8-a694ca1e

## 风格ID
linzi-morandi-2-21-35-ppt-ppt-8-a694ca1e

## 风格名称
莫兰迪风格PPT (8) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-8-a694ca1e

## 风格描述
A minimalist, artistic presentation theme featuring fluid organic shapes, muted warm earth tones, and wide-tracked elegant typography.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Light beige backgrounds with contrasting warm brown and soft taupe for primary shapes and text; low overall contrast.
- fonts: Clean, geometric sans-serif; high letter-spacing for headers, standard readable sans for body copy.
- spacing: Generous margins, high reliance on negative space to create a light, airy feel.
- shape_language: Predominantly organic, asymmetrical blobs combined with perfect circles; minimal use of sharp corners.
- texture: Mostly flat vector colors, with occasional subtle grain or thin line-art overlays.
- grid: Loose, asymmetrical framing relying on background shapes rather than strict rigid column grids.
- motion_or_depth: Completely flat design with overlapping 2D layers; no drop shadows or gradients.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「莫兰迪风格PPT (8) 关于一切设计 · ppt模板文件 / linzi-morandi-2-21-35-ppt-ppt-8-a694ca1e」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- A minimalist, artistic presentation theme featuring fluid organic shapes, muted warm earth tones, and wide-tracked elegant typography.
- 推荐配色：#EAE6DA、#855C41、#B3A293、#D5BCAD、#D5CCBF

【不可丢失的风格锚点】
- Fluid, overlapping organic vector background shapes
- Muted, low-contrast earth-tone color palette
- Delicate, scattered dashed line 'confetti' accents
- Wide-tracked, all-caps geometric sans-serif headings
- Circular framing for focal elements and image masks

【字体】
- Headers are all-caps with significant letter-spacing
- Body text is lowercase or sentence case, highly legible, typically in a lighter brown or taupe
- Numbers in lists are oversized and centered within circular containers

【封面页构图】
- Central oversized white circle overlapping organic corner blobs, scattered dash accents.

【内容页构图】
- Three large circular numerical anchors arranged horizontally above corresponding text blocks.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central oversized white circle overlapping organic corner blobs, scattered dash accents.","zones":["Central oversized white circle overlapping organic corner blobs, scattered dash accents."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["minimal-cover","organic-frame","centered-title"],"avoid":["Detailed content","Data visualization","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation titles","Section breaks"],"evidence_pages":["page-00"],"external_image_slots":[]}
- section: {"id":"section-primary","composition":"Minimalist layout with a small central circle containing grid-aligned text, crossed by thin curved lines.","zones":["Minimalist layout with a small central circle containing grid-aligned text, crossed by thin curved lines."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["transition","typographic-art","minimalist-lines"],"avoid":["Detailed explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Section transitions","Chapter titles","Pauses in narrative"],"evidence_pages":["page-06"],"external_image_slots":[]}
- content: [{"id":"content-content","composition":"Three large circular numerical anchors arranged horizontally above corresponding text blocks.","zones":["Three large circular numerical anchors arranged horizontally above corresponding text blocks."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["three-columns","numbered-list","icon-replacements"],"avoid":["Long text paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Three-step processes","Core values"],"evidence_pages":["page-01"],"external_image_slots":[]},{"id":"content-comparison","composition":"Left-aligned text block balanced by a large circular image mask on the right, framed by corner shapes.","zones":["Left-aligned text block balanced by a large circular image mask on the right, framed by corner shapes."],"content_capacity":{"density":"medium","max_items":2},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["text-and-image","circular-mask","split-layout"],"avoid":["Heavy data","Multi-step flows","copying source assets, source text, or an exact source arrangement"],"best_for":["Product feature highlights","Team member bios","Quote with portrait"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"right-circle-image","purpose":"Subject portrait or product highlight","bbox":[0.63,0.27,0.27,0.48],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Flat, multi-series column chart overlaid on a muted, faint area chart background.","zones":["Flat, multi-series column chart overlaid on a muted, faint area chart background."],"content_capacity":{"density":"high","max_items":1},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["combo-chart","minimal-data","no-gridlines"],"avoid":["Text heavy explanations","copying source assets, source text, or an exact source arrangement"],"best_for":["Trend analysis","Monthly performance data","Comparative metrics"],"evidence_pages":["page-08"],"external_image_slots":[]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Three large circular numerical anchors arranged horizontally above corresponding text blocks.","zones":["Three large circular numerical anchors arranged horizontally above corresponding text blocks."],"content_capacity":{"density":"medium","max_items":3},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["three-columns","numbered-list","icon-replacements"],"avoid":["Long text paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key takeaways","Three-step processes","Core values"],"evidence_pages":["page-01"],"external_image_slots":[]}]
- closing: {"id":"closing-primary","composition":"Centered floating text over an asymmetrical organic background framing the corners.","zones":["Centered floating text over an asymmetrical organic background framing the corners."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Fluid, overlapping organic vector background shapes","Muted, low-contrast earth-tone color palette","Delicate, scattered dashed line 'confetti' accents"],"optional_variants":["closing","organic-frame","centered-text"],"avoid":["Body content","copying source assets, source text, or an exact source arrangement"],"best_for":["Thank you slides","Final contact info","End of presentation"],"evidence_pages":["page-09"],"external_image_slots":[]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images are heavily masked into perfect circles
- Occasional use of standard rectangular images, but always overlapping horizontal color bands to break the grid

【图标与装饰】
- Extremely minimal; relies more on abstract shape clusters and thin decorative line strokes than literal icons

【数据页构图】
- Flat, multi-series column chart overlaid on a muted, faint area chart background.

【图表风格】
- Flat, 2D charts with muted colors matching the palette
- Combination of bar charts and faint area charts behind them for depth without 3D effects
- No visible gridlines, minimalist axes

【章节页构图】
- Minimalist layout with a small central circle containing grid-aligned text, crossed by thin curved lines.

【收尾页构图】
- Centered floating text over an asymmetrical organic background framing the corners.

【禁止】
- Avoid high-contrast primary colors; stick strictly to the muted earth-tone palette
- Avoid drop shadows or 3D effects; maintain the flat, vector-cutout aesthetic
- Do not use overly complex or literal icons; favor abstract geometry and typography
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Artistic portfolios or lookbooks、Lifestyle, fashion, or wellness brand decks、Modern, minimalist corporate reports requiring a softer touch、Social media style 'carousel' presentations。
