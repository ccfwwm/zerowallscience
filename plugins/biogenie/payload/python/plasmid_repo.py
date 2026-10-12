"""dsh-bio-genie — Addgene 质粒库检索（公开目录页解析）

背景（2026-09-16 调研）：合成生物学下游设计（bio_plasmid_map / bio_clone_simulate /
bio_assembly_design）需要"找现成质粒"这一上游步骤，此前插件无覆盖。
Addgene 官方 JSON API（developers.addgene.org）需审批 + 令牌（承诺 5 工作日），
不符合零摩擦承诺；而公开目录页无需登录即可检索与读取元数据（实测 2026-09-16）。

能力边界（写进工具描述，避免 agent 过度承诺）：
  - ✅ 检索质粒、读取公开元数据（用途/沉积者/抗性/拷贝数/插入片段/启动子/文献…）
  - ❌ 不下载质粒序列——Addgene 序列访问现已要求登录（/users/login/?next=/<id>/sequences/），
       或走官方 API 令牌。本模块遇到序列请求会明确报错并指路，绝不返回占位/空序列。

解析纪律（防"下一个 bach-biotools"）：
  1. 端点集中常量区，页面改版单点修复。
  2. 解析失败必须响亮失败：页面自报 N 条结果却解析出 0 条 → raise（绝不静默返回空，
     空列表只允许代表"Addgene 确实没有匹配"）。
  3. 不猜测字段：只提取页面上带 field-label 的字段，缺失就是缺失。
"""

import html
import re
import urllib.parse
import urllib.request

BASE = 'https://www.addgene.org'
SEARCH_PATH = '/search/catalog/plasmids/'

# 礼貌抓取：声明来源与联系方式（Addgene 无 robots 限制此路径，但保持节制；
# 调用频率由 TS 层 throttle.js 的 addgene 通道控制）
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36 '
      '(+dsh-bio-genie; contact: dsh-bio-genie@users.noreply.github.com)')

MAX_LIMIT = 50
# Addgene 目录页只接受这些 page_size；其它值被静默忽略回落到 20（实测 2026-09-16）
PAGE_SIZE_CHOICES = (10, 20, 30, 40, 50)
SORT_CHOICES = {
    'relevance': None,          # Addgene 默认（相关度）
    'newest': 'newest',
    'oldest': 'oldest',
    'alpha_asc': 'alpha_asc',
    'alpha_desc': 'alpha_desc',
}


class AddgeneStructureError(RuntimeError):
    """页面结构变化导致解析失败——必须响亮失败，不得静默降级为空结果。"""


def _fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f'Addgene 返回 HTTP {resp.status}: {url}')
        return resp.read().decode('utf-8', errors='replace')


def _text(fragment):
    """HTML 片段 → 纯文本（去标签、解实体、压空白与换行）。

    换行也压平：详情页里 "Backbone size\\n w/o insert\\n (bp)" 这类标签折行会
    污染字段名，规整后才是可用键。
    """
    s = re.sub(r'<br\s*/?>', ' ', fragment or '')
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()


def _labeled_fields(block):
    """抽取 `<span class="field-label">Label</span> ... </div> <div ...>value</div>` 对。

    这是 Addgene 结果条目与详情页共用的结构：左右两列，左列 field-label，右列取值。
    同时返回第一个 'result-item-category'（Plasmid / Viral Prep…）。
    """
    fields = {}
    # 字段行：label 容器 + 紧随其后的取值容器
    pattern = re.compile(
        r'<span class="field-label[^"]*">\s*([^<]+?)\s*</span>\s*</div>\s*'
        r'<div[^>]*>(.*?)</div>',
        re.S,
    )
    for label, raw in pattern.findall(block):
        key = _text(label)
        val = _text(raw)
        if not key:
            continue
        if key in fields and fields[key]:
            continue  # 保留首个非空值
        fields[key] = val
    return fields


