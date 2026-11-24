#!/usr/bin/env bash
# Publishes the site's data (site/public/data, from site/export.py) as the `site-data` release's
# site-data.tgz (in parts), then starts the viewer workflow, which builds it into the site image.
#   site/publish-data.sh
set -euo pipefail
cd "$(dirname "$0")/.."
test -f site/public/data/index.json || { echo "no site/public/data/index.json: run site/export.py first" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# A release asset must be under 2 GiB: the tarball goes up in 1.5 GB parts (site-data.tgz.part-aa, -ab, ...)
tar -czf - -C site/public data | split -b 1500M - "$tmp/site-data.tgz.part-"
gh release view site-data >/dev/null 2>&1 \
  || gh release create site-data --title "Site data" --notes "The site's data from site/export.py, built into the site image by .github/workflows/viewer.yml. Replaced by site/publish-data.sh." --latest=false
# Drop the old assets first, so a part left over from a bigger upload can't be joined in
for a in $(gh release view site-data --json assets -q '.assets[].name'); do gh release delete-asset site-data "$a" -y; done
gh release upload site-data "$tmp"/site-data.tgz.part-*
gh workflow run viewer.yml --ref main
echo "published $(du -ch "$tmp"/site-data.tgz.part-* | tail -1 | cut -f1); the viewer workflow is building the image"
