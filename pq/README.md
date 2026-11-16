# pq: the past-questions service

The Python server from `~/studyclix-clone/tools/server.py`, packaged for Render. It serves the
Leaving Cert question data (crops, papers, recordings, answer keys) and marks typed answers with
Claude (OpenAI as the fallback). The hub front end (`~/gg-hub`) is the UI; this service is what the
hub's proxy sends the data and marking requests to. The old React build is not shipped.

Files: `server.py` (HTTP + marking + narrator + upload endpoints), `llm.py` (one structured model
call), `classroom.py` (the exam-classes API over SQLite, unused by the hub but kept working),
`raw/audio_cuts.json` (bundled fallback for aural marking), `upload.py` (puts the data on the
service), `boot.sh`, `Dockerfile`, `requirements.txt`.

## Env vars

| Name | Default | What |
|---|---|---|
| `DATA_DIR` | `pq/site` | the static site: data.json, keys.json, crops/, aud/, papers/, oral/, subjects/, raw/ |
| `TTS_DIR` | `DATA_DIR/tts` | the narrator's mp3 cache (`/api/speak`) |
| `STATE_DIR` | `/var/data/state` | writable state: `classroom.db` |
| `PORT` | `5410` | listen port (binds 0.0.0.0); `python3 server.py 5499` still overrides |
| `DIST_DIR` | `pq/dist` | optional React build for app routes; absent on Render |
| `PQ_UPLOAD_TOKEN` | unset | enables `GET /_manifest` and `PUT /_upload/...`; unset means both refuse (403) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` | | marking via Claude (a workspace key with no expiry) |
| `OPENAI_API_KEY` | | marking fallback when the Anthropic key is rejected |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | region `northeurope` | the narrator (`/api/speak`); without a key it answers 404 |

A `pq/.env` beside the code is read for local runs (never committed). The uploader reads
`PQ_SERVICE_URL` and `PQ_UPLOAD_TOKEN` from the environment.

## Run locally

    cd ~/gg-homework-portal/pq
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    DATA_DIR=~/studyclix-clone/site STATE_DIR=/tmp/pq-state PORT=5499 .venv/bin/python3 server.py
    curl -I http://127.0.0.1:5499/data.json                               # 200
    curl -s -H 'Range: bytes=0-99' http://127.0.0.1:5499/aud/2014_A.mp3 | wc -c   # 206, 100 bytes

Or the container: `docker build -t pq pq` from the repo root (the build context is `pq/` itself),
then `docker run -p 10000:10000 -v pq-data:/var/data -e PQ_UPLOAD_TOKEN=... pq`.

## Putting the data on the service

The image holds only the code. The ~650 MB of data goes onto the service's disk once, over HTTPS,
with the token:

    cd ~/gg-homework-portal/pq
    .venv/bin/python3 upload.py --dry-run                    # 2,793 files, 651 MB; no URL or token needed
    PQ_SERVICE_URL=https://gg-past-questions.onrender.com PQ_UPLOAD_TOKEN=... .venv/bin/python3 upload.py

It walks `~/studyclix-clone/site` (`--site` to change), skipping `site/audio` (581 MB of uncut
recordings that nothing references; the hub plays `aud/`) and the `tts/` cache, and adds the
marking inputs the server reads as `raw/audio_cuts.json` and `raw/transcripts/<year>.json`. It
fetches `/_manifest` first and skips every file already there with the same size, so a rerun after
a dropped connection only sends what is missing; 6 workers (`--workers`), 3 tries per file.
`--only oral --only data.json` limits it to top-level folders or files. Rerun it whenever the
clone's `site/` changes (new year, re-cut crops): changed files have a new size and go up again;
a file that changed but kept its size will not, so delete it on the service first or re-upload
with a fresh `--only`.

The upload endpoints: `GET /_manifest` returns `{path: size}` for everything under `DATA_DIR`;
`PUT /_upload/<relative path>` writes the body to `DATA_DIR/<path>` (parents created, written to a
temp name then renamed). Both need `X-Upload-Token` equal to `PQ_UPLOAD_TOKEN`, refuse `..` and
absolute paths, and are off entirely while the env var is unset. Everything under `DATA_DIR` is
served publicly, `raw/` included (the Whisper transcripts); none of it is secret.

Until `data.json` exists every static request answers `503 {"error": "The question data is not
uploaded yet."}`; `/_health` is 200 regardless and reports `"data": false/true`.

## What the service answers

Static, straight from `DATA_DIR` (GET and HEAD; byte ranges honoured on GET for seeking):

- `/data.json`, `/keys.json`, `/resources.json`, `/papers.json`, `/lessons.json`, `/grammar.json`,
  `/oral.json`, `/subjects.json`, `/ms_regions.json`
- `/crops/...` (question and scheme images), `/aud/<year>_<A|B|C>.mp3` (aural sections),
  `/papers/<year>_<P1|P2|MS|AURAL>.pdf`, `/papers/thumbs/...png`, `/papers/audio/<year>.mp3`,
  `/oral/sp/...jpg`, `/subjects/<subject>/<level>/{data,keys}.json`, `/raw/...`
- `/index.html`, `/app.css`, `/portal.css`, `/logo.webp` (the old standalone page; harmless)

APIs (JSON unless noted):

- `POST /api/check` `{"id", "answers": {key: text}}` -> `{"results": [...], "provider"}`
- `POST /api/grade` `{"id", "part", "answer"}` -> `{"awarded", "max", "feedback", "points"}`
- `POST /api/tutor` `{"item", "answered", "given", "question"}` -> `{"text"}`
- `POST /api/speak` `{"text", "lang": "ga"|"en"}` -> `audio/mpeg` (404 without an Azure key)
- `GET/POST /api/teacher`, `/api/classes...`, `/api/assignments...`, `/api/join`, `/api/student`,
  `/api/submit`, `/api/homework`, `/api/demo` (classroom.py; the hub does not use these)
- `GET /_health`, `GET /_manifest`, `PUT /_upload/<path>` (above)

The hub's dev proxy (`~/gg-hub/web/vite.config.ts`) already forwards `/api` (minus the hub's own
`/api/auth`, `/api/student`, `/api/admin`, `/api/settings`, `/api/media`, `/api/live`,
`/api/sraith`, `/api/mock-oral`, `/api/hub`), the json files above, `/papers/`, `/oral/sp/`,
`/crops`, `/aud`, `/audio` and `/subjects/` to this service; `/audio` can be dropped, nothing
uses it. Note `/api/student` is claimed by the hub, so the classroom's `/api/student` is not
reachable through the hub (it never was).