def _parse_result_items(page):
    """解析搜索结果条目：<li class="list-group-item"> ... id="Plasmids-<id>" ..."""
    items = []
    # 以 search-result-item 容器切块（每块一个质粒）
    blocks = re.split(r'<div id="((?:Plasmids|ViralPreps|Antibodies)-[^"]+)" class="search-result-item"',
                      page)
    # blocks = [前导, id1, body1, id2, body2, ...]
    for i in range(1, len(blocks) - 1, 2):
        raw_id = blocks[i]
        body = blocks[i + 1]
        cat, _, num = raw_id.partition('-')
        # 名称：容器内第一个指向 /<数字>/ 的链接
        name = ''
        m = re.search(r'<a href="/(\d+)/"[^>]*>(.*?)</a>', body, re.S)
        if m:
            name = _text(m.group(2))
        fields = _labeled_fields(body)
        # 热门度火焰标记（Addgene 自有指标）
        flame = ''
        fm = re.search(r'addgene-flame-(high|medium|low)', body)
        if fm:
            flame = fm.group(1)
        items.append({
            'addgene_id': num,
            'name': name,
            'category': cat,
            'purpose': fields.get('Purpose', ''),
            'depositor': fields.get('Depositor', ''),
            'publication': fields.get('Publication', ''),
            'insert': fields.get('Insert', ''),
            'use': fields.get('Use', ''),
            'popularity': flame,
            'url': f'{BASE}/{num}/',
        })
    return items


def _parse_total(page):
    """读取页面自报的结果总数；未出现则返回 None。"""
    m = re.search(r'We narrowed to\s+([\d,]+)\s+results', page)
    if m:
        return int(m.group(1).replace(',', ''))
    m = re.search(r'Showing:\s*[\d,]+\s*-\s*[\d,]+\s*of\s+([\d,]+)\s+results', page)
    if m:
        return int(m.group(1).replace(',', ''))
    if re.search(r'no results|We narrowed to\s+0\s+results', page, re.I):
        return 0
    return None


# ---------------------------------------------------------------- ops

def op_plasmid_search(args):
    """Addgene 质粒检索（公开目录页）。

    args:
      query (str, 必填): 关键词，如 'CRISPR Cas9'、'lentiCRISPR'、'GFP reporter'
      limit (int): 返回条数，默认 20，上限 50
      sort (str): relevance | newest | oldest | alpha_asc | alpha_desc
    """
    query = (args.get('query') or '').strip()
    if not query:
        raise ValueError('query 不能为空（例如 "CRISPR Cas9"、"lentiviral GFP"）')
    limit = int(args.get('limit', 20))
    limit = max(1, min(limit, MAX_LIMIT))
    # page_size 必须是 Addgene 白名单值，否则按最小覆盖值请求后本地裁剪
    page_size = next(s for s in PAGE_SIZE_CHOICES if s >= limit)
    sort = (args.get('sort') or 'relevance').strip()
    if sort not in SORT_CHOICES:
        raise ValueError(f'sort 必须是 {sorted(SORT_CHOICES)} 之一，收到 {sort!r}')

    params = {'q': query, 'page_size': page_size}
    if SORT_CHOICES[sort]:
        params['sort_by'] = SORT_CHOICES[sort]
    url = f'{BASE}{SEARCH_PATH}?{urllib.parse.urlencode(params)}'

    page = _fetch(url)
    total = _parse_total(page)
    items = _parse_result_items(page)

    # 响亮失败：页面自报有结果，我们却一条没解析出来 → 结构已变，必须报错而非返回空
    if total and not items:
        raise AddgeneStructureError(
            f'Addgene 页面自报 {total} 条结果但解析出 0 条——目录页结构可能已改版。'
            f'请勿使用空结果做结论；报告此问题（源文件 python/plasmid_repo.py，'
            f'URL: {url}）')
    items = items[:limit]

    return {
        'source': 'Addgene (addgene.org) 公开目录页',
        'query': query,
        'sort': sort,
        'total_matches': total,
        'returned': len(items),
        'truncated': bool(total and total > len(items)),
        'url': url,
        'results': items,
        'note': ('检索与公开元数据来自 Addgene 目录页实时抓取。'
                 '质粒序列需登录 Addgene 或申请官方 API 令牌后自行获取，'
                 '本工具不提供序列。引用质粒时请注明 Addgene ID。'),
    }


