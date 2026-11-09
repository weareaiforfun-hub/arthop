#!/usr/bin/env bash
# Pauses or resumes the live site in a couple of minutes, for example if Amsterdam Art Week's organisers object.
#   scripts/pause.sh          swap the site for the short notice in pause/index.html, and publish
#   scripts/pause.sh resume   bring the planner back, and publish
# How: a file named PAUSED at the top of the repo tells .github/workflows/deploy.yml to publish only the notice
# (also as 404.html, so every link and invite lands on it). The daily programme refresh stops while it exists.
# Groups' data stays in the database untouched, and is deleted on schedule (23 Dec 2026).
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main
git checkout -q main
git pull -q --ff-only origin main
if [ "${1:-pause}" = "resume" ]; then
  [ -f PAUSED ] || { echo "The site isn't paused."; exit 0; }
  git rm -q PAUSED
  git commit -q -m "Resume ArtHop"
else
  [ -f PAUSED ] && { echo "Already paused."; exit 0; }
  printf 'Paused on %s. Remove this file (scripts/pause.sh resume) to bring the planner back.\n' "$(date '+%Y-%m-%d %H:%M')" > PAUSED
  git add PAUSED
  git commit -q -m "Pause ArtHop"
fi
git push -q origin main
echo "Pushed. GitHub Actions publishes it in about 1–2 minutes: https://github.com/weareaiforfun-hub/arthop/actions"
