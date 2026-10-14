#!/bin/bash
# website/ and super-admin/ live in this monorepo AND in their own GitHub repos.
# This repo is the source of truth: edit here, commit here, then run this to copy each folder's history to its mirror.
#   ./mirror-repos.sh            both mirrors
#   ./mirror-repos.sh website    just one (website | super-admin)
# Never commit directly in the mirror repos; if someone does, run `git subtree pull --prefix=<folder> <url> main` first.
set -e
cd "$(git rev-parse --show-toplevel)"

declare -A MIRRORS=(
  [website]="https://github.com/gemmyconnectltd/pesaa-website.git"
  [super-admin]="https://github.com/gemmyconnectltd/pesaa-admin-portal.git"
)

for folder in "${!MIRRORS[@]}"; do
  [ -n "$1" ] && [ "$1" != "$folder" ] && continue
  echo "→ mirroring $folder to ${MIRRORS[$folder]}"
  git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 subtree push --prefix="$folder" "${MIRRORS[$folder]}" main
done
echo "✅ mirrors up to date"
