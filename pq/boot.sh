#!/bin/sh
# Container entrypoint. The data is not in the image: it lives on the disk at DATA_DIR and is put
# there once with upload.py (see README.md). Until data.json exists the server still starts, answers
# /_health, and gives every static request a 503.
set -e
mkdir -p "${DATA_DIR:-/var/data/site}" "${STATE_DIR:-/var/data/state}"
exec python3 /app/server.py