def _parse_detail_fields(page):
    """解析质粒详情页的字段列表（两种变体并存，实测 2026-09-16）。

    变体 A：`<li class="field"><div|span class="field-label">L</…> 值文本 </li>`
    变体 B：`<div class="field"><div class="field-label">L</div>
             <div class="field-content">值</div></div>`   ← Purpose / Addgene Notes 等

    页面按 <h2> 分节（Vector Information / Growth in Bacteria / Gene/Insert …），
    标签可能重名，因此同时返回分节结构避免同名覆盖。
    """
    fields = {}
    sections = {}
    current = ''

    # 按顺序切出 h2 与 field-label 两类锚点，逐段判定
    anchor = re.compile(
        r'<h2[^>]*>(?P<h2>.*?)</h2>'
        r'|<(?:div|span)\s+class="field-label[^"]*"\s*>(?P<label>.*?)</(?:div|span)>',
        re.S)
    hits = list(anchor.finditer(page))
    for idx, m in enumerate(hits):
        if m.group('h2') is not None:
            current = _text(m.group('h2'))
            sections.setdefault(current, {})
            continue

        label = _text(m.group('label'))
        if not label:
            continue

        # 取值窗口：本 label 结束 → 下一个锚点（label/h2）或容器边界
        start = m.end()
        end = hits[idx + 1].start() if idx + 1 < len(hits) else len(page)
        window = page[start:end]

        value = ''
        # 变体 B：紧随 field-content 容器
        cm = re.match(r'\s*<div\s+class="field-content"[^>]*>(.*?)</div>', window, re.S)
        if cm:
            value = _text(cm.group(1))
        else:
            # 变体 A：直接文本，裁到容器闭合处
            cut = re.search(r'</li>|</ul>|</section>|<li\b|<h2\b', window)
            raw = window[:cut.start()] if cut else window
            value = _text(raw)

        fields.setdefault(label, value)
        sections.setdefault(current, {})[label] = value

    sections = {k: v for k, v in sections.items() if v}
    return fields, sections


def op_plasmid_info(args):
    """按 Addgene ID 取质粒完整公开元数据。"""
    pid = str(args.get('plasmid_id', '')).strip()
    if not re.fullmatch(r'\d+', pid):
        raise ValueError('plasmid_id 必须是 Addgene 数字 ID（如 52961），'
                         '可用 bio_plasmid_search 检索获得')
    url = f'{BASE}/{pid}/'
    page = _fetch(url)

    title = ''
    m = re.search(r'<title>(.*?)</title>', page, re.S)
    if m:
        title = _text(m.group(1)).replace('Addgene:', '').strip()

    fields, sections = _parse_detail_fields(page)
    if not fields:
        raise AddgeneStructureError(
            f'Addgene 质粒页 {url} 解析出 0 个字段——详情页结构可能已改版。'
            f'请勿据此判断质粒无信息；报告此问题（python/plasmid_repo.py）')

    # 描述（meta description 含插入片段/抗性/文献，作为摘要兜底）
    desc = ''
    m = re.search(r'<meta name="description" content="(.*?)"', page, re.S)
    if m:
        desc = html.unescape(m.group(1)).strip()

    # 序列可用性：真实探测 /<id>/sequences/ 子页（详情页本身不含下载入口，
    # 门槛信息只存在于子页——实测 2026-09-16 详情页无任何 .gb/.dna 链接）。
    seq_page = f'{BASE}/{pid}/sequences/'
    seq_info = {
        'sequences_page': seq_page,
        'download_available_here': False,
        'login_required': None,
        'how_to_get': ('Addgene 序列下载需登录账号后在其质粒页获取，'
                       '或申请官方 API 令牌（developers.addgene.org，承诺 5 个工作日）。'),
    }
    try:
        spage = _fetch(seq_page)
        seq_info['login_required'] = bool(
            re.search(r'/users/login/\?next=[^"]*sequences', spage))
        seq_info['sequence_viewer_ids'] = sorted(set(re.findall(r'/browse/sequence/(\d+)/', spage)))
    except Exception as e:  # 子页探测失败不影响主元数据
        seq_info['probe_error'] = f'{type(e).__name__}: {e}'

    return {
        'source': 'Addgene (addgene.org) 质粒详情页',
        'addgene_id': pid,
        'name': title,
        'url': url,
        'description': desc,
        'fields': fields,
        'sections': sections,
        'sequence_access': seq_info,
        'note': '元数据实时抓取自 Addgene 页面；引用质粒请注明 Addgene ID。',
    }
