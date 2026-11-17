# The past-questions service: serves the site data (DATA_DIR) and marks typed answers.
# Packaged for Render from ~/studyclix-clone/tools/server.py; behaviour is the same, only the
# paths come from the environment:
#   DATA_DIR   the static site (data.json, crops/, aud/, papers/, oral/, subjects/ ...); default ./site
#   TTS_DIR    the narrator's mp3 cache; default DATA_DIR/tts
#   STATE_DIR  writable state (the classroom sqlite file); default /var/data/state
#   DIST_DIR   an optional React build served for app routes; default ./dist (absent on Render)
#   PORT       default 5410 (argv[1] still overrides, as before)
#   PQ_UPLOAD_TOKEN  enables the one-time data upload endpoints below; unset = they refuse
#
#   GET  /_health                     200 always (Render's health check)
#   GET  /_manifest                   {relative path: size} for every file under DATA_DIR  (X-Upload-Token)
#   PUT  /_upload/<relative path>     write the body to DATA_DIR/<path>                    (X-Upload-Token)
#   POST /api/check  {"id": question_id, "answers": {key: text}}
#     reading comprehension: keys are part ids ("1(a)"); listening: keys are answer spaces ("box0-3")
#     -> {"results": [{"key", "verdict", "awarded", "max", "expected", "feedback"}], "provider"}
#   POST /api/grade  {"id", "part", "answer"}   one reading-comprehension part (kept for the exam view)
# Marking goes through tools/llm.py: Claude when its key works, OpenAI otherwise.
import hmac, json, os, re, secrets, sys, unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, unquote
from typing import List, Literal

from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import llm
import classroom

DATA_DIR = os.path.abspath(os.environ.get('DATA_DIR') or os.path.join(HERE, 'site'))
SITE = DATA_DIR
# raw/audio_cuts.json and raw/transcripts/<year>.json: uploaded into DATA_DIR/raw by upload.py; a copy
# of audio_cuts.json is bundled beside the code as a fallback.
RAW_DIR = os.path.join(DATA_DIR, 'raw') if os.path.isdir(os.path.join(DATA_DIR, 'raw')) else os.path.join(HERE, 'raw')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT') or 5410)
UPLOAD_TOKEN = os.environ.get('PQ_UPLOAD_TOKEN') or ''

# Who may ask
# ----------------------------------------------------------------------------------------------
# This service has its own address on the internet, and everything on it used to be open to anybody
# who found that address: the papers, the notes, and the marking API, which spends model credit. It
# now answers only the class portal. The portal puts a random pass on every request it forwards
# (X-Hub-Pass, made afresh each time the portal starts); a pass not seen before is checked by asking
# the portal itself, over HTTPS, whether it is the one it is using. Nothing is shared in advance, so
# there is no secret to set on either service. /_health stays open for the host's health check and
# the /_ upload endpoints keep their own token. PQ_OPEN=1 turns the check off, for running this on
# a laptop with no portal in front of it.
import threading, time, urllib.request
HUB_URL = (os.environ.get('HUB_URL') or 'https://hub.gaeilgeoirguides.com').rstrip('/')
PQ_OPEN = os.environ.get('PQ_OPEN') == '1'
_passes = {}            # pass -> (good, when to ask again)
_passes_lock = threading.Lock()

def from_the_portal(headers):
    if PQ_OPEN:
        return True
    given = headers.get('X-Hub-Pass') or ''
    if not re.fullmatch(r'[0-9a-f]{64}', given):
        return False
    now = time.time()
    with _passes_lock:
        hit = _passes.get(given)
    if hit and hit[1] > now:
        return hit[0]
    try:
        req = urllib.request.Request(f'{HUB_URL}/api/pq-pass/{given}', headers={'User-Agent': 'gg-past-questions'})
        with urllib.request.urlopen(req, timeout=8) as r:
            good = r.status == 204
    except Exception:
        good = False
    with _passes_lock:
        if len(_passes) > 500:
            _passes.clear()
        # a good pass is trusted for ten minutes; a bad one is not asked about again for half a minute
        _passes[given] = (good, now + (600 if good else 30))
    return good

