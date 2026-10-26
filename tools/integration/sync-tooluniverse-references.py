"""Build a remote-only scientific navigation index from a pinned upstream tree.

No upstream installation, SDK execution, publishing or shared-computer commands
are copied. Scientific descriptions and phase headings remain source-attributed;
exact tool candidates are cross-referenced against the pinned SDK definitions.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.request
import zipfile

COMMIT = '169d065deeb3e289b3ff36d665529a123bdad791'
ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'resources/extensions/skills/zerowall-tooluniverse'
EXCLUDE = {'setup-tooluniverse', 'tooluniverse', 'tooluniverse-connect', 'tooluniverse-sdk', 'tooluniverse-custom-tool', 'tooluniverse-publish-tool', 'tooluniverse-install-skills', 'tooluniverse-share-computer', 'tooluniverse-use-shared-computer', 'tooluniverse-database-logins', 'tooluniverse-claude-code-plugin', 'tooluniverse-antigravity-plugin', 'tooluniverse-gemini-cli', 'tooluniverse-opencode', 'tooluniverse-mcp'}
DOMAINS = ['literature', 'genes-proteins', 'drugs-chemistry', 'disease-clinical', 'data-computing']

def fetch(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read()

def domain(name):
    if re.search('literature|peer-review|fact-lookup|funding|scientific-problem|self-review', name): return 'literature'
    if re.search('drug|chemic|admet|pharma|compound|molecule|toxic|binder|binding|peptide|antibody|product-safety|organic|lipid|natural-product', name): return 'drugs-chemistry'
    if re.search('disease|clinical|cancer|oncology|medicine|patient|adverse|risk-scor|vaccine|immun|infection|nutrition', name): return 'disease-clinical'
    if re.search('gene|genom|protein|variant|sequence|crispr|gwas|rna|pathway|molecular|phylo|hla|regulatory|residue|lof|primer', name): return 'genes-proteins'
    return 'data-computing'

def build(path, known, cache):
    name = path.split('/')[2]
    cached = cache / (name + '.md')
    if not cached.is_file(): cached.write_bytes(fetch(f'https://raw.githubusercontent.com/mims-harvard/ToolUniverse/{COMMIT}/{path}'))
    raw = cached.read_bytes(); text = raw.decode('utf-8')
    description = re.search(r'^description:\s*(.*?)(?=\n[A-Za-z_][A-Za-z_-]*:|\n---)', text, re.M | re.S)
    summary = re.sub(r'\s+', ' ', description.group(1)).strip(' >|"\'')[:1800] if description else name
    prose = re.sub(r'```[^\n]*\n[\s\S]*?```', '', text)
    headings = [m.group(1).strip() for m in re.finditer(r'^#{2,4}\s+(.+)$', prose, re.M)]
    headings = [h for h in headings if not re.search(r'install|setup|prerequis|sdk|python|reference|tool reference|troubleshoot|file structure|quick start|configuration|cheat|related skill', h, re.I)][:24]
    tools = sorted({token for token in re.findall(r'\b[A-Za-z][A-Za-z0-9_]{5,150}\b', text) if token in known})
    return {'id': name, 'domain': domain(name), 'description': summary, 'phases': headings, 'candidate_tools': tools, 'source': f'https://github.com/mims-harvard/ToolUniverse/blob/{COMMIT}/{path}', 'source_sha256': hashlib.sha256(raw).hexdigest()}

def main():
    wheel = Path(sys.argv[1])
    cache = ROOT / 'artifacts/cache/tooluniverse-upstream' / COMMIT
    cache.mkdir(parents=True, exist_ok=True)
    treefile = cache / 'tree.json'
    if not treefile.is_file(): treefile.write_bytes(fetch(f'https://api.github.com/repos/mims-harvard/ToolUniverse/git/trees/{COMMIT}?recursive=1'))
    tree = json.loads(treefile.read_bytes())['tree']
    paths = [item['path'] for item in tree if item['path'].startswith('plugin/skills/') and item['path'].endswith('/SKILL.md')]
    known = set()
    with zipfile.ZipFile(wheel) as archive:
        for path in archive.namelist():
            if '/data/' not in path or not path.endswith('.json') or '/broken_apis/' in path: continue
            try: definitions = json.loads(archive.read(path))
            except (ValueError, UnicodeError): continue
            if isinstance(definitions, list): known.update(t['name'] for t in definitions if isinstance(t, dict) and isinstance(t.get('name'), str))
    included = [path for path in paths if path.split('/')[2] not in EXCLUDE]
    with ThreadPoolExecutor(max_workers=6) as pool: entries = list(pool.map(lambda p: build(p, known, cache), included))
    output = DEST / 'references/upstream'; output.mkdir(parents=True, exist_ok=True)
    for item in entries:
        name = item['id']; query = name.removeprefix('tooluniverse-').replace('-', ' ')
        text = f'# {query}\n\n{item["description"]}\n\n'
        text += '这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。\n\n'
        if item['phases']: text += '上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：\n\n' + '\n'.join('- ' + h for h in item['phases']) + '\n\n'
        if item['candidate_tools']: text += '上游引用且固定 SDK 中存在的工具候选：\n\n' + '\n'.join('- `tooluniverse.tool.' + tool + '`' for tool in item['candidate_tools']) + '\n\n'
        else: text += f'推荐发现词：`{query}`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。\n\n'
        text += '提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。\n\n'
        text += f'固定来源：[上游工作流]({item["source"]})；Apache-2.0；原文 SHA-256：`{item["source_sha256"]}`。\n'
        (output / (name + '.md')).write_text(text, encoding='utf-8')
    for group in DOMAINS:
        selected = [item for item in entries if item['domain'] == group]
        text = '# 固定上游工作流导航\n\n按研究问题只读取一个适用条目。这些摘要不表示远端已经执行或完整复现相应方法。\n\n'
        text += '\n'.join(f'- [{item["id"]}]({item["id"]}.md)：{item["description"][:160]}' for item in selected) + '\n'
        (output / (group + '.md')).write_text(text, encoding='utf-8')
    manifest = {'commit': COMMIT, 'license': 'Apache-2.0', 'upstream_count': len(paths), 'adapted_navigation_count': len(entries), 'excluded': sorted(path.split('/')[2] for path in paths if path.split('/')[2] in EXCLUDE), 'entries': entries}
    (DEST / 'UPSTREAM-WORKFLOWS.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in manifest.items() if key != 'entries'}, ensure_ascii=False))

if __name__ == '__main__': main()
