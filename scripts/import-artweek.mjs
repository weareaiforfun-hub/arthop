// Imports the Amsterdam Art Week 2026 programme (18–22 Nov) into src/data/catalogue.json.
// Facts only: titles, dates, times, places, addresses, coordinates, types and admission. No descriptions or images.
//
// Sources, all public and allowed by amsterdamart.com/robots.txt:
//   1. /en/programme/            the list of this week's entries (about 173) with their categories
//   2. /en/programme/<slug>/     each entry: date and time, location, address, admission, opening hours
//   3. /en/locations/<slug>/     each venue: address, opening hours, map pin; its map script also lists every
//                                participating location with its type (galleries, project spaces, museums, ...)
//   4. api.pdok.nl locatieserver the Dutch government's address lookup, for the neighbourhood name and for
//                                venues without a map pin
// Hours by venue type come from Art Week's participant terms (see TERMS below).
//
// Pages are cached in scripts/.cache (gitignored), so a rerun only fetches what's missing. Pass --fresh to refetch.
// Run: node scripts/import-artweek.mjs   then: npm run walk-matrix
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const BASE = "https://amsterdamart.com";
const UA = "ArtHop-planner/0.1 (free unofficial fan planner; https://arthop.arian-shafa.xyz)";
const CACHE = new URL("./.cache/", import.meta.url);
const DAYS = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const WEEKDAY = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };

// Participant terms 2026, by venue type: what participating venues commit to during the week.
// Galleries: Thu 13–21 (17–21 Festive Gallery Night), Fri and Sat 12–18, Sun 12–17.
// Project spaces: Fri and Sat 12–18 (plus possible evening events), Sun 12–17. Museums: their regular hours.
const TERMS = {
  gallery: { "2026-11-19": ["13:00", "21:00"], "2026-11-20": ["12:00", "18:00"], "2026-11-21": ["12:00", "18:00"], "2026-11-22": ["12:00", "17:00"] },
  "project-space": { "2026-11-20": ["12:00", "18:00"], "2026-11-21": ["12:00", "18:00"], "2026-11-22": ["12:00", "17:00"] },
};
/** Places named in an entry without a location page, that are one short street: pinned at the street's middle. */
const STREETS = { "Hazenstraat Galleries": "Hazenstraat" };
const KIND = { "galleries-en": "gallery", "project-spaces-en": "project-space", "museums-en": "museum", "partners-en": "partner", "residencies-en": "residency", "corporate-collections-en": "corporate", "other-en": "other" };

// A gentle pace: at most one fresh import every 12 hours (twice a day), unless --force. A rerun from the cache is free.
const OUT = new URL("../src/data/catalogue.json", import.meta.url);
if (process.argv.includes("--fresh")) {
  const last = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).importedAtTime : null;
  if (last && Date.now() - Date.parse(last) < 12 * 3600e3 && !process.argv.includes("--force")) {
    console.log(`The programme was imported at ${last}, less than 12 hours ago. Not fetching again (use --force to override).`);
    process.exit(0);
  }
  rmSync(CACHE, { recursive: true, force: true });
}
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;
async function get(url, { json = false, missingOk = false } = {}) {
  const file = new URL(url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9.-]+/g, "_").slice(0, 200) + (json ? ".json" : ".html"), CACHE);
  if (existsSync(file)) return json ? JSON.parse(readFileSync(file, "utf8")) : readFileSync(file, "utf8");
  const wait = 1200 - (Date.now() - lastFetch); // about one request a second: a polite pace
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: json ? "application/json" : "text/html" } });
    if (res.ok) {
      const body = await res.text();
      writeFileSync(file, body);
      return json ? JSON.parse(body) : body;
    }
    if (res.status === 404 && missingOk) return null;
    if (attempt >= 3 || res.status < 500) throw new Error(`${res.status} for ${url}`);
    await sleep(5000 * attempt);
  }
}

const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const text = (s) => decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const slug = (url) => url.replace(/\/$/, "").split("/").pop();
const hhmm = (s) => s.replace(".", ":").padStart(5, "0");

