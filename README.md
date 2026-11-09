# ArtHop

A free, unofficial planner for Amsterdam Art Week (Wed 18 to Sun 22 Nov 2026): the whole programme (172 entries at
85 venues) on one map, day by day, with each day's theme and opening hours. Your plan for a day is drawn on the map:
a colour per stop for what it is, a size for how long you stay, a bold black line for the walk. Everything MuseumHop
does is here too: shared and personal plans, route ideas, reactions and Decide, crews with meet-up points, a timeline
with walking times and clashes, live sync, personal links and view-only links. Not affiliated with Amsterdam Art Week.

Built from MuseumHop (`~/Claude/museumhop`, weareaiforfun-hub/museumhop) in November 2026.

## Stack
- Vite + React + TypeScript, Leaflet on PDOK tiles (grey, with a cream wash), lucide icons.
- Supabase: the shared **to-one** project, with ArtHop's tables, functions, policies and cron jobs prefixed `ah_`
  (MuseumHop's are `na_`; never touch those). Migrations in `supabase/migrations/`.
- Programme: `npm run import` (`scripts/import-artweek.mjs`) reads amsterdamart.com's programme, entry and location
  pages at about one request a second and writes `src/data/catalogue.json`: titles, dates, times, places, addresses,
  pins, types and admission only, never descriptions or images. Hours: an entry's or venue's own listing, widened
  to the participant terms for galleries (Thu 13–21, Fri–Sat 12–18, Sun 12–17) and project spaces (Fri–Sat 12–18,
  Sun 12–17). Neighbourhoods and missing pins come from PDOK's address lookup. Pages are cached in `scripts/.cache`.
- Travel times: `npm run walk-matrix` (OSRM foot, bike and car tables between venues).
- Suggested routes: `node scripts/build-route-ideas.mjs` (hand-picked entries, times worked out to fit).

## How it holds together
- A group ("night" in the code and tables) is reached only through its invite link (`#night=<token>`; the database
  stores a hash). Anonymous sign-ins happen only when someone saves a plan, tagged `app=arthop`.
- Routes hold all five days; every stop has a `day`. `derive(data, userId, day)` gives the stops of one day.
  `setCurrentDay()` in `src/lib/catalogue.ts` tells opening-hour checks (timeline, clashes, suggested order) which
  day they're on.
- Stops are one row each with a fractional position, so two people's edits both apply. `src/lib/sync.ts` applies
  changes at once, queues them offline and patches state from Realtime; undo replays the inverse.
- Retention: the `arthop-retention` cron job deletes every group 30 days after Art Week (23 Dec 2026), plus ArtHop
  sign-ins left without a group.
- Checks: `npm run check-access` runs the access rules against the real database and leaves "access-check" groups
  behind; delete them afterwards.

## Using Art Week's programme (legal check, 10 Nov 2026; not legal advice)
amsterdamart.com has no terms of use; facts plus links are fine as long as ArtHop keeps to these:
1. Facts only: titles, times, places, admission. No descriptions or images. Every item links to its amsterdamart.com page.
2. Every page says "Unofficial fan planner, not affiliated with Amsterdam Art Week. Times can change: always check the
   official page.", names amsterdamart.com as the source with a link, and shows a contact address
   (`src/components/site-note.tsx`, plus the view-only page, Print my day and the pause page).
3. The programme refreshes at most once or twice a day, at a gentle pace: `.github/workflows/refresh.yml` runs once a
   day at 05:40, and `import-artweek.mjs --fresh` refuses a second fresh fetch within 12 hours (`--force` overrides).
4. The site can be paused within minutes (below).

## Pausing the site
If the organisers object, or anything else needs the site offline fast:
```
scripts/pause.sh          # publishes a short notice instead of the planner, in about 1–2 minutes
scripts/pause.sh resume   # brings the planner back
```
It commits a `PAUSED` file to `main` and pushes; the deploy workflow then publishes only `pause/index.html` (also as
404.html, so invite links land on it) and the daily refresh stops. Data in the database stays as it is and is still
deleted on 23 Dec 2026. Without a terminal: create a file named `PAUSED` in the repo on github.com and commit it.

## Run
```
npm install
npm run dev        # http://localhost:5191
npm run build
```
`.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the public key). Deploys to GitHub Pages
through `.github/workflows/deploy.yml` with the same two names as repository variables.
