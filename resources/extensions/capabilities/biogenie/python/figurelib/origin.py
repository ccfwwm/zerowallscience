# -*- coding: utf-8 -*-
"""figorigin —— 图来源记录（轻量来源侧车，覆盖一切图含发育树/示意图）。

开关：环境变量 DSH_BIO_FIGORIGIN（auto=开 / off=关，默认 auto）。
上下文：绘图脚本可调用 set_source_context(inputs=[...], params={...}, tool=..., note=...)
声明输入；export_figure 落盘每张 PNG 时自动写 <stem>.figorigin.json。

设计约束：
- 无点映射的图（树/示意）至少"可查来源"——本侧车即该能力的载体；
- 与 fig-viewer sidecar（.figview.json）并存、互补：后者管点级交互，本侧车管来源。
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import time

_CTX = {'inputs': [], 'params': {}, 'tool': None, 'note': None}


def set_source_context(*, inputs=None, params=None, tool=None, note=None):
    """声明本次出图的来源上下文（对后续 export_figure 生效）。"""
    if inputs is not None:
        norm = []
        for it in inputs:
            if isinstance(it, str):
                norm.append({'path': it})
            elif isinstance(it, dict) and it.get('path'):
                norm.append(dict(it))
        _CTX['inputs'] = norm
    if params is not None:
        _CTX['params'] = dict(params)
    if tool is not None:
        _CTX['tool'] = str(tool)
    if note is not None:
        _CTX['note'] = str(note)
    return get_source_context()


def clear_source_context():
    _CTX['inputs'] = []
    _CTX['params'] = {}
    _CTX['tool'] = None
    _CTX['note'] = None


def get_source_context():
    return json.loads(json.dumps(_CTX))


def origin_enabled():
    v = os.environ.get('DSH_BIO_FIGORIGIN', 'auto').strip().lower()
    return v not in ('off', '0', 'false', 'no', 'disabled')


_DATA_EXTS = ('.fasta', '.fa', '.fas', '.aln', '.faa', '.csv', '.tsv', '.txt', '.nwk',
              '.newick', '.tree', '.gb', '.gbk', '.gbff', '.embl', '.sbol', '.xml', '.json',
              '.xlsx', '.sdf', '.mol', '.pdb', '.cif', '.sto', '.stockholm')


def _recent_datafiles(base, limit=12, window_hours=3):
    """近 window_hours 小时内修改、扩展名像数据的文件（用于未声明输入的推断兜底）。"""
    out = []
    try:
        now = time.time()
        for name in os.listdir(base):
            p = os.path.join(base, name)
            if not os.path.isfile(p):
                continue
            low = name.lower()
            if low.endswith(('.png', '.pdf', '.svg', '.figorigin.json')):
                continue
            if not low.endswith(_DATA_EXTS):
                continue
            try:
                st = os.stat(p)
            except Exception:
                continue
            if now - st.st_mtime <= window_hours * 3600:
                out.append((st.st_mtime, p))
    except Exception:
        return []
    out.sort(reverse=True)
    return [p for _, p in out[:limit]]


def _sha256_file(path, limit=64 * 1024 * 1024):
    try:
        st = os.stat(path)
        if st.st_size > limit:
            return None
        h = hashlib.sha256()
        with open(path, 'rb') as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def write_origin(png_path, *, generator='figurelib.export_figure'):
    """为已落盘 PNG 写 <stem>.figorigin.json（开关关闭时返回 None）。"""
    if not origin_enabled():
        return None
    try:
        stem, _ = os.path.splitext(png_path)
        out = stem + '.figorigin.json'
        w = h = None
        try:
            from PIL import Image
            with Image.open(png_path) as im:
                w, h = im.size
        except Exception:
            pass
        ctx = get_source_context()
        inputs = []
        for it in ctx.get('inputs') or []:
            p = str(it.get('path') or '')
            if not p:
                continue
            is_file = os.path.isfile(p)
            inputs.append({
                'path': p,
                'kind': it.get('kind') or ('file' if is_file else 'declared'),
                'sha256': _sha256_file(p) if is_file else None,
                'note': it.get('note'),
            })
        inferred = []
        cwd = os.getcwd()
        if not inputs:
            bases = [cwd]
            try:
                for name in sorted(os.listdir(cwd))[:60]:
                    p = os.path.join(cwd, name)
                    if os.path.isdir(p) and not name.startswith('.'):
                        bases.append(p)
            except Exception:
                pass
            seen = set()
            for base in bases[:12]:
                for p in _recent_datafiles(base, limit=6):
                    if p not in seen:
                        seen.add(p)
                        inferred.append({'path': p, 'kind': 'inferred',
                                         'sha256': _sha256_file(p), 'note': None})
                    if len(inferred) >= 12:
                        break
                if len(inferred) >= 12:
                    break
        src = None
        if inputs:
            first = inputs[0]
            src = {'kind': 'file', 'label': os.path.basename(first['path']),
                   'path': first['path'], 'file_sha256': first['sha256']}
        doc = {
            'schema_version': 1,
            'kind': 'figorigin',
            'figure_id': os.path.basename(stem),
            'image': {'path': os.path.basename(png_path), 'sha256': _sha256_file(png_path),
                      'width': w, 'height': h},
            'generator': {'module': generator, 'python': platform.python_version(),
                          'written': time.strftime('%Y-%m-%dT%H:%M:%S')},
            'source': src,
            'inputs': inputs,
            'inferred_inputs': inferred,
            'cwd': cwd if not inputs else None,
            'params': ctx.get('params') or {},
            'tool': ctx.get('tool'),
            'note': ctx.get('note'),
        }
        tmp = out + '.tmp'
        with open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, out)
        return out
    except Exception:
        return None