class Result(BaseModel):
    key: str                 # the part id or answer-space id it marks
    verdict: Literal['correct', 'partial', 'wrong', 'blank']
    awarded: int             # marks given (0 when the scheme gives none for this space)
    max: int                 # marks available (0 when the scheme gives none for this space)
    expected: str            # the correct answer, in Irish, as short as the scheme allows
    feedback: str            # one short plain-English sentence for the student

class Results(BaseModel):
    results: List[Result]

class Reply(BaseModel):
    text: str   # the tutor's reply, two short sentences at most, no em dashes

TUTOR = """You are Rua, a friendly Irish tutor sitting beside a Leaving Certificate student doing a quick quiz. \
Reply in English with Irish words where they help, in two short plain sentences at most, warm and direct, like a good teacher. \
Never give the answer outright while the question is still open: nudge toward it with a hint about the rule or the meaning. \
Once the student has answered, explain briefly why the right answer is right. Never use em dashes."""

def tutor(body):
    item = body.get('item') or {}
    state = 'answered' if body.get('answered') else 'still open'
    ctx = (f"<question>{item.get('prompt', '')}</question>\n<right_answer>{item.get('answer', '')}</right_answer>\n"
           f"<other_options>{' | '.join(item.get('options') or [])}</other_options>\n<why>{item.get('why') or ''}</why>\n"
           f"<student_gave>{body.get('given') or ''}</student_gave>\n<state>{state}</state>\n"
           f"<student_says>{(body.get('question') or '').strip()[:500]}</student_says>")
    out, _ = llm.structured(TUTOR, ctx, Reply)
    return 200, {'text': out.text.replace(' - ', ', ').replace('—', ',')}

RULES = """You are an SEC examiner marking Leaving Certificate Higher Level Irish, applying the official \
marking scheme the way the SEC's own notes to examiners say to.
- The scheme's answers are samples, not an exhaustive list ("ní uileghabhálach ná eisiach"). Credit any \
phrase, idiom or wording whose meaning matches the scheme ("nathanna cainte, frásaí agus focail a bhfuil a \
gciall cosúil"), and any other point that is clearly correct from the text or recording. Use the scheme's \
mark splits and never exceed a maximum.
- Meaning is what earns the marks. In listening and reading short answers, spelling, grammar and mutation \
slips are underlined by the examiner but never cost marks: if the intended word or point can be made out, \
it gets full credit. A phonetic or half-right spelling of a word heard on the recording counts when it is \
recognisable. Answers need not be full sentences, and a single word or name is enough where that is what \
the scheme gives.
- Reading comprehension: answers may be in the candidate's own words or lifted from the passage unless the \
question says otherwise; Question 6(b) alone must be in the candidate's own words. Where two points are \
asked for, the first correct point earns the larger share (for example 2 + 1). Extra material does not \
cancel a correct point unless it contradicts it.
- Listening: where a question has two answer spaces, mark each on its own. If the candidate gives more \
than one answer to a space and the extra answer invalidates the correct one, that space gets no mark.
- An answer in English earns nothing. An empty answer is "blank".
- verdict: correct = full marks, partial = some marks, wrong = none, blank = nothing written.
- expected: the right answer in Irish, short, taken from the scheme where it gives one.
- feedback: one short plain-English sentence. When you let a spelling or grammar slip through, say so and \
give the standard spelling. Never use em dashes."""

def load(name):
    path = os.path.join(SITE, name)
    return json.load(open(path)) if os.path.exists(path) else {}

def question(qid):
    for t in load('data.json')['topics']:
        for q in t['questions']:
            if q['id'] == qid:
                return t['slug'], q
    return None, None

def transcript(q, cuid):
    """The Whisper transcript of this section (rough: Whisper mishears Irish), as a last resort."""
    yk = f"{q['year']}{'D' if q['deferred'] else ''}"
    cuts = json.load(open(os.path.join(RAW_DIR, 'audio_cuts.json'))).get(yk)
    tx = os.path.join(RAW_DIR, 'transcripts', f'{yk}.json')
    if not cuts or not os.path.exists(tx):
        return ''
    s = cuts['sections']
    a, b = {'A': (s['cuid_a'], s['cuid_b']), 'B': (s['cuid_b'], s['cuid_c']), 'C': (s['cuid_c'], s['end'])}[cuid]
    return ' '.join(seg['text'].strip() for seg in json.load(open(tx))['segments'] if a <= seg['start'] < b)