## Render service shape

- runtime `docker`, `rootDir: pq` (the Dockerfile and its build context are this folder; that is what
  `render.yaml` in the repo root declares under `gg-past-questions`)
- one instance, with a disk: 3 GB mounted at `/var/data` (data is 651 MB plus the narrator cache)
- env: `DATA_DIR=/var/data/site`, `STATE_DIR=/var/data/state`, `PORT=10000`, `PQ_UPLOAD_TOKEN`
  (sync: false), `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `OPENAI_API_KEY`,
  `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
- `healthCheckPath: /_health`
- region frankfurt, like the portal

After the first deploy run `upload.py` (above) once against the public URL, then set the portal's
`PQ_SERVICE_URL` to the internal address (`http://gg-past-questions:10000`). Redeploys keep the
disk, so the data stays; only a new disk needs the upload again. `render.yaml` in the repo root
already carries this service; it still lacks `ANTHROPIC_WORKSPACE_ID` and `OPENAI_API_KEY`, which
`llm.py` uses when they are set (the workspace header, and the fallback marker).

```yaml
  - type: web
    name: gg-past-questions
    runtime: docker
    rootDir: pq
    region: frankfurt
    plan: starter
    numInstances: 1
    healthCheckPath: /_health
    disk:
      name: pq-data
      mountPath: /var/data
      sizeGB: 3
    envVars:
      - key: DATA_DIR
        value: /var/data/site
      - key: STATE_DIR
        value: /var/data/state
      - key: PORT
        value: "10000"
      - key: PQ_UPLOAD_TOKEN
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: ANTHROPIC_WORKSPACE_ID
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: AZURE_SPEECH_KEY
        sync: false
      - key: AZURE_SPEECH_REGION
        value: northeurope
```
