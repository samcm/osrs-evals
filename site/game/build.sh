#!/usr/bin/env bash
# Regenerates the site's game art and brand marks.
#   site/game/build.sh [all|brands|quests|art|avatars]     (default: all)
# brands:  brands.py  -> public/assets/brands/*.svg, SOURCES.md, public/assets/fonts/  (npm, network)
# quests:  quests.py  -> game/quests.json, from the image's content scripts
# art:     art.ts     -> public/assets/{items,quests,skills,ui,map}/, brands/program.png, game/skills.json
# avatars: avatars.ts -> public/data/runs/<id>.avatar.png and .head.png for runs that lack them
# Game art comes from the rs-sdk image (rs-sdk at 71d949d, its packed 2004scape cache inside); it is
# Jagex's. One container at a time, removed after.
set -euo pipefail
IMAGE=${IMAGE:-rs-sdk:71d949d}
SITE=$(cd "$(dirname "$0")/.." && pwd)
step=${1:-all}

run() { docker run --rm -u "$(id -u):$(id -g)" -v "$SITE:/site" --entrypoint bun "$IMAGE" "$@"; }

if [[ $step == all || $step == brands ]]; then
    python3 "$SITE/game/brands.py"
fi
if [[ $step == all || $step == quests ]]; then
    tmp=$(mktemp -d)
    cid=$(docker create "$IMAGE")
    docker cp -q "$cid:/opt/server/content/scripts" "$tmp/scripts"
    docker cp -q "$cid:/opt/server/content/pack" "$tmp/pack"
    docker rm "$cid" >/dev/null
    python3 "$SITE/game/quests.py" "$tmp" > "$SITE/game/quests.json"
    rm -rf "$tmp"
fi
if [[ $step == all || $step == art ]]; then
    run /site/game/art.ts
fi
if [[ $step == all || $step == avatars ]]; then
    run /site/game/avatars.ts
fi