/** "<li><span>Thursday</span> 13:00—18:00</li>" → { 4: ["13:00","18:00"] } by weekday number. */
function openingList(html) {
  const out = {};
  for (const m of html.matchAll(/<li><span>(\w+)<\/span>\s*([\d.:]+)\s*[—–-]\s*([\d.:]+)\s*<\/li>/g)) if (m[1] in WEEKDAY) out[WEEKDAY[m[1]]] = [hhmm(m[2]), hhmm(m[3])];
  return Object.keys(out).length ? out : null;
}
const weekdayOf = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const byWeekday = (list) => (list ? Object.fromEntries(DAYS.filter((d) => list[weekdayOf(d)]).map((d) => [d, list[weekdayOf(d)]])) : null);
const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Reads the sidebar's date lines into the event days it covers and an optional fixed time. */
function parseDates(lines) {
  const days = new Set();
  const times = [];
  let raw = [];
  for (const line of lines) {
    raw.push(line);
    for (const t of line.matchAll(/(\d{1,2}[:.]\d{2})\s*[—–-]\s*(\d{1,2}[:.]\d{2})/g)) times.push([hhmm(t[1]), hhmm(t[2])]);
    const single = /^(?:\w+day )?(\d{1,2}) (\w+) (\d{4})$/.exec(line.replace(/\s*\d{1,2}[:.]\d{2}.*$/, "").trim());
    const range = /(\d{1,2})(?: (\w+))?(?: (\d{4}))? up to (\d{1,2}) (\w+) (\d{4})/.exec(line);
    if (range) {
      const [, d1, m1, y1, d2, m2, y2] = range;
      const start = iso(+(y1 || y2), MONTHS[m1 || m2], +d1), end = iso(+y2, MONTHS[m2], +d2);
      for (const d of DAYS) if (d >= start && d <= end) days.add(d);
    } else if (single && MONTHS[single[2]]) {
      const d = iso(+single[3], MONTHS[single[2]], +single[1]);
      if (DAYS.includes(d)) days.add(d);
    }
  }
  return { days: DAYS.filter((d) => days.has(d)), time: times[0] ?? null, raw: raw.join(" · ") };
}

const hull = (a, b) => (!a ? b : !b ? a : [a[0] < b[0] ? a[0] : b[0], a[1] > b[1] ? a[1] : b[1]]);

