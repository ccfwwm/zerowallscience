"""Bounded Node stages with atomic, resumable tiles; every cross-tile pair is covered."""
import json
import time
from pathlib import Path


def scan(paths, job, threshold, invoke, save, budget=240, batch_size=16):
    started = time.monotonic()
    root = job / 'steps' / 'region-batches'
    root.mkdir(parents=True, exist_ok=True)
    aggregate = {'ok': True, 'pairs': [], 'crossPairs': [], 'copyMove': [], 'skipped': [], 'partial': False}
    total_tiles = (len(paths) + batch_size - 1) // batch_size
    planned = total_tiles * 2 + 1 + total_tiles * (total_tiles + 1) // 2
    progress = {'completed': 0, 'planned': planned, 'total_images': len(paths), 'phase': 'features'}

    def work(key, config):
        cache = root / (key + '.json')
        if cache.exists():
            value = json.loads(cache.read_text(encoding='utf-8'))
        else:
            remaining = budget - (time.monotonic() - started)
            if remaining < 1:
                raise TimeoutError('Invocation budget reached; resume the same trace ID.')
            value = invoke(config, timeout=min(180 if 'compareFeatures' in config else 60, remaining))
            save(cache, value)
        progress['completed'] += 1
        save(job / 'progress.json', {**progress, 'updated_at': time.time()})
        for field in ['pairs', 'crossPairs', 'copyMove', 'skipped']:
            aggregate[field].extend(value.get(field, []))
        return value

    blocks = [paths[i:i+batch_size] for i in range(0, len(paths), batch_size)]
    try:
        features = []
        for i, block in enumerate(blocks):
            value = work(f'features-{i:05d}', {'paths': block, 'limit': len(block), 'thumb': 0,
                'copyMove': False, 'crossImage': False, 'featureOnly': True})
            features.extend(value['files'])
        progress['phase'] = 'whole-image'
        work('whole-image', {'compareFeatures': features, 'threshold': threshold})
        progress['phase'] = 'copy-move'
        for i, block in enumerate(blocks):
            work(f'copy-{i:05d}', {'paths': block, 'limit': len(block), 'thumb': 0,
                'copyMove': True, 'crossImage': False, 'skipWholePairs': True})
        progress['phase'] = 'cross-image'
        for i, left in enumerate(blocks):
            for j in range(i, len(blocks)):
                block = left if i == j else left + blocks[j]
                work(f'cross-{i:05d}-{j:05d}', {'paths': block, 'limit': len(block), 'thumb': 0,
                    'copyMove': False, 'crossImage': True, 'skipWholePairs': True,
                    'leftCount': len(left) if i != j else None})
    except Exception as error:
        aggregate['partial'] = True
        aggregate['skipped'].append({'stage': 'region-batches', 'reason': str(error), **progress})
    aggregate['progress'] = progress
    save(job / 'progress.json', {**progress, 'partial': aggregate['partial'], 'updated_at': time.time()})
    return aggregate
