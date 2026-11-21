#!/usr/bin/env bash
# Publishes the site's data (site/public/data, from site/export.py) as the `site-data` release's
# site-data.tgz, then starts the viewer workflow, which builds it into the site image.
#   site/publish-data.sh
set -euo pipefail
cd "$(dirname "$0")/.."
test -f site/public/data/index.json || { echo "no site/public/data/index.json: run site/export.py first" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar -czf "$tmp/site-data.tgz" -C site/public data
gh release view site-data >/dev/null 2>&1 \
  || gh release create site-data --title "Site data" --notes "The site's data from site/export.py, built into the site image by .github/workflows/viewer.yml. Replaced by site/publish-data.sh." --latest=false
gh release upload site-data "$tmp/site-data.tgz" --clobber
gh workflow run viewer.yml --ref main
echo "published $(du -h "$tmp/site-data.tgz" | cut -f1); the viewer workflow is building the image"