// ---- 1. The programme list ----
const listHtml = await get(`${BASE}/en/programme/`);
const tiles = new Map();
for (const [, tile] of listHtml.matchAll(/<article class="event-tile">([\s\S]*?)<\/article>/g)) {
  const href = /href="([^"]+)"/.exec(tile)?.[1];
  if (!href || tiles.has(href)) continue;
  const cats = /event-categories">\s*<span>([\s\S]*?)<\/span>/.exec(tile)?.[1] ?? "";
  const [types, disciplines] = decode(cats).replace(/\s+/g, " ").split("—").map((s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  const family = /Family Sunday/.test(tile);
  tiles.set(href, { types: types ?? [], disciplines: disciplines ?? [], family });
}
console.log(`programme: ${tiles.size} entries`);

// ---- 2. Each entry ----
const entries = [];
let n = 0;
for (const [url, tile] of tiles) {
  n++;
  const html = await get(url);
  const title = text(/<h1 class="single-title">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "").join(" ");
  const side = /<div class="event-sidebar">([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? "";
  const field = (name) => new RegExp(`<dt>${name}:?\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`).exec(side)?.[1] ?? "";
  const dateLines = text(field("Date"));
  const locHtml = field("Location");
  const locUrl = /href="([^"]+)"/.exec(locHtml)?.[1] ?? null;
  const locLines = text(locHtml).map((l) => l.replace(/^→\s*/, ""));
  const admission = text(field("Admission")).join(" ").replace(/^→\s*/, "") || null;
  const open = byWeekday(openingList(field("Open")));
  const dates = parseDates(dateLines);
  entries.push({ url, title, tile, locUrl, locName: locLines[0] ?? null, address: locLines.slice(1).join(", ") || null, admission, open, dates });
  if (n % 25 === 0) console.log(`  ${n}/${tiles.size} entries`);
}

// ---- 3. Each location ----
let markers = null;
const locations = new Map();
for (const e of entries) {
  if (!e.locUrl && e.locName) e.locUrl = "name:" + e.locName; // a location named in the entry but not linked
  if (!e.locUrl || locations.has(e.locUrl)) continue;
  if (e.locUrl.startsWith("name:")) { locations.set(e.locUrl, { url: e.locUrl, name: e.locName, address: e.address, lat: null, lng: null, open: null }); continue; }
  // A location that isn't published yet links as "?post_type=location_type&p=..." and answers 404: keep the entry's own facts.
  const html = (await get(e.locUrl, { missingOk: true })) ?? "";
  if (!html) console.warn(`  location page missing for ${e.locName} (${e.locUrl}); using the entry's address`);
  if (!markers) {
    const m = /var markerspecs = (\[[\s\S]*?\]);/.exec(html);
    markers = m ? JSON.parse(m[1]) : [];
  }
  const name = text(/<h1 class="single-title">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "").join(" ");
  const side = /<div class="location-sidebar">([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? "";
  const address = text(/<dt>Address:<\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(side)?.[1] ?? "").join(", ") || e.address;
  const pin = [...html.matchAll(/LatLng\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)/g)][0];
  locations.set(e.locUrl, { url: e.locUrl, name: name || e.locName, address, lat: pin ? +pin[1] : null, lng: pin ? +pin[2] : null, open: byWeekday(openingList(side)) });
}
const norm = (s) => decode(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const markerBy = new Map((markers ?? []).flatMap((m) => [[m.link, m], [norm(m.name), m]]));
console.log(`locations: ${locations.size} (map script lists ${markers?.length ?? 0})`);

// ---- 4. Neighbourhood names and missing pins, from PDOK ----
for (const loc of locations.values()) {
  const m = markerBy.get(loc.url) ?? markerBy.get(norm(loc.name));
  if (loc.lat == null && m?.latitude) { loc.lat = +m.latitude; loc.lng = +m.longitude; }
  loc.kind = KIND[JSON.parse(m?.filterCats || "[]")[0]] ?? "other";
  // Some entries name a place without linking it: an address inside the name, or a short street of galleries.
  if (!loc.address) {
    const inName = /,\s*([^,]+\s\d+\w?)\s*$/.exec(loc.name);
    if (inName) { loc.address = inName[1] + ", Amsterdam"; loc.name = loc.name.slice(0, inName.index).trim(); }
    else if (STREETS[loc.name]) { loc.address = STREETS[loc.name] + ", Amsterdam"; loc.street = true; }
    else continue; // e.g. "Lijnbaansgracht galleries": a long canal, so no pin rather than a wrong one
  }
  const q = loc.address.replace(/,?\s*Amsterdam\s*$/i, "") + " Amsterdam";
  try {
    const res = await get(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&fq=type:${loc.street ? "weg" : "adres"}&rows=1&fl=weergavenaam,wijknaam,buurtnaam,stadsdeelnaam,centroide_ll`, { json: true });
    const doc = res.response?.docs?.[0];
    if (doc) {
      loc.area = doc.wijknaam ?? doc.stadsdeelnaam ?? null;
      loc.district = doc.stadsdeelnaam ?? null;
      if (loc.lat == null) {
        const p = /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll ?? "");
        if (p) { loc.lng = +p[1]; loc.lat = +p[2]; loc.pinSource = loc.street ? "middle of the street (PDOK), approximate" : "address (PDOK)"; }
      }
    }
  } catch (err) { console.warn(`  PDOK lookup failed for ${loc.name}: ${err.message}`); }
}

// ---- 5. Build the catalogue ----
/** Ids must fit the database's event id pattern (a-z, 0-9, _ and -); unpublished locations have no slug, so use the name. */
const safeId = (s) => decodeURIComponent(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);
const venueId = (url) => safeId(/[?&]p=|^name:/.test(url) ? locations.get(url).name : slug(url));
/** Hours on each event day from a listing (venue or exhibition), widened to the participant terms for galleries and
 *  project spaces. A day the listing leaves out is closed; with no listing at all, only the terms count. */
function listedHours(open, kind) {
  const out = {};
  for (const d of DAYS) {
    const h = hull(open?.[d] ?? null, TERMS[kind]?.[d] ?? null);
    if (h) out[d] = h;
  }
  return out;
}
const venueHours = (loc) => listedHours(loc.open, loc.kind);
const cleanAddress = (a) => a && a.replace(/,\s*,/g, ",").replace(/(,\s*Amsterdam)+\s*$/i, ", Amsterdam").replace(/\s+/g, " ").trim();
const museums = [...locations.values()].map((loc) => ({
  id: venueId(loc.url), name: loc.name, url: /^https?:/.test(loc.url) && !/[?&]p=/.test(loc.url) ? loc.url : null, address: cleanAddress(loc.address), kind: loc.kind, area: loc.area ?? null, district: loc.district ?? null,
  lat: loc.lat, lng: loc.lng, pinSource: loc.pinSource ?? (loc.lat != null ? "Art Week location page" : null),
  hours: venueHours(loc), listedHours: !!loc.open,
  accessible: null, // Art Week's pages don't list step-free access
})).sort((a, b) => a.name.localeCompare(b.name));
const venueBy = new Map(museums.map((v) => [v.url, v]));

const GENERIC = new Set(["Events", "Exhibitions"]);
const events = [];
const dropped = [];
for (const e of entries) {
  const venue = e.locUrl ? venueBy.get(e.locUrl) : null;
  const exhibition = e.tile.types.includes("Exhibitions");
  // Per day: a fixed time from the entry wins; then the entry's own opening list; then the venue's hours. A listing
  // that leaves a day out means closed that day (left out here); null means on, but no hours are listed anywhere.
  const days = {};
  const own = e.open ? listedHours(e.open, venue?.kind) : null;
  const known = !!e.open || !!venue?.listedHours || !!TERMS[venue?.kind];
  for (const d of e.dates.days) {
    const h = e.dates.time ?? (own ? own[d] : venue?.hours?.[d]) ?? null;
    if (h || !known) days[d] = h;
  }
  if (!Object.keys(days).length) { dropped.push(`${e.title} (${e.dates.raw || "no date"})`); continue; }
  const tags = [exhibition ? "Exhibition" : /^opening\b/i.test(e.title) ? "Opening" : null, ...e.tile.types.filter((t) => !GENERIC.has(t))].filter(Boolean);
  events.push({
    id: safeId(slug(e.url)), url: e.url, title: e.title, venue: venue?.name ?? e.locName ?? "Location to be announced", museumId: venue?.id ?? null,
    kind: exhibition ? "exhibition" : "event", tags: [...new Set(tags.length ? tags : ["Event"])], disciplines: e.tile.disciplines,
    days, dates: e.dates.raw, admission: e.admission, family: e.tile.family || undefined,
  });
}
events.sort((a, b) => a.title.localeCompare(b.title));

// A sanity check before overwriting: if the site changed shape, keep yesterday's programme instead of a broken one.
if (events.length < 100 || museums.length < 40) { console.error(`Only ${events.length} entries at ${museums.length} venues: the pages may have changed. Keeping the old catalogue.`); process.exit(1); }
const out = { source: `${BASE}/en/programme/`, importedAt: new Date().toISOString().slice(0, 10), importedAtTime: new Date().toISOString(), days: DAYS, museums, events };
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${events.length} entries at ${museums.length} venues (${museums.filter((m) => m.lat == null).length} without a pin)`);
if (dropped.length) console.log(`skipped, not on 18–22 Nov:\n  ${dropped.join("\n  ")}`);
const noHours = events.filter((e) => Object.values(e.days).some((h) => !h));
if (noHours.length) console.log(`${noHours.length} entries have a day without listed hours`);
