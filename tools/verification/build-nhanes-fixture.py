"""Measured editable layouts. Real compilation/export uses dsh-ppt-maker."""
from pathlib import Path
import json, shutil, hashlib, re, html
import fitz
from PIL import ImageFont, Image
ROOT=Path('artifacts/verification/8.3.5/ppt-maker-smoke').resolve()
(ROOT/'assets').mkdir(parents=True,exist_ok=True)
source=Path('C:/codekg/zeroproject/nhanesreview/nhanes_diet_aging.pdf')
shutil.copy2(source,ROOT/'source.pdf');pdf=fitz.open(source)
for p,f in [(3,1),(6,2),(7,3),(8,4)]:
 e=pdf.extract_image(pdf[p-1].get_images(full=True)[0][0]);(ROOT/f'assets/figure-{f}.{e["ext"]}').write_bytes(e['image'])
CITE='Wang et al. Nutrition Journal (2024) 23:112. DOI:10.1186/s12937-024-01017-0'
FONT='Microsoft YaHei';INK='#173F46';TEAL='#17777E';GOLD='#B98645';MUTED='#53696E';PALE='#EFF7F6'
cache={};draw=[];blocks=[];regions=[];chapter=''
def measure(s,size):
 if size not in cache:cache[size]=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',round(size))
 return cache[size].getlength(s)
def wrap(s,w,size):
 lines=[];row=''
 for t in re.findall(r'[A-Za-z0-9][A-Za-z0-9.,%+−–()/-]*|\s+|.',s):
  if row and measure(row+t,size)>w and t not in '，。；：、！？）)]%':lines.append(row.strip());row=t
  else:row+=t
 if row.strip():lines.append(row.strip())
 return lines
def rect(x,y,w,h,c=PALE):draw.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}"/>')
def line(x,y,x2,y2,c='#D3E6E4',w=1):draw.append(f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}"/>')
def txt(s,x,y,w,size=28,c=INK,b=False,track=True):
 lines=wrap(s,w,size);lh=size*1.35
 if (track and y+(len(lines)-1)*lh>682) or x+w>1231:raise ValueError(f'Text outside slide: {s[:35]}')
 draw.append(f'<text font-family="{FONT}" font-size="{size}" font-weight="{700 if b else 400}" fill="{c}">'+''.join(f'<tspan x="{x}" y="{y+i*lh:.2f}">{html.escape(t)}</tspan>' for i,t in enumerate(lines))+'</text>')
 if track:blocks.append(s)
 return y+len(lines)*lh
def section(label,body,x,y,w,size=28):txt(label,x,y,w,29,TEAL,True);return txt(body,x,y+44,w,size,MUTED)
def picture(name,x,y,w,h,opacity=None):
 with Image.open(ROOT/'assets'/name) as im:iw,ih=im.size
 s=min(w/iw,h/ih);pw,ph=iw*s,ih*s;px=x+(w-pw)/2;py=y+(h-ph)/2
 draw.append(f'<image href="assets/{name}" x="{px:.2f}" y="{py:.2f}" width="{pw:.2f}" height="{ph:.2f}"'+('' if opacity is None else f' opacity="{opacity}"')+'/>')
 regions.append({'image':name,'x':px,'y':py,'width':pw,'height':ph,'fit':'contain','opacity':opacity})
def takeaway(s):line(54,622,1226,622);txt(s,54,666,1172,26,INK,True)
def start(title,section_name,n,kicker=None,draw_title=True):
 global draw,blocks,regions,chapter
 chapter=section_name
 draw=['<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">'];blocks=[];regions=[]
 rect(0,0,1280,720,'#FFFFFF')
 # Chapter metadata is for navigation/notes. Visible kickers are opt-in.
 if kicker:txt(kicker,54,39,1100,17,TEAL,True,False)
 if draw_title:txt(title,54,92 if kicker else 84,1172,44,INK,True,False);line(54,122,1226,122)
 txt(f'{n:02d}',1196,704,30,17,MUTED,False,False)
