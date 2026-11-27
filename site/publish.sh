#!/usr/bin/env bash
# Publishes the site: checks and unpacks new run packages, exports every published run log, renders
# new runs' characters and end screenshots, and uploads the data (site/publish-data.sh), which
# rebuilds the site image.
#   site/publish.sh [package.tgz ...]
# A package is a gzipped tarball of logs/<dir>/... with <package>.sha256 beside it. The run logs
# under logs/ are not in git; the site data, if absent, comes from the `site-data` release, which
# keeps what no export makes (summaries, facts, compares, character renders, end screenshots).
# Needs Docker with buildx, bun, pnpm, agent-browser, ffmpeg, ImageMagick and an authenticated gh.
set -euo pipefail
cd "$(dirname "$0")/.."

for p in "$@"; do (cd "$(dirname "$p")" && sha256sum -c --quiet "$(basename "$p").sha256"); done
for p in "$@"; do tar -xzf "$p"; done
[ -d .cache/site-data ] && [ ! -e site/public/data ] && mv .cache/site-data site/public/data

VENV=${VENV:-.venv}
[ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" install -q -r site/requirements.txt; }
source "$VENV/bin/activate"
export PYTHONPATH=.

# Orbs boot with Docker stopped and the user outside the docker group.
docker info >/dev/null 2>&1 || { sudo systemctl start docker && sudo chmod 666 /var/run/docker.sock; }
docker buildx version >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker-buildx-plugin >/dev/null
docker image inspect rs-sdk:71d949d >/dev/null 2>&1 || BASE_ONLY=1 image/build.sh >/tmp/build-rs-sdk.log 2>&1
if [ ! -f .cache/rs-world/index.html ]; then
    docker build -q -f viewer/Dockerfile --target rs-world --build-arg WORLD_IMAGE=rs-sdk:71d949d -t rs-world:build . >/dev/null
    cid=$(docker create rs-world:build)
    mkdir -p .cache && docker cp -q "$cid:/rs-world/build" .cache/rs-world
    docker rm "$cid" >/dev/null && docker rmi rs-world:build >/dev/null && docker builder prune -af >/dev/null
fi

if [ ! -f site/public/data/index.json ]; then
    mkdir -p site/public
    for a in $(gh release view site-data --json assets -q '.assets[].name' | sort); do gh release download site-data -p "$a" -O -; done \
        | tar -xzf - -C site/public
fi

git pull -q --rebase origin main
LOGS=()
for d in logs/big-* logs/hq-*; do [ -d "$d" ] && LOGS+=("$d"); done
python site/export.py "${LOGS[@]}" | cut -c1-200
bash site/game/build.sh avatars | tail -1
# Vite copies public/ into dist/, and serve.ts serves the data from public/data, so build without it
mv site/public/data .cache/site-data
built=0
(cd site && pnpm install -s --frozen-lockfile && pnpm build >/dev/null) || built=$?
mv .cache/site-data site/public/data
[ "$built" = 0 ]
amp orb services ensure >/dev/null
timeout 1800 bun site/capture.ts | tail -1
python site/export.py "${LOGS[@]}" | cut -c1-120
site/publish-data.sh | tail -2
