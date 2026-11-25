#!/bin/sh
# Build the world image from rs-sdk at a pinned commit. Run once per machine that runs evals
# (or push the result to a registry the sandbox can pull from).
#   image/build.sh [rs-sdk commit]
set -eu
COMMIT=${1:-71d949d}
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${RS_SDK_SRC:-$HERE/../.cache/rs-sdk}

if [ ! -d "$SRC/.git" ]; then
  git clone https://github.com/MaxBittker/rs-sdk "$SRC"
fi
git -C "$SRC" fetch -q origin
git -C "$SRC" checkout -q "$COMMIT"

DOCKER_BUILDKIT=1 docker build -f "$SRC/server/Dockerfile" -t "rs-sdk:$COMMIT" "$SRC"
# BASE_ONLY=1: stop at rs-sdk's server image, which has the game cache (all the site needs)
[ "${BASE_ONLY:-}" = 1 ] && exit 0
docker build -f "$HERE/Dockerfile" --build-arg "RS_SDK_IMAGE=rs-sdk:$COMMIT" -t "rs-evals-world:$COMMIT" "$SRC/server"
