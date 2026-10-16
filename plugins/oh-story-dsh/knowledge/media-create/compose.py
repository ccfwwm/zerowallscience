"""Local media composition. Only validated project assets; no provider/network code."""
import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:])
    return result.stdout


def number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Invalid timeline number')
    return value


def safe(root, relative):
    path = root / relative
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != root):
        raise ValueError('Symlink input rejected')
    physical = path.resolve()
    physical.relative_to(root)
    if not physical.is_file():
        raise ValueError('Missing asset')
    return physical


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    return f'{milliseconds // 3600000:02d}:{milliseconds // 60000 % 60:02d}:{milliseconds // 1000 % 60:02d},{milliseconds % 1000:03d}'


def compose(root, project, render_id):
    root = Path(root).resolve()
    if project['fps'] != 30 or project['aspectRatio'] not in ('16:9', '9:16', '1:1'):
        raise ValueError('Invalid output specification')
    width, height = {'16:9': (1920, 1080), '9:16': (1080, 1920), '1:1': (1080, 1080)}[project['aspectRatio']]
    project_root = root / 'media-projects' / project['id']
    project_root.resolve().relative_to(root)
    work = project_root / 'renders' / render_id
    work.mkdir(parents=True, exist_ok=False)
    clips = []
    cues = []
    clock = 0
    bindings = []
    if not project['shots']:
        raise ValueError('Timeline has no shots')
    for index, shot in enumerate(project['shots']):
        duration = number(shot['duration'], .1, 600)
        start = number(shot.get('trimStart', 0), 0, 86400)
        source = safe(root, shot['asset'])
        if not str(source).startswith(str((project_root / 'assets').resolve()) + os.sep):
            raise ValueError('Asset is outside project')
        metadata = probe(source)
        actual = float(metadata.get('format', {}).get('duration', 0) or 0)
        image = source.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')
        if not image and (actual <= 0 or start + duration > actual + .08):
            raise ValueError('Video trim exceeds actual duration')
        motion = shot.get('motion', 'none')
        if motion not in ('none', 'zoom-in', 'zoom-out'):
            raise ValueError('Unsupported image motion')
        clip = work / f'clip-{index:03d}.mp4'
        args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-n']
        if image:
            args += ['-loop', '1', '-i', str(source)]
        else:
            args += ['-ss', str(start), '-i', str(source)]
        filters = f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1'
        if image and motion != 'none':
            zoom = "min(zoom+0.0005,1.15)" if motion == 'zoom-in' else "if(eq(on,0),1.15,max(1,zoom-0.0005))"
            filters += f",zoompan=z='{zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={width}x{height}:fps=30"
        args += ['-t', str(duration), '-vf', filters, '-an', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', str(clip)]
        run(args)
        clips.append(clip)
        caption = str(shot.get('caption', '')).replace('\r', '').replace('-->', '→').replace('\n\n', '\n').strip()
        if caption:
            cues.append(f'{len(cues)+1}\n{timestamp(clock)} --> {timestamp(clock+duration)}\n{caption}\n')
        bindings.append({'asset': shot['asset'], 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'requestedDuration': duration, 'actualSourceDuration': actual, 'trimStart': start})
        clock += duration
    concat = work / 'concat.txt'
    # Owned filenames contain no quotes, backslashes or user text.
    concat.write_text(''.join(f"file '{path.name}'\n" for path in clips), encoding='utf-8')
    joined = work / 'joined.mp4'
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-f', 'concat', '-safe', '1', '-i', str(concat), '-c', 'copy', str(joined)])
    subtitles = work / 'subtitles.srt'
    subtitles.write_text('\n'.join(cues), encoding='utf-8')
    outputs = project_root / 'outputs'
    outputs.mkdir(exist_ok=True)
    final = outputs / f'{render_id}.mp4'
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', str(joined)]
    tracks = []
    for kind in ('music', 'voiceover'):
        track = project.get(kind)
        if not track:
            continue
        path = safe(root, track['path'])
        if not str(path).startswith(str((project_root / 'assets').resolve()) + os.sep):
            raise ValueError('Audio outside project')
        volume = number(track.get('volume', .25 if kind == 'music' else 1), 0, 4)
        actual = float(probe(path)['format']['duration'])
        args += ['-i', str(path)]
        index = len(tracks) + 1
        fade_in = number(track.get('fadeIn', 0), 0, clock)
        fade_out = number(track.get('fadeOut', 0), 0, clock)
        filters = f'[{index}:a]atrim=0:{clock},asetpts=PTS-STARTPTS,volume={volume},apad'
        if fade_in:
            filters += f',afade=t=in:st=0:d={fade_in}'
        if fade_out:
            filters += f',afade=t=out:st={clock-fade_out}:d={fade_out}'
        tracks.append(filters + f'[a{index}]')
        bindings.append({'kind': kind, 'asset': track['path'], 'actualSourceDuration': actual, 'placedDuration': min(actual, clock), 'volume': volume})
    if tracks:
        labels = ''.join(f'[a{index+1}]' for index in range(len(tracks)))
        args += ['-filter_complex', ';'.join(tracks + [f'{labels}amix=inputs={len(tracks)}:normalize=0:duration=longest[audio]']), '-map', '0:v:0', '-map', '[audio]', '-c:a', 'aac', '-b:a', '192k']
    else:
        args += ['-an']
    if cues:
        # Run from owned work directory to avoid Windows drive/path escaping in filters.
        args += ['-vf', 'subtitles=subtitles.srt', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p']
    else:
        args += ['-c:v', 'copy']
    args += ['-t', str(clock), '-movflags', '+faststart', str(final)]
    previous = Path.cwd()
    try:
        os.chdir(work)
        run(args)
    finally:
        os.chdir(previous)
    result = probe(final)
    actual = float(result['format']['duration'])
    if abs(actual-clock) > .12:
        raise ValueError('Final duration mismatch')
    video = next(s for s in result['streams'] if s['codec_type'] == 'video')
    if video['codec_name'] != 'h264' or video['width'] != width or video['height'] != height:
        raise ValueError('Final picture mismatch')
    if tracks and not any(s['codec_type'] == 'audio' and s['codec_name'] == 'aac' for s in result['streams']):
        raise ValueError('Final audio mismatch')
    run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(final), '-f', 'null', '-'])
    asset = {'id': render_id, 'path': final.relative_to(root).as_posix(), 'mediaType': 'video/mp4', 'bytes': final.stat().st_size, 'sha256': hashlib.sha256(final.read_bytes()).hexdigest(), 'duration': actual}
    final.with_suffix('.receipt.json').write_text(json.dumps({'asset': asset, 'projectRevision': project['revision'], 'bindings': bindings, 'subtitleCues': len(cues), 'ffprobe': result}, ensure_ascii=False, indent=2), encoding='utf-8')
    return asset


if __name__ == '__main__':
    print(json.dumps(compose(sys.argv[1], json.loads(Path(sys.argv[2]).read_text(encoding='utf-8-sig')), sys.argv[3]), ensure_ascii=False))