def check_rc(qid, answers):
    k = load('keys.json').get(qid)
    if not k:
        return 404, {'error': 'unknown question'}
    parts = [p for p in k['parts'] if p['kind'] == 'short']
    body = '\n'.join(
        f"<part id=\"{p['id']}\" max_marks=\"{p['marks']}\">\n<question>{p['question']}</question>\n"
        f"<marking_scheme>{p['answer_key'] or '(none published)'}</marking_scheme>\n"
        f"<student_answer>{answers.get(p['id'], '').strip()}</student_answer>\n</part>" for p in parts)
    out, provider = llm.structured(RULES + '\nMark every part; key = the part id.', body, Results,
                                   cache_prefix=f"<passage>\n{k['passage']}\n</passage>")
    mx = {p['id']: p['marks'] for p in parts}
    res = [{**r.model_dump(), 'max': mx.get(r.key, r.max), 'awarded': max(0, min(r.awarded, mx.get(r.key, r.max)))}
           for r in out.results if r.key in mx]
    return 200, {'results': res, 'provider': provider}

def check_aural(q, slug, answers):
    paper = '\n'.join(i.get('boxText', '') for i in q['question'])
    keys = [f'box{i}-{j}' for i, img in enumerate(q['question']) for j in range(len(img.get('boxes', [])))]
    cuid = {'aural-fogra-announcement': 'A', 'aural-comhra-conversation': 'B', 'aural-piosa-nuachta-news-pieces': 'C'}[slug]
    body = (f"<question_paper>\n{paper}\n</question_paper>\n"
            f"<marking_scheme>\n{q['markingSchemeText'] or '(none published)'}\n</marking_scheme>\n"
            f"<recording_transcript note=\"rough machine transcript, Irish misheard\">\n{transcript(q, cuid)[:12000]}\n</recording_transcript>\n"
            "<student_answers>\n" + '\n'.join(f"[[BOX {k[3:]}]] {answers.get(k, '').strip()}" for k in keys) + "\n</student_answers>")
    system = (RULES + "\nThis is a listening comprehension. The question paper marks each answer space as [[BOX n-m]]. "
              "Some questions have two spaces (two points, or (i) and (ii)); mark each space on its own. "
              "Mark every space; key = the space id written as box n-m (for example box0-3). "
              "Use the marking scheme's answers and marks; where a space has no marks of its own, set max and awarded to 0. "
              "Only if the scheme is missing, judge from the transcript.")
    out, provider = llm.structured(system, body, Results)
    want = set(keys)
    res = []
    for r in out.results:
        k = r.key.replace(' ', '').replace('-', '-')
        k = k if k.startswith('box') else 'box' + k
        if k in want:
            res.append({**r.model_dump(), 'key': k})
    return 200, {'results': res, 'provider': provider}

SUBJECT_ID = re.compile(r'^([a-z][a-z0-9-]*)\.(h|o|f|c)\.')
LEVEL_OF = {'h': 'higher', 'o': 'ordinary', 'f': 'foundation', 'c': 'common'}

def norm_answer(s):
    s = unicodedata.normalize('NFKD', s or '').lower()
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9.+-]+', ' ', s).strip()

