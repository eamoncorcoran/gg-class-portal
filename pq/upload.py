#!/usr/bin/env python3
"""Push the past-questions site data to the running service, once.

    PQ_SERVICE_URL=https://gg-past-questions.onrender.com PQ_UPLOAD_TOKEN=... python3 upload.py
    python3 upload.py --dry-run                 # counts and bytes only, needs no URL or token
    python3 upload.py --only oral --only raw    # one or more top-level folders

Walks SITE (default ~/studyclix-clone/site), leaving out site/audio (the uncut recordings, which
nothing references; the hub plays aud/) and the narrator cache (tts/), plus the raw/ marking inputs
the server reads (audio_cuts.json and the Whisper transcripts). Fetches /_manifest first, skips
every file already there with the same size, and PUTs the rest to /_upload/<path> with a few
workers, three tries each.
"""
import argparse, os, re, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed

EXCLUDE_TOP = ('audio', 'tts')     # site/audio is unreferenced (data.json and the hub only use aud/); tts is a cache
SKIP_NAMES = ('.DS_Store',)
TRANSCRIPT = re.compile(r'^\d{4}D?\.json$')   # raw/transcripts/2024.json, 2024D.json: the files transcript() reads

def human(n):
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            return f'{n:.1f} {unit}' if unit != 'B' else f'{n} B'
        n /= 1024

def collect(site, raw, only, exclude):
    """[(relative path, absolute path, size)] in a stable order."""
    files = []
    for dp, dirs, names in os.walk(site):
        rel_dir = os.path.relpath(dp, site)
        top = rel_dir.split(os.sep)[0] if rel_dir != '.' else ''
        if rel_dir == '.':
            dirs[:] = sorted(d for d in dirs if d not in exclude)
        else:
            dirs.sort()
        for name in sorted(names):
            if name in SKIP_NAMES or name.endswith('.part') or '.part-' in name:
                continue
            full = os.path.join(dp, name)
            rel = os.path.relpath(full, site).replace(os.sep, '/')
            files.append((rel, full, os.path.getsize(full)))
    if raw and os.path.isdir(raw):
        cuts = os.path.join(raw, 'audio_cuts.json')
        if os.path.isfile(cuts):
            files.append(('raw/audio_cuts.json', cuts, os.path.getsize(cuts)))
        tx = os.path.join(raw, 'transcripts')
        if os.path.isdir(tx):
            for name in sorted(os.listdir(tx)):
                if TRANSCRIPT.match(name):
                    full = os.path.join(tx, name)
                    files.append((f'raw/transcripts/{name}', full, os.path.getsize(full)))
    if only:
        files = [f for f in files if f[0].split('/')[0] in only]
    return files

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--site', default=os.path.expanduser('~/studyclix-clone/site'))
    ap.add_argument('--raw', default=None, help='the clone\'s raw/ folder (default: next to --site); --raw "" skips it')
    ap.add_argument('--only', action='append', default=[], metavar='TOP', help='only this top-level folder or file (repeatable)')
    ap.add_argument('--exclude', action='append', default=list(EXCLUDE_TOP), metavar='TOP')
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--url', default=os.environ.get('PQ_SERVICE_URL', ''))
    args = ap.parse_args()
    site = os.path.abspath(args.site)
    raw = os.path.join(os.path.dirname(site), 'raw') if args.raw is None else (os.path.abspath(args.raw) if args.raw else '')
    files = collect(site, raw, set(args.only), set(args.exclude))
    total = sum(f[2] for f in files)
    by_top = {}
    for rel, _, size in files:
        t = rel.split('/')[0]
        n, b = by_top.get(t, (0, 0))
        by_top[t] = (n + 1, b + size)
    print(f'{len(files)} files, {human(total)} under {site}' + (f' (+ {raw})' if raw else ''))
    for t, (n, b) in sorted(by_top.items(), key=lambda kv: -kv[1][1]):
        print(f'  {t:<16} {n:>6} files  {human(b):>10}')
    if args.dry_run:
        return
    import requests
    url = args.url.rstrip('/')
    token = os.environ.get('PQ_UPLOAD_TOKEN', '')
    if not url or not token:
        sys.exit('set PQ_SERVICE_URL and PQ_UPLOAD_TOKEN (or use --dry-run)')
    headers = {'X-Upload-Token': token}
    r = requests.get(f'{url}/_manifest', headers=headers, timeout=120)
    if r.status_code != 200:
        sys.exit(f'/_manifest answered {r.status_code}: {r.text[:200]}')
    have = r.json()
    todo = [f for f in files if have.get(f[0]) != f[2]]
    skipped = len(files) - len(todo)
    print(f'{skipped} already there, {len(todo)} to upload ({human(sum(f[2] for f in todo))})', flush=True)
    lock, done, sent, failed, t0 = threading.Lock(), [0], [0], [], time.time()
    local = threading.local()

    def put(item):
        rel, full, size = item
        s = getattr(local, 's', None) or requests.Session()
        local.s = s
        last = None
        for attempt in range(3):
            try:
                with open(full, 'rb') as fh:
                    resp = s.put(f'{url}/_upload/{rel}', data=fh, headers={**headers, 'Content-Type': 'application/octet-stream',
                                                                        'Content-Length': str(size)}, timeout=600)
                if resp.status_code == 200 and resp.json().get('size') == size:
                    return rel, size, None
                last = f'{resp.status_code} {resp.text[:120]}'
                if resp.status_code in (400, 403):
                    break
            except Exception as ex:
                last = repr(ex)[:120]
            time.sleep(2 * (attempt + 1))
        return rel, size, last

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for fut in as_completed([pool.submit(put, f) for f in todo]):
            rel, size, err = fut.result()
            with lock:
                done[0] += 1
                if err:
                    failed.append((rel, err))
                    print(f'  FAILED {rel}: {err}', flush=True)
                else:
                    sent[0] += size
                if done[0] % 50 == 0 or done[0] == len(todo):
                    el = time.time() - t0
                    print(f'  {done[0]}/{len(todo)}  {human(sent[0])}  {human(sent[0] / el if el else 0)}/s', flush=True)
    print(f'done: {len(todo) - len(failed)} uploaded, {len(failed)} failed, {skipped} skipped, {time.time() - t0:.0f}s')
    if failed:
        sys.exit(1)

if __name__ == '__main__':
    main()