def finish(name,title,layout,pages,ids,extra=''):
 draw.append('</svg>');(ROOT/name).write_text(''.join(draw),encoding='utf8')
 return {'purpose':title,'section':chapter,'text':blocks[:],'assetIds':ids,'layout':layout,'svg':name,'regions':regions[:],'source':CITE,'notes':f'{CITE}\nSource PDF pages: {pages}. Numerical findings verified against the supplied PDF. Cross-sectional associations are not causal effects. Original figures retained independently. Generated image labels explain concepts, with no measured results. {extra}'}
assets=[{'image_path':f'assets/figure-{f}.png','asset_id':f'fig{f}','role':'evidence','source_kind':'literature','source_path':'source.pdf','source_page':p,'source_figure':f'Fig. {f}','citation':CITE,'source_url':'https://doi.org/10.1186/s12937-024-01017-0'} for p,f in [(3,1),(6,2),(7,3),(8,4)]]
assets.append({'image_path':'assets/diet-explanation-labelled.png','asset_id':'art-labels','role':'illustration','source_kind':'generated'})
parent=ROOT/'assets/figure-3.png';im=Image.open(parent)
for name,box in [('rcs-dii-pa',(1500,0,2008,381)),('rcs-dash-pa',(1500,382,2008,762))]:
 out=ROOT/f'assets/{name}.png';im.crop(box).save(out)
 receipt={'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'parentAssetId':'fig3','sourcePath':str(parent),'sourceSha256':hashlib.sha256(parent.read_bytes()).hexdigest(),'operation':'complete-panel-crop','box':box}
 Path(str(out)+'.derivation.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
 assets.append({'image_path':f'assets/{name}.png','asset_id':name,'role':'evidence','source_kind':'derived','parent_asset_id':'fig3'})
parent4=ROOT/'assets/figure-4.png';out4=ROOT/'assets/mediation-dii-pa.png';Image.open(parent4).crop((1500,0,2008,300)).save(out4)
Path(str(out4)+'.derivation.json').write_text(json.dumps({'sha256':hashlib.sha256(out4.read_bytes()).hexdigest(),'parentAssetId':'fig4','sourcePath':str(parent4),'sourceSha256':hashlib.sha256(parent4.read_bytes()).hexdigest(),'operation':'complete-panel-crop','box':[1500,0,2008,300]},indent=2),encoding='utf8')
assets.append({'image_path':'assets/mediation-dii-pa.png','asset_id':'mediation-dii-pa','role':'evidence','source_kind':'derived','parent_asset_id':'fig4'})
for name,box in [('diet-food',(0,150,490,860)),('aging-human',(1090,35,1520,980))]:
 parent=ROOT/'assets/diet-explanation-labelled.png';out=ROOT/f'assets/{name}.png';Image.open(parent).crop(box).save(out)
 Path(str(out)+'.derivation.json').write_text(json.dumps({'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'parentAssetId':'art-labels','sourcePath':str(parent),'sourceSha256':hashlib.sha256(parent.read_bytes()).hexdigest(),'operation':'concept-region-crop','box':box},indent=2),encoding='utf8')
 assets.append({'image_path':f'assets/{name}.png','asset_id':name,'role':'illustration','source_kind':'derived','parent_asset_id':'art-labels'})
(ROOT/'asset-inputs.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf8')
slides=[]
def save(n,title,layout,pages,ids,extra=''):slides.append(finish(f'page-{n:02d}.svg',title,layout,pages,ids,extra))

title='饮食质量与生物衰老';start(title,'NHANES 1999–2018',1,draw_title=False)
txt('饮食质量与',58,166,550,57,INK,True);txt('生物衰老',58,242,550,57,INK,True)
txt('整体饮食模式如何关联临床生物年龄？',62,314,555,28,MUTED);txt('NHANES 1999–2018',62,375,555,27,TEAL,True)
txt('16,666',58,462,330,72,TEAL,True);txt('名美国成人',373,457,240,27,MUTED)
picture('diet-explanation-labelled.png',647,163,575,399);line(58,529,584,529);txt('4 类饮食评分 × 4 类衰老指标',62,580,555,29,INK,True)
takeaway('关联方向 · 剂量反应 · 潜在中介 · 解释边界');save(1,title,'cover',[1,2],['art-labels'])

title='从整体饮食，理解生理系统的变化';start(title,'研究背景',2)
picture('diet-explanation-labelled.png',54,172,612,414)
section('整体模式更接近真实饮食','食物与营养成分共同构成膳食模式。并列评估炎症潜能与健康饮食评分，检验它们是否呈现一致关联。',709,176,508)
section('临床指标补充传统衰老测量','血液生化指标衡量生理失衡与生物年龄，补充端粒和 DNA 甲基化之外的临床视角。',709,344,508)
section('炎症与血脂提供解释线索','SII、AIP 分别反映炎症和血脂，潜在机制仍需纵向研究验证。',709,509,508)
takeaway('关注整体饮食与多维衰老的关联，并检验不同定义的一致性。');save(2,title,'visual-explanation',[2,4],['art-labels'])

title='四类暴露 × 四类结局的分析框架';start(title,'研究问题',3)
txt('饮食模式',76,182,400,32,TEAL,True);txt('临床衰老',774,182,440,32,TEAL,True)
for i,(a,b) in enumerate([('DII｜饮食炎症潜能','HD｜生理稳态失调'),('DASH｜降压饮食模式','AL｜累积生理负荷'),('aMED｜地中海型饮食','KDM｜临床生物年龄'),('HEI-2015｜膳食指南遵循','PA｜表型年龄')]):
 y=210+i*74;rect(65,y,480,61);rect(733,y,485,61);txt(a,85,y+41,444,29);txt(b,752,y+41,448,29)
txt('16 种组合',558,336,174,29,TEAL,True);line(568,360,707,360,TEAL,2);txt('是否一致？',570,402,160,27,MUTED)
section('分析层次','全国成人横断面数据 → 调查加权回归 → 剂量反应 → 分别检验 SII / AIP 中介。人口学、生活方式及疾病因素纳入调整。',68,550,1140,27)
save(3,title,'editable-framework',[2,4],[])

title='从调查样本到完整分析队列';start(title,'样本与筛选',4)
steps=[('101,316','全部调查参与者','NHANES 1999–2018'),('57,540','非妊娠成人','排除妊娠及非成人参与者'),('48,741','能量摄入符合范围','男性 800–4,200；女性 500–3,500 kcal/日'),('35,367','衰老指标信息完整','满足临床生物年龄计算要求'),('16,666','最终分析样本','同时具备完整饮食评分信息')]
for i,(num,label,detail) in enumerate(steps):
 y=166+i*83;rect(57,y,690,71,PALE if i==4 else '#F7FAFA');txt(num,73,y+42,193,36,TEAL,True);txt(label,279,y+28,456,27,INK,True);txt(detail,279,y+57,457,21,MUTED)
picture('figure-1.png',796,159,420,442)
takeaway('完整数据筛选提高可计算性，也可能引入选择偏倚；纳入人数不等于加权总体。');save(4,title,'sample-flow',[2,3],['fig1'])

title='四种饮食评分的含义与方向';start(title,'饮食测量',5)
picture('diet-food.png',76,157,406,375);txt('24 小时膳食回顾',70,560,439,30,TEAL,True);txt('两次非连续记录',70,601,439,26,MUTED)
items=[('DII ↑','促炎潜能更强','高分表示更强的饮食促炎倾向。'),('DASH ↑','更接近降压饮食','强调果蔬、全谷和低脂乳，减少钠及含糖饮料。'),('aMED ↑','地中海型特征更多','结合九类成分，衡量地中海型模式的遵循程度。'),('HEI-2015 ↑','指南遵循更好','评估饮食与美国膳食指南的一致性。')]
for i,(a,b,c) in enumerate(items):
 y=177+i*109;txt(a,557,y,193,30,TEAL,True);txt(b,765,y,451,27,INK,True);txt(c,557,y+43,659,27,MUTED)
takeaway('DII 与后三种评分的健康方向相反，短期回顾未必代表长期习惯。');save(5,title,'diet-comparison',[2,3],['diet-food'])

title='四类临床指标衡量不同的衰老维度';start(title,'结局定义',6)
txt('指标',67,178,170,25,TEAL,True);txt('测量视角',255,178,665,25,TEAL,True);txt('加速衰老的分类',964,178,250,25,TEAL,True)
rows=[('HD','生理稳态失调','以 Mahalanobis 距离衡量临床指标偏离年轻健康参考人群的程度。','高于中位数'),('AL','累积生理负荷','计算处于风险区间的生物标志物比例，衡量多系统累积失衡。','高于中位数'),('KDM','临床生物年龄','根据标志物与实际年龄的关联估计生物年龄，关注年龄相关变化。','超过实际年龄'),('PA','表型年龄','根据与死亡风险相关的临床指标建模，反映综合生理状态。','超过实际年龄')]
for i,(a,b,c,d) in enumerate(rows):
 y=201+i*95;rect(55,y,1170,94,PALE if i%2==0 else '#FFFFFF');txt(a,70,y+39,167,35,TEAL,True);txt(b,255,y+28,665,27,INK,True);txt(c,255,y+61,665,23,MUTED);txt(d,964,y+49,250,26)
takeaway('使用 12 种血液化学参数；HD、AL 二分会损失信息，四种结局不能完全互换。');save(6,title,'definition-rows',[3,4],[])

title='从全国调查设计到模型解释';start(title,'统计方法',7)
for x,num,label,body in [(58,'01','调查加权','考虑抽样权重、分层和聚类，连续变量报告均值及 95% CI，分类变量报告人数和比例。'),(463,'02','多变量回归','logistic 回归估计加速衰老 OR，以最低饮食分组为参照；区分未调整比较与调整后估计。'),(868,'03','关系形状与中介','RCS 检验剂量反应形状；SII 与 AIP 分别进入中介分析，不设定二者为串联通路。')]:
 txt(num,x,201,350,53,GOLD,True);txt(label,x,256,352,31,TEAL,True);txt(body,x,305,350,28,MUTED)
line(55,448,1225,448)
section('混杂控制','年龄、性别、种族、调查年份、BMI、吸烟、运动、教育、收入及慢病因素；DASH 和 HEI-2015 模型还调整饮酒。部分分类协变量缺失使用缺失指示类别。',63,496,1150)
takeaway('调整可以减少部分混杂；OR、中介比例与曲线形状仍依赖测量和模型假设。');save(7,title,'methods-sequence',[4,6,7],[])

title='饮食分组伴随生活方式差异';start(title,'基线特征',8)
txt('DII 最低组与最高组',61,183,720,29,TEAL,True)
section('高 DII 组','BMI 更高，规律运动和大学教育比例更低；这些差异并非随机分配造成。',829,191,378)
section('为何需要调整','饮食质量与社会经济、健康行为同时变化。直接比较两组，可能混合饮食关联和其他因素影响。',829,380,378)
txt('均值与比例分别报告，不能把基线差异直接视为饮食效应。',65,566,1135,28,MUTED)
takeaway('多变量调整是解释结果的必要步骤，仍需保留残余混杂与选择偏倚的边界。');save(8,title,'native-table-insight',[4,5],[])

title='促炎饮食潜能与较高加速衰老 OR 相关';start(title,'主要结果 · DII',9)
txt('1.61',833,240,371,79,TEAL,True);txt('PA：95% CI 1.39–1.87',834,289,375,26,MUTED)
section('四种结局方向一致','最高组相对最低组：HD 1.25、AL 1.29、KDM 1.34、PA 1.61；四个置信区间均未跨越 1。',831,358,385)
txt('95% CI：HD 1.08–1.45；AL 1.11–1.50',62,559,733,25,MUTED);txt('KDM 1.08–1.65；PA 1.39–1.87',62,597,733,25,MUTED)
takeaway('这里的 OR 不是年龄增加几年，也不等同风险比，更不能直接解释为干预收益。');save(9,title,'native-chart-result',[1,6],[])

title='健康饮食评分整体关联较低的 OR';start(title,'主要结果 · 健康饮食',10)
txt('最高组相对最低组：调整后 OR（95% CI）',60,175,1135,28,TEAL,True)
txt('PA：DASH 0.50 · aMED 0.64 · HEI-2015 0.51',61,578,1143,29,TEAL,True)
takeaway('aMED–HD 的置信区间跨越 1；评分尺度不同，不能仅按 OR 大小判断哪种饮食最优。');save(10,title,'native-evidence-table',[1,6],[])

title='剂量反应：同时看方向、形状与不确定性';start(title,'RCS 分析',11)
txt('DII 与 PA',65,176,533,30,TEAL,True);txt('DASH 与 PA',675,176,538,30,TEAL,True)
picture('rcs-dii-pa.png',55,191,558,343);picture('rcs-dash-pa.png',665,191,558,343)
txt('高 DII 区间 OR 上升；非线性 P < 0.001。',64,576,550,26,MUTED);txt('较高 DASH 对应较低 OR；非线性 P = 0.031。',674,576,550,26,MUTED)
takeaway('灰带为 95% CI；尾部更不确定，不能任意推出最佳阈值或安全区间。');save(11,title,'dual-evidence-panels',[6,7],['rcs-dii-pa','rcs-dash-pa'],'Selected complete PA panels from Fig.3, DII row1 and DASH row2. Axes, CI, reference lines and p values preserved. Full 16-panel parent retained.')

title='炎症与血脂：两条潜在中介线索';start(title,'机制与解释',12)
picture('mediation-dii-pa.png',52,175,641,355);picture('diet-explanation-labelled.png',732,166,494,340)
txt('SII = 血小板 × 中性粒细胞 / 淋巴细胞',57,566,670,25,TEAL,True);txt('AIP = log10（TG / HDL-C），单位 mmol/L',734,554,490,24,TEAL,True)
takeaway('SII 与 AIP 分别建模；横断面中介分析无法确立“饮食 → 中介 → 衰老”的时间顺序。');save(12,title,'evidence-plus-labelled-image',[4,7,8],['mediation-dii-pa','art-labels'],'Complete DII–PA panel selected from Fig4. Coefficients and annotations preserved; full parent retained. No invented mediation percentages or serial SII→AIP pathway.')

title='解释边界决定结论的力度';start(title,'研究局限',13)
cols=[('01','时间顺序','横断面测量不能区分饮食影响衰老，还是健康状态反过来改变饮食。两次短期回顾也可能遗漏长期习惯。','需要重复测量与纵向随访。'),('02','测量与筛选','补充剂详细成分未计入评分；HD、AL 二分降低信息精度。完整数据要求和协变量缺失限制可推广性。','需要测量误差和选择敏感性分析。'),('03','混杂与比较','评分之间相关，不能断言具体模式优越。分层差异不构成补充剂推荐证据；未测量因素仍可能影响关联。','需要更明确的干预设计。')]
for i,(a,b,c,d) in enumerate(cols):
 x=59+i*405;txt(a,x,215,355,67,GOLD,True);txt(b,x,285,353,35,TEAL,True);txt(c,x,341,352,29,MUTED);txt(d,x,553,352,28,INK,True)
takeaway('关联证据支持进一步研究，不能直接转写为“抗衰老疗效”。');save(13,title,'limits-columns',[9,10],[])

title='整体饮食与多维生物衰老存在关联';start(title,'结论与下一步',14)
section('方向','DII 较高关联更高的加速衰老 OR；DASH、aMED、HEI-2015 较高总体关联较低 OR，但存在指标组合例外。',59,195,580)
section('机制线索','SII 和 AIP 提供潜在机制线索；多种指标的共同证据值得进一步验证。',59,353,580)
section('下一步','用纵向随访、重复测量和干预设计，验证饮食与长期衰老轨迹的联系。',59,502,580)
picture('aging-human.png',762,157,400,440)
takeaway('健康饮食是值得研究的方向，研究结论需保留置信区间与因果边界。');save(14,title,'conclusion-visual',[1,9,10],['aging-human'])
spec={'width':1280,'height':720,'designIntent':{'template':'content-led academic report','sectionKickers':False,'userRequirements':['formal content only','readable Chinese image labels','rich content and joint image/text layout'],'defaultsAreGuidance':True},'fonts':{'family':FONT,'titlePt':33,'bodyPt':21,'captionPt':15.75},'palette':{'background':'#FFFFFF','ink':INK,'teal':TEAL,'accent':GOLD},'slides':slides}
(ROOT/'presentation-spec.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf8')
start('四种饮食评分与加速衰老的关联','主要结果',1)
picture('figure-2.png',49,148,845,462);txt('DII 最高组',930,190,287,29,TEAL,True);txt('1.61',930,283,287,75,INK,True);txt('PA：1.39–1.87',930,325,287,25,MUTED)
section('整体趋势','促炎潜能较高关联较高 OR；健康饮食评分总体关联较低 OR。',930,399,287,27)
takeaway('最高组相对最低组；aMED–HD 的区间跨越 1，观察性关联不等于干预效果。')
p1=finish('pilot-01.svg','四种饮食评分与加速衰老的关联','evidence-reading',[6],['fig2'])
start('炎症与血脂：两条潜在中介线索','机制与解释',2)
picture('mediation-dii-pa.png',52,175,641,355);picture('diet-explanation-labelled.png',732,166,494,340,0.82)
txt('SII = 血小板 × 中性粒细胞 / 淋巴细胞',57,566,670,25,TEAL,True);txt('AIP = log10（TG / HDL-C）',734,554,490,26,TEAL,True)
takeaway('SII 与 AIP 分别建模；横断面中介分析无法确立因果时间顺序。')
p2=finish('pilot-02.svg','炎症与血脂：两条潜在中介线索','dual-image-alpha',[4,8],['mediation-dii-pa','art-labels'],'Complete DII–PA panel from Fig4; full parent retained. Generated image opacity .82 baked into alpha PNG for preview/export agreement.')
(ROOT/'pilot-spec.json').write_text(json.dumps({**spec,'slides':[p1,p2]},ensure_ascii=False,indent=2),encoding='utf8')
rows=['# Citation receipts',f'Source: {CITE}',f'PDF SHA-256: {hashlib.sha256(source.read_bytes()).hexdigest()}','Attribution and image explanations are in speaker notes, not report canvas.','| Slide | Claim | Verdict | Evidence |','|---|---|---|---|']
for i,s in enumerate(slides,1):rows.append(f'| {i} | {s["purpose"]} | VALID | Supplied PDF; exact pages recorded in notes. |')
rows+=['ADJUST: aMED–HD 0.88 (0.74–1.04) is not significant.','ADJUST: SII/AIP are separate potential mediators, not a verified serial pathway.','ADJUST: Table1 caption says quintiles but displays Q1–Q4; use four groups.','ADJUST: Fig3 DASH–PA P-nonlinearity = .031; use the exact figure value.','All original figures retained. Selected complete Fig3 panels preserve axes, intervals, reference lines and p values.','No unavailable supplementary estimates or generated experimental values used.']
(ROOT/'RECEIPTS.md').write_text('\n'.join(rows),encoding='utf8')
print(json.dumps({'root':str(ROOT),'slides':len(slides),'bodyCharacters':[sum(len(t) for t in s['text']) for s in slides]},ensure_ascii=False))
