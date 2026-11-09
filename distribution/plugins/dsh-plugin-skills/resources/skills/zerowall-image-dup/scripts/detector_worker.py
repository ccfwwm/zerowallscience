"""Isolate a bounded scientific detector tile from the parent task budget."""
import json
from pathlib import Path
import sys
from dataclasses import asdict

sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
from manusift.contracts import ParsedDoc, ExtractedImage, TextBlock, ExtractedTable
from manusift.detectors import load_detector_class
from manusift.checkpoint import write_step

if __name__ == '__main__':
    data = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    doc = ParsedDoc(**{**data, 'images': [ExtractedImage(**i) for i in data['images']],
        'text_blocks': [TextBlock(**i) for i in data['text_blocks']],
        'tables': [ExtractedTable(**i) for i in data.get('tables', [])]})
    if sys.argv[1] == '--pipeline':
        import manusift.pipeline as pipeline
        from manusift.workspace import JobPaths
        from manusift.contracts import JobState
        from manusift.events import get_bus
        steps, skipped = [], []
        class Listener:
            name = 'zerowall-pipeline-status'
            def on_event(self, event):
                if event.type == 'job.step_completed' and event.payload.get('skipped'):
                    skipped.append(dict(event.payload))
        listener = get_bus().subscribe(Listener())
        pipeline._parse_pdf = lambda *a, **kw: doc
        paths = JobPaths.for_trace(doc.trace_id, Path(sys.argv[4]))
        paths.ensure()
        result = pipeline.run_pipeline(Path(doc.source_path), paths,
            JobState(trace_id=doc.trace_id, status='queued', source_filename=Path(doc.source_path).name),
            on_step_complete=lambda res,state: steps.append({'detector':res.detector,'ok':res.ok,'error':res.error,'stats':res.stats,'source':doc.source_path}))
        get_bus().unsubscribe(listener)
        target = Path(sys.argv[3]); temp=target.with_suffix('.tmp')
        temp.write_text(json.dumps({'findings':[asdict(f) for f in result.findings], 'steps':steps,'skipped':skipped},ensure_ascii=False),encoding='utf8')
        temp.replace(target)
    else:
        result = load_detector_class(sys.argv[1])().run(doc)
        write_step(Path(sys.argv[3]), result)