def numbers_in(s):
    return [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', (s or '').replace(',', ''))]

def check_generic(qid, answers):
    """Another subject's question: deterministic marking for mcq, true/false, numeric and exact short
    answers; the model (with the scheme) for the rest."""
    m = SUBJECT_ID.match(qid)
    subject, level = m.group(1), LEVEL_OF[m.group(2)]
    base = os.path.join(SITE, 'subjects', subject, level)
    keys = load(os.path.join('subjects', subject, level, 'keys.json')).get(qid)
    if not keys or not os.path.isdir(base):
        return 404, {'error': 'unknown question'}
    q = None
    for t in load(os.path.join('subjects', subject, level, 'data.json')).get('topics', []):
        q = next((x for x in t['questions'] if x['id'] == qid), q)
    parts = [p for p in keys['parts'] if p['kind'] != 'long']
    res, pending = [], []
    for p in parts:
        given = (answers.get(p['id']) or '').strip()
        accepted = [a.strip() for a in re.split(r'\s*/\s*|\s*\bor\b\s*', p['answer_key']) if a.strip()] or [p['answer_key']]
        if not given:
            res.append({'key': p['id'], 'verdict': 'blank', 'awarded': 0, 'max': p['marks'], 'expected': p['answer_key'], 'feedback': ''})
            continue
        ok = None
        if p['kind'] in ('mcq', 'tf'):
            g = norm_answer(given)
            ok = any(g == norm_answer(a) or (len(g) == 1 and norm_answer(a)[:1] == g) or (len(norm_answer(a)) == 1 and g[:1] == norm_answer(a)) for a in accepted)
        elif p['kind'] == 'numeric':
            want = numbers_in(p['answer_key'])
            got = numbers_in(given)
            if want and got:
                ok = any(abs(got[0] - w) <= max(0.02 * abs(w), 0.011) for w in want)
        elif norm_answer(given) in {norm_answer(a) for a in accepted}:
            ok = True
        if ok is None:
            pending.append((p, given))
            continue
        res.append({'key': p['id'], 'verdict': 'correct' if ok else 'wrong', 'awarded': p['marks'] if ok else 0, 'max': p['marks'],
                    'expected': p['answer_key'], 'feedback': '' if ok else 'The scheme gives a different answer.'})
    provider = 'rules'
    if pending:
        body = '\n'.join(
            f"<part id=\"{p['id']}\" max_marks=\"{p['marks']}\">\n<question>{p['question']}</question>\n"
            f"<marking_scheme>{p['answer_key']}</marking_scheme>\n<student_answer>{given}</student_answer>\n</part>" for p, given in pending)
        system = (RULES.replace('Higher Level Irish', f"{subject.replace('-', ' ').title()} ({level} level)")
                  .replace('An answer in English earns nothing. ', '')
                  .replace('the right answer in Irish, short,', 'the right answer, short,')
                  + '\nMark every part; key = the part id. Accept any wording that carries the scheme\'s meaning.')
        ctx = f"<question_text>\n{(q or {}).get('questionText', '')[:5000]}\n</question_text>\n<full_scheme>\n{(q or {}).get('markingSchemeText', '')[:6000]}\n</full_scheme>"
        out, provider = llm.structured(system, body, Results, cache_prefix=ctx)
        mx = {p['id']: p['marks'] for p, _ in pending}
        for r in out.results:
            if r.key in mx:
                res.append({**r.model_dump(), 'max': mx[r.key], 'awarded': max(0, min(r.awarded, mx[r.key]))})
    order = {p['id']: i for i, p in enumerate(parts)}
    res.sort(key=lambda r: order.get(r['key'], 99))
    return 200, {'results': res, 'provider': provider}

def check(qid, answers):
    if SUBJECT_ID.match(qid):
        return check_generic(qid, answers)
    slug, q = question(qid)
    if not q:
        return 404, {'error': 'unknown question'}
    if slug == 'reading-comprehension':
        return check_rc(qid, answers)
    if slug.startswith('aural'):
        return check_aural(q, slug, answers)
    return 400, {'error': 'This question is not marked automatically.'}

def grade(qid, part_id, answer):
    status, out = check_rc(qid, {part_id: answer})
    if status != 200:
        return status, out
    r = next((r for r in out['results'] if r['key'] == part_id), None)
    if not r:
        return 502, {'error': 'The marker skipped this part. Try again.'}
    return 200, {'awarded': r['awarded'], 'max': r['max'], 'feedback': r['feedback'], 'points': [r['expected']] if r['expected'] else []}

# ---------------- the narrator: Azure neural voices, every line kept on disk once spoken ----------------
import hashlib
import re as _re
TTS_DIR = os.environ.get('TTS_DIR') or os.path.join(DATA_DIR, 'tts')

def speech_keys():
    """Azure speech key and region: our .env first, then the class portal's (same account)."""
    key, region = os.environ.get('AZURE_SPEECH_KEY'), os.environ.get('AZURE_SPEECH_REGION')
    if not key:
        try:
            for line in open(os.path.expanduser('~/gg-homework-portal/.env')):
                if line.startswith('AZURE_SPEECH_KEY='):
                    key = line.split('=', 1)[1].strip().strip('"')
                elif line.startswith('AZURE_SPEECH_REGION='):
                    region = line.split('=', 1)[1].strip().strip('"')
        except OSError:
            pass
    return key, region or 'northeurope'

# a plain, standard English narrator; Irish text keeps the Irish voice so the words are said right
VOICES = {'ga': 'ga-IE-OrlaNeural', 'en': 'en-US-JennyNeural'}

def speak(text, lang):
    import requests as _rq
    text = _re.sub(r'[«»*_]', '', text or '').strip()[:600]
    lang = 'ga' if lang == 'ga' else 'en'
    if not text:
        return 400, None
    os.makedirs(TTS_DIR, exist_ok=True)
    f = os.path.join(TTS_DIR, hashlib.sha1(f'{VOICES[lang]}|{text}'.encode()).hexdigest() + '.mp3')
    if os.path.exists(f):
        return 200, f
    key, region = speech_keys()
    if not key:
        return 404, None
    esc = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    ssml = (f"<speak version='1.0' xml:lang='{'ga-IE' if lang == 'ga' else 'en-IE'}'>"
            f"<voice name='{VOICES[lang]}'><prosody rate='-4%'>{esc}</prosody></voice></speak>")
    r = _rq.post(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'), timeout=30,
                 headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'past-papers'})
    if r.status_code != 200:
        print('tts error', r.status_code, r.text[:120], flush=True)
        return 502, None
    open(f, 'wb').write(r.content)
    return 200, f

