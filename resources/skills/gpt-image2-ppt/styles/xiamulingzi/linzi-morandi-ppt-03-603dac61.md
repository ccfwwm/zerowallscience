# 优雅线条（03）---木七设计 · ppt模板 / linzi-morandi-ppt-03-603dac61

## 风格ID
linzi-morandi-ppt-03-603dac61

## 风格名称
优雅线条（03）---木七设计 · ppt模板 / linzi-morandi-ppt-03-603dac61

## 风格描述
Elegant, minimalist presentation template using a muted Morandi color palette, organic fluid background shapes, delicate line art, and typography masks.

来源说明：本文件只记录抽象视觉规律，不包含原模板图片、插画、图标、照片、logo、水印或原始文案。

## 设计令牌
- colors: Beige (#EBE6E1) acts as the canvas. Muted teal (#416773) serves as the primary structural and typographic accent. Pale gold/tan (#DECAAB, #BFA275) is used for decorative blobs and fine linework.
- fonts: Clean, modern sans-serif. High contrast in typographic scale, mixing super-large display numerals with airy, light-weight body text.
- spacing: Generous negative space with asymmetrical, off-center focal points. Floating elements rather than rigid edge-to-edge constraints.
- shape_language: Contrast between hard-edged rectangular image blocks/masks and soft, fluid organic vector blobs.
- texture: Flat, matte vector backgrounds contrasted with photographic textures (often natural or fabric) masked into specific zones.
- grid: Loose, modular grid characterized by deliberate overlapping of elements and breaking of strict alignments.
- motion_or_depth: 2.5D overlapping depth created by threading thin foreground vector lines over midground image blocks and background solid blobs.

## 基础提示词模板

你是一位资深演示文稿视觉设计师。请生成 16:9 横版幻灯片，并使用「优雅线条（03）---木七设计 · ppt模板 / linzi-morandi-ppt-03-603dac61」风格。只能迁移抽象设计规律，不得复刻任何来源模板页面或素材。

【核心视觉】
- Elegant, minimalist presentation template using a muted Morandi color palette, organic fluid background shapes, delicate line art, and typography masks.
- 推荐配色：#EBE6E1、#416773、#DECAAB、#BFA275

【不可丢失的风格锚点】
- Muted, low-contrast 'Morandi' color tones.
- Organic, asymmetrical fluid background blobs anchored to edges/corners.
- Delicate, continuous overlapping bezier curves (line art) threading through layouts.
- Super-scaled numbers used as image clipping masks for section transitions.
- Offset, thin metallic-toned rectangular wireframes accenting image blocks.

【字体】
- Use clean, lightweight sans-serif for body copy.
- Utilize extreme scale for section numbers, converting them into bold, heavy-weight clipping masks.
- Employ vertical text alignment for elegant structural dividers in multi-column layouts.
- Maintain high line-height in paragraphs to preserve an airy, uncluttered feel.

【封面页构图】
- Central rectangular hero image with offset thin wireframe, flanked by organic blobs in opposite corners and flowing curves.

【内容页构图】
- Large, central background blob framing a text block, accompanied by a smaller, differently-shaped image mask in the top right.

【布局系统】
- Use the source-supported rails and hierarchy as a flexible system, not an exact page copy.
- Route content to distinct archetypes and preserve consistent margins across roles.

【页面类型布局库】
- cover: {"id":"cover-primary","composition":"Central rectangular hero image with offset thin wireframe, flanked by organic blobs in opposite corners and flowing curves.","zones":["Central rectangular hero image with offset thin wireframe, flanked by organic blobs in opposite corners and flowing curves."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["hero","title-subtitle"],"max_items":2},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["minimalist","centered-focus","framed-image"],"avoid":["Bullet points","Detailed introductions","copying source assets, source text, or an exact source arrangement"],"best_for":["Presentation title","Visual hook"],"evidence_pages":["page-00"],"external_image_slots":[{"id":"hero-center","purpose":"Main thematic visual","bbox":[0.33,0.2,0.27,0.65],"priority":1}]}
- section: {"id":"section-primary","composition":"Asymmetrical split with horizontal text banner on the left and a super-scaled image-masked numeral on the right.","zones":["Asymmetrical split with horizontal text banner on the left and a super-scaled image-masked numeral on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["section-divider"],"max_items":2},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["text-mask","asymmetrical","bold-numbers"],"avoid":["Body content","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"number-mask","purpose":"Thematic texture inside section number","bbox":[0.58,0.28,0.3,0.45],"priority":1}]}
- content: [{"id":"content-content","composition":"Large, central background blob framing a text block, accompanied by a smaller, differently-shaped image mask in the top right.","zones":["Large, central background blob framing a text block, accompanied by a smaller, differently-shaped image mask in the top right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["bullets","cards","grid"],"min_items":2,"max_items":6},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["organic-frame","centered-text","blob-mask"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Company introduction","Core philosophy text"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-blob","purpose":"Supplementary visual accent","bbox":[0.65,0.09,0.28,0.32],"priority":1}]},{"id":"content-comparison","composition":"Three-column vertical split: left edge image full bleed, central solid band with vertical text, right zone for paragraph content.","zones":["Three-column vertical split: left edge image full bleed, central solid band with vertical text, right zone for paragraph content."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["comparison","before-after"],"requires":["paired groups"]},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["vertical-split","column-layout","vertical-text"],"avoid":["Wide charts","Horizontal timelines","copying source assets, source text, or an exact source arrangement"],"best_for":["Side-by-side explanations","Culture or value statements"],"evidence_pages":["page-04"],"external_image_slots":[{"id":"left-column-bleed","purpose":"Atmospheric or structural photography","bbox":[0.0,0.0,0.37,1.0],"priority":1}]}]
- data: [{"id":"data-metrics","composition":"Asymmetrical split with horizontal text banner on the left and a super-scaled image-masked numeral on the right.","zones":["Asymmetrical split with horizontal text banner on the left and a super-scaled image-masked numeral on the right."],"content_capacity":{"density":"low","max_items":3},"routing":{"content_shapes":["metrics-series","chart","trend"],"requires":["metrics or series"]},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["text-mask","asymmetrical","bold-numbers"],"avoid":["Body content","Data charts","copying source assets, source text, or an exact source arrangement"],"best_for":["Chapter titles","Section transitions"],"evidence_pages":["page-01"],"external_image_slots":[{"id":"number-mask","purpose":"Thematic texture inside section number","bbox":[0.58,0.28,0.3,0.45],"priority":1}]},{"id":"data-table","composition":"Adapt the source-supported grid into a table or timeline: Large, central background blob framing a text block, accompanied by a smaller, differently-shaped image mask in the top right.","zones":["Large, central background blob framing a text block, accompanied by a smaller, differently-shaped image mask in the top right."],"content_capacity":{"density":"medium","max_items":4},"routing":{"content_shapes":["table","timeline","milestone"],"requires":["table or timeline"]},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["organic-frame","centered-text","blob-mask"],"avoid":["Complex data comparisons","copying source assets, source text, or an exact source arrangement"],"best_for":["Company introduction","Core philosophy text"],"evidence_pages":["page-02"],"external_image_slots":[{"id":"top-right-blob","purpose":"Supplementary visual accent","bbox":[0.65,0.09,0.28,0.32],"priority":1}]}]
- quote: {"id":"quote-primary","composition":"Split focal points: left-aligned text anchored by vertical lines, contrasting with a stark white image block overlapping a vertical colored band on the right.","zones":["Split focal points: left-aligned text anchored by vertical lines, contrasting with a stark white image block overlapping a vertical colored band on the right."],"content_capacity":{"density":"low","max_items":4},"routing":{"content_shapes":["quote","testimonial"],"max_items":2},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["overlapping-blocks","split-focus","threaded-lines"],"avoid":["Long lists","Dense paragraphs","copying source assets, source text, or an exact source arrangement"],"best_for":["Key quotes","Product highlights"],"evidence_pages":["page-03"],"external_image_slots":[{"id":"right-white-block","purpose":"Product or thematic focus","bbox":[0.46,0.37,0.54,0.46],"priority":1}]}
- closing: {"id":"closing-primary","composition":"Centered large typography interacting with an offset, vertically oriented image container framed by a thin metallic stroke, surrounded by corner blobs.","zones":["Centered large typography interacting with an offset, vertically oriented image container framed by a thin metallic stroke, surrounded by corner blobs."],"content_capacity":{"density":"low","max_items":2},"routing":{"content_shapes":["closing","call-to-action","contact"],"max_items":3},"required_identity_anchors":["Muted, low-contrast 'Morandi' color tones.","Organic, asymmetrical fluid background blobs anchored to edges/corners.","Delicate, continuous overlapping bezier curves (line art) threading through layouts."],"optional_variants":["closing","offset-image","framed-center"],"avoid":["Content delivery","copying source assets, source text, or an exact source arrangement"],"best_for":["Closing slide","Q&A intro"],"evidence_pages":["page-09"],"external_image_slots":[{"id":"closing-vertical-image","purpose":"Final visual impression","bbox":[0.19,0.27,0.22,0.48],"priority":1}]}

【内容密度适配】
- low: Use one focal idea and generous whitespace.
- medium: Use two to six concise content groups on the observed grid.
- high: Remove decoration before reducing label size or hierarchy.

【变化与防重复】
- Vary image/text balance and emphasis while preserving anchors, grid, and color ratios.
- Do not repeat the same primary composition or decoration placement on adjacent slides.

【图片处理】
- Images should be masked into either super-scaled typography or clean rectangles.
- When using rectangular images, accent them with slightly offset, thin wireframe borders.
- Favor images with muted colors or natural textures to harmonize with the Morandi palette.

【图标与装饰】
- Minimal or no iconography; rely on typography, line art, and shapes for visual interest rather than standard icons.

【数据页构图】
- Asymmetrical split with horizontal text banner on the left and a super-scaled image-masked numeral on the right.

【图表风格】
- Charts are absent in this sample, but if added, they should use flat styling, thin gridlines, and the template's muted teal and beige color palette.

【章节页构图】
- Asymmetrical split with horizontal text banner on the left and a super-scaled image-masked numeral on the right.

【收尾页构图】
- Centered large typography interacting with an offset, vertically oriented image container framed by a thin metallic stroke, surrounded by corner blobs.

【禁止】
- Do not use highly saturated or neon colors.
- Avoid heavy drop shadows or 3D bevel effects.
- Do not clutter the slide with dense text; preserve the generous negative space.
- Avoid rigid, symmetrical layouts; maintain the organic, asymmetrical balance.
- source text, logos, watermarks, photos, illustrations, icons, or characters
- a uniquely identifiable source-page arrangement
- 禁止出现来源网站 UI、水印、下载提示或模板署名。

## 适用场景
Art and design portfolios、Boutique brand introductions、Minimalist corporate overviews、Lifestyle or fashion presentations。
