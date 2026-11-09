// Builds the suggested routes (src/data/route-ideas.json) from hand-picked programme entries: works out arrival times
// from the walking table and opening hours, so every stop fits. Titles and notes are ours; facts come from the
// catalogue. Re-run after a new import: node scripts/build-route-ideas.mjs
import { readFileSync, writeFileSync } from "node:fs";
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const cat = read("../src/data/catalogue.json"), walk = read("../src/data/walk.json");
const ev = new Map(cat.events.map((e) => [e.id, e])), venues = new Map(cat.museums.map((m) => [m.id, m]));
const idx = new Map(walk.ids.map((id, i) => [id, i]));
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return (h < 6 ? h + 24 : h) * 60 + m; };
const clock = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const legMin = (a, b) => (!a || !b || a === b ? 0 : walk.minutes[idx.get(a)]?.[idx.get(b)] ?? 15);
const up5 = (n) => Math.ceil(n / 5) * 5;
const discipline = (e) => (e.disciplines.find((d) => d !== "Mixed Media" && d !== "Other") ?? e.disciplines[0] ?? "Art").replace(" | Film", "");

const ROUTES = [
  { day: "2026-11-18", name: "Opening day", title: "Opening day: Museumplein to the Plantage", start: "09:00",
    description: "Start the week with the artist talk at the Stedelijk, stay for the show, then walk through De Pijp to an evening opening near Weesperplein.",
    practical: "On foot, about 09:00–18:00 with a long lunch gap. The talk and de Appel need tickets; the opening is free.",
    stops: [["artist-talk-adam-pendleton", 75, true], ["some-wild-kind-of-language-adam-pendleton", 60], ["names-in-our-veins", 45], ["lapdogs-of-the-bourgeoisie-2026-class-hegemony-in-contemporary-art", 45], ["opening-omen-gabriel-lester", 60, true]] },
  { day: "2026-11-19", name: "Gallery Night", title: "Gallery Night in the Jordaan", start: "17:00",
    description: "Six galleries a few minutes apart, open late for Festive Gallery Night, with a book launch in the middle and the after party to finish.",
    practical: "On foot, 17:00–21:00. Everything here is free. The after party is a maybe: it starts at 21:00 in the Oude Zijde.",
    stops: [["this-way-maaike-schoorel", 30], ["solo-exhibition-erik-van-lieshout", 30], ["the-party-folkert-de-jong", 30], ["specters-hamza-halloubi", 25], ["book-launch-another-cut-iwan-baan-and-sergei-sviatchenko", 30], ["artist-in-motion-an-hommage-rene-groebli", 25], ["official-gallery-night-after-party", 60, true, true]] },
  { day: "2026-11-20", name: "Project spaces", title: "Project spaces around the Oude Kerk", start: "12:00",
    description: "Friday is when the project spaces open their doors: five within a short walk in the old centre, from paper installations to digital work.",
    practical: "On foot, about 12:00–17:00. W139, the Oude Kerk and Arti et Amicitiae need tickets; the rest is free. W139’s opening at 19:00 is a maybe.",
    stops: [["forest-of-the-city-anouk-griffioen", 30], ["plucking-the-broom", 30], ["heaving-room-rustan-soderling", 40], ["mire-lee", 45], ["buning-brongers-prijzen-2026", 40], ["opening-heaving-room", 45, true, true]] },
  { day: "2026-11-21", name: "Noord", title: "Across the IJ to Noord", start: "11:00",
    description: "Take the free ferry from Centraal: film at Eye, digital art at Nxt, then the NDSM wharf for an artist talk and the open studio.",
    practical: "Ferry to Buiksloterweg, back from NDSM-werf. About 11:00–17:00; Eye, Nxt and On The Inside need tickets. Cycling is quicker here: switch to Bike in the Timeline.",
    stops: [["uber-das-leben", 60], ["pioneers-of-media-art-group-show", 60], ["live-radio-show-artist-talk-quintus-glerum", 60, true], ["open-studio-at-treehouse-ndsm", 30], ["fabric-of-play-zoubida-sophia-kacimi", 30]] },
  { day: "2026-11-22", name: "Family Sunday", title: "Family Sunday in Noord", start: "10:30",
    description: "A day for kids: the family programme at Eye, a family experience at Nxt, and a tour with the artist at Treehouse NDSM.",
    practical: "Ferry to Buiksloterweg. About 10:30–16:00, all free. Bring snacks; the walk from Nxt to NDSM is long for small legs, so a bike or bus helps.",
    stops: [["eye-filmmuseum-family-sunday", 90], ["family-experience-tales-of-two", 45], ["kids-tour-by-artist-quintus-glerum", 60, true], ["nasal-demons-quintus-glerum-more", 30]] },
];

const out = [];
for (const r of ROUTES) {
  let t = toMin(r.start), prev = null;
  const route = [];
  for (const [prefix, duration, fixed, maybe] of r.stops) {
    const e = ev.get(prefix) ?? [...ev.values()].find((x) => x.id.startsWith(prefix));
    if (!e) throw new Error(`${r.title}: no entry ${prefix}`);
    const h = e.days[r.day];
    if (h === undefined) throw new Error(`${r.title}: ${e.id} isn't on ${r.day}`);
    const open = h ? toMin(h[0]) : t;
    let start = Math.max(up5(t + legMin(prev?.museumId, e.museumId)), open);
    if (fixed && h) start = open;
    if (h && start + duration > toMin(h[1]) && !fixed) throw new Error(`${r.title}: ${e.title} closes before the visit ends (${clock(start)})`);
    const v = venues.get(e.museumId ?? "");
    route.push({ id: e.id, day: r.day, arrival: clock(start), duration, fixed: !!fixed, maybe: !!maybe,
      reason: `${discipline(e)} at ${v?.name ?? e.venue}${h ? `, ${h[0]}–${h[1]}` : ""}.`, practical: e.admission ?? "", transfer: "" });
    t = start + duration; prev = e;
  }
  out.push({ name: r.name, title: r.title, description: r.description, practical: r.practical, route });
  console.log(`${r.title}: ${route.map((s) => s.arrival).join(" → ")}, ends ${clock(t)}`);
}
writeFileSync(new URL("../src/data/route-ideas.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