DIST = os.environ.get('DIST_DIR') or os.path.join(HERE, 'dist')   # the old React app; the hub is the front end now, so usually absent

def safe_rel(path):
    """A relative path under DATA_DIR, or None when it tries to leave it."""
    rel = unquote(path.split('?')[0]).replace('\\', '/').strip('/')
    if not rel or rel.startswith('/') or any(p in ('', '.', '..') for p in rel.split('/')):
        return None
    full = os.path.abspath(os.path.join(DATA_DIR, rel))
    if full != DATA_DIR and not full.startswith(DATA_DIR + os.sep):
        return None
    return rel

def manifest():
    out = {}
    for dp, _, files in os.walk(DATA_DIR):
        for name in files:
            f = os.path.join(dp, name)
            out[os.path.relpath(f, DATA_DIR).replace(os.sep, '/')] = os.path.getsize(f)
    return out

def have_data():
    return os.path.isfile(os.path.join(DATA_DIR, 'data.json'))

class Handler(SimpleHTTPRequestHandler):
    """The papers, recordings and answer data come from DATA_DIR; the pages come from the React build
    when there is one, and any app route (/t/..., /q/...) gets its index.html so links and refreshes work."""
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def authorised(self):
        """The upload endpoints: only with the token, and only when one is configured at all."""
        given = self.headers.get('X-Upload-Token') or ''
        if not UPLOAD_TOKEN or not hmac.compare_digest(given, UPLOAD_TOKEN):
            self.json_out(403, {'error': 'forbidden'})
            return False
        return True

    def allowed(self):
        """Everything but the /_ endpoints: only for a request the class portal forwarded."""
        if from_the_portal(self.headers):
            return True
        self.json_out(401, {'error': 'Sign in to the class portal to see this.'})
        return False

    def service_get(self):
        """The /_ endpoints. Returns True when it answered."""
        clean = self.path.split('?')[0]
        if clean == '/_health':
            self.json_out(200, {'ok': True, 'data': have_data()})
        elif clean == '/_manifest':
            if self.authorised():
                self.json_out(200, manifest())
        else:
            return False
        return True

    def do_PUT(self):
        if not self.path.startswith('/_upload/'):
            return self.json_out(404, {'error': 'not found'})
        if not self.authorised():
            return
        rel = safe_rel(self.path[len('/_upload/'):])
        if not rel:
            return self.json_out(400, {'error': 'bad path'})
        try:
            length = int(self.headers.get('Content-Length', ''))
        except ValueError:
            return self.json_out(411, {'error': 'Content-Length required'})
        dest = os.path.join(DATA_DIR, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + '.part-' + secrets.token_hex(4)
        try:
            with open(tmp, 'wb') as fh:
                left = length
                while left > 0:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk:
                        raise ConnectionError('body ended early')
                    fh.write(chunk)
                    left -= len(chunk)
            os.replace(tmp, dest)
        except Exception as ex:
            if os.path.exists(tmp):
                os.remove(tmp)
            self.close_connection = True
            return self.json_out(500, {'error': f'write failed ({type(ex).__name__})'})
        self.json_out(200, {'path': rel, 'size': os.path.getsize(dest)})

    def translate_path(self, path):
        clean = path.split('?')[0].split('#')[0]
        in_site = super().translate_path(path)
        if clean != '/' and os.path.isfile(in_site):
            return in_site
        if os.path.isdir(DIST):
            rel = clean.lstrip('/')
            in_dist = os.path.join(DIST, rel)
            if rel and os.path.isfile(in_dist):
                return in_dist
            if not rel.startswith(('api/', 'crops/', 'aud/', 'audio/')):
                return os.path.join(DIST, 'index.html')
        return in_site

    def json_out(self, status, out):
        data = json.dumps(out, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(data.__len__()))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith('/_') and self.service_get():
            return
        if not self.allowed():
            return
        if not self.path.startswith('/api/'):
            if not have_data():
                return self.json_out(503, {'error': 'The question data is not uploaded yet.'})
            if self.headers.get('Range') and self.serve_range():
                return
            return super().do_GET()
        path, _, query = self.path.partition('?')
        qs = dict(parse_qsl(query))
        try:
            out = classroom.get(path, qs)
            status = 200
        except classroom.Bad as b:
            status, out = b.status, {'error': b.msg}
        except Exception as ex:
            status, out = 500, {'error': f'Server error ({type(ex).__name__}).'}
            print('classroom error:', repr(ex)[:300], flush=True)
        self.json_out(status, out)

    def do_HEAD(self):
        if self.path.startswith('/_') and self.service_get():
            return
        if not self.allowed():
            return
        if not self.path.startswith('/api/') and not have_data():
            return self.json_out(503, {'error': 'The question data is not uploaded yet.'})
        return super().do_HEAD()

    def do_POST(self):
        if not self.allowed():
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            if self.path == '/api/check':
                status, out = check(body['id'], body.get('answers', {}))
            elif self.path == '/api/grade':
                status, out = grade(body['id'], body['part'], body.get('answer', ''))
            elif self.path == '/api/tutor':
                status, out = tutor(body)
            elif self.path == '/api/speak':
                status, f = speak(body.get('text', ''), body.get('lang', 'en'))
                if status == 200 and f:
                    data = open(f, 'rb').read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'audio/mpeg')
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Cache-Control', 'public, max-age=31536000')
                    self.end_headers()
                    self.wfile.write(data)
                    return
                out = {'error': 'no voice'}
            else:
                try:
                    status, out = 200, classroom.post(self.path, body)
                except classroom.Bad as b:
                    status, out = b.status, {'error': b.msg}
        except (KeyError, ValueError):
            status, out = 400, {'error': 'bad request'}
        except Exception as ex:  # the model service failing must reach the page as a message, not a hang
            status, out = 502, {'error': f'The marker is unavailable right now ({type(ex).__name__}). Try again.'}
            print('marking error:', repr(ex)[:300], flush=True)
        self.json_out(status, out)

    def serve_range(self):
        """A browser can only move the playhead of a recording when the server honours byte
        ranges; without this every seek snapped back to the start. Returns False to fall through
        to the plain GET (no file, or a range we cannot read)."""
        m = re.match(r'^bytes=(\d*)-(\d*)$', self.headers.get('Range', ''))
        f = self.translate_path(self.path)
        if not m or not os.path.isfile(f):
            return False
        size = os.path.getsize(f)
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = min(int(m.group(2)), size - 1) if m.group(2) and m.group(1) else size - 1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return True
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(f))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        with open(f, 'rb') as fh:
            fh.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = fh.read(min(65536, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)
        return True

    def end_headers(self):
        clean = self.path.split('?')[0]
        if clean.endswith(('.json', '.html', '.css', '.js', '/')) or '.' not in clean.rsplit('/', 1)[-1]:
            self.send_header('Cache-Control', 'no-cache')
        elif clean.endswith(('.mp3', '.m4a', '.wav', '.ogg', '.mp4', '.webm')):
            self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

if __name__ == '__main__':
    print(f'serving {SITE} on http://0.0.0.0:{PORT}' + ('' if have_data() else ' (no data.json yet: static requests answer 503 until upload.py runs)'),
          flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
