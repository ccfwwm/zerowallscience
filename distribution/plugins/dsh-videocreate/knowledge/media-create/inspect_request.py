#!/usr/bin/env python3
"""Inspect a video request; optional network checks never submit generation."""
import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Credentials belong to the configured origin only.
        return None


def inspect(body):
    if not isinstance(body, dict) or not isinstance(body.get('model'), str):
        raise ValueError('Request must be an object with a model name')
    counts, attributes = {}, {}
    for field in ('images', 'videos', 'audios'):
        refs = body.get(field, [])
        if not isinstance(refs, list):
            raise ValueError(field + ' must be an ordered array')
        counts[field] = len(refs)
        attributes[field] = []
        for ref in refs:
            if isinstance(ref, str):
                attributes[field].append([])
            elif isinstance(ref, dict) and sum(key in ref for key in ('url', 'b64_json')) == 1:
                attributes[field].append(sorted(key for key in ref if key not in ('url', 'b64_json')))
            else:
                raise ValueError(field + ' entries need one string source or url/b64_json object')
    return {'model': body['model'], 'reference_counts': counts, 'reference_attribute_names': attributes,
            'parameter_names': sorted(k for k in body if k not in ('images', 'videos', 'audios'))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', required=True, help='JSON request object; never include credentials')
    parser.add_argument('--online', action='store_true', help='Read-only discovery and free estimate')
    parser.add_argument('--task-id', help='Optional original task ID to query; never resubmitted')
    args = parser.parse_args()
    body = json.loads(Path(args.request).read_text(encoding='utf-8-sig'))
    report = inspect(body)
    if args.online:
        base = os.environ.get('SUB2API_BASE_URL', '').rstrip('/')
        key = os.environ.get('SUB2API_API_KEY', '')
        if not base or not key:
            raise ValueError('Set SUB2API_BASE_URL and SUB2API_API_KEY for online checks')
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Use an HTTPS base URL without credentials or query parameters')

        def call(path, payload=None):
            headers = {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}
            req = urllib.request.Request(base + path, headers=headers,
                                         data=None if payload is None else json.dumps(payload).encode())
            try:
                with urllib.request.build_opener(NoRedirect()).open(req, timeout=45) as response:
                    value = json.load(response)
                    return response.status, value
            except urllib.error.HTTPError as error:
                # Do not print response bodies which may echo media or credentials.
                return error.code, {}
        report['checks'] = {}
        for name, path in [('models', '/v1/models'), ('capabilities', '/v1/media/capabilities')]:
            code, value = call(path)
            report['checks'][name] = {'http': code, 'entries': len(value.get('data', [])) if isinstance(value.get('data'), list) else None}
        code, _ = call('/v1/sub2api/estimates', {'operation': 'video', 'request': body})
        report['checks']['estimate'] = {'http': code}
        if args.task_id:
            code, value = call('/v1/tasks/' + urllib.parse.quote(args.task_id, safe=''))
            report['checks']['original_task'] = {'http': code, 'status': value.get('status')}
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(type(error).__name__ + ': check the request file, URL and environment configuration') from None
