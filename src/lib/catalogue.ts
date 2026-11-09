import catalogue from "../data/catalogue.json";

/* ---------- the programme ---------- */

export type Hours = [string, string] | null;
export type Kind = "gallery" | "project-space" | "museum" | "partner" | "residency" | "corporate" | "other";
export type Museum = {
  id: string; name: string; url: string | null; address: string | null; kind: Kind; area: string | null; district: string | null;
  lat: number | null; lng: number | null; pinSource: string | null; hours: Record<string, Hours>; listedHours: boolean; accessible: boolean | null;
};
/** A programme entry (an exhibition or an event) or, with kind "venue", a venue itself. `days` holds the Art Week days it
 *  is on, each with its hours that day (null: on, but no hours listed). A day that isn't in `days` means not on / closed. */
export type Item = {
  id: string; title: string; venue: string; museumId: string | null; tags: string[]; disciplines: string[]; url: string;
  kind: "exhibition" | "event" | "venue"; days: Record<string, Hours>; dates: string; admission: string | null; family?: boolean;
};
/** A stop as the UI sees it: `id` is the programme item, `rowId` the database row (absent in previews). */
/** How you get from one stop to the next. */
export type Mode = "foot" | "bike" | "car";
/** `travel` is a mode picked for the leg into this stop (stored); `mode` is the one that applies, the route's if none (not stored). */
export type UiStop = { id: string; arrival: string; duration: number; reason?: string; practical?: string; transfer?: string; fixed?: boolean; rowId?: string; pos?: number; maybe?: boolean; travel?: Mode | null; mode?: Mode; day?: string };

export const museums = catalogue.museums as unknown as Museum[];
export const activities = catalogue.events as unknown as Item[];
export const KIND_LABEL: Record<Kind, string> = { gallery: "Gallery", "project-space": "Project space", museum: "Museum", partner: "Partner", residency: "Residency", corporate: "Corporate collection", other: "Venue" };
export const museumItem = (m: Museum): Item => ({
  id: "museum:" + m.id, title: m.name, venue: m.name, museumId: m.id, tags: [KIND_LABEL[m.kind]], disciplines: [],
  url: m.url ?? "https://amsterdamart.com/en/programme/", kind: "venue", days: m.hours, dates: "", admission: null,
});
export const items: Item[] = [...activities, ...museums.map(museumItem)];
export const byId = new Map(items.map((e) => [e.id, e]));
export const byMuseum = new Map(museums.map((m) => [m.id, m]));
export const SOURCE = catalogue.source;
export const IMPORTED = catalogue.importedAt;

/* ---------- the five days ---------- */

export type Day = { id: string; short: string; label: string; name: string; theme: string; sub: string; night?: [string, string] };
/** Themes from the organisers' programme: Gallery Night on Thursday, project spaces open from Friday (participant terms),
 *  Family Sunday. Rijksakademie Open Studios runs 19–22 Nov, so Wednesday is the opening day. */
export const DAYS: Day[] = [
  { id: "2026-11-18", short: "Wed 18", label: "WED 18", name: "Wednesday", theme: "Opening day", sub: "First openings and talks" },
  { id: "2026-11-19", short: "Thu 19", label: "THU 19", name: "Thursday", theme: "Festive Gallery Night", sub: "Galleries open till 21:00", night: ["17:00", "21:00"] },
  { id: "2026-11-20", short: "Fri 20", label: "FRI 20", name: "Friday", theme: "Project spaces, museums", sub: "Project spaces open their doors" },
  { id: "2026-11-21", short: "Sat 21", label: "SAT 21", name: "Saturday", theme: "The big public day", sub: "The most on, all over town" },
  { id: "2026-11-22", short: "Sun 22", label: "SUN 22", name: "Sunday", theme: "Family Sunday", sub: "Workshops and tours for kids" },
];
export const dayOf = (id: string) => DAYS.find((d) => d.id === id) ?? DAYS[1];

/** The day every screen is showing. Kept here (and set by the app) so time checks deep in the planner use the same day. */
let current = DAYS[1].id;
export const currentDay = () => current;
export function setCurrentDay(id: string) { if (DAYS.some((d) => d.id === id)) current = id; }

/** Minutes since midnight; times before 06:00 count as after midnight (an after-party). */
export const minute = (s: string) => { const [h, m] = s.split(":").map(Number); return (h < 6 ? h + 24 : h) * 60 + m; };
export const clock = (n: number) => String(Math.floor(n / 60) % 24).padStart(2, "0") + ":" + String(((n % 60) + 60) % 60).padStart(2, "0");

/** Whether an item is on (or a venue open) on a day, whatever its hours. */
export const onDay = (e: Item | undefined, day = current) => !!e && day in e.days;
/** Opening window of an item on a day in minutes, or null when it isn't on or has no listed hours. */
export function windowOf(e: Item | undefined, day = current): [number, number] | null {
  const h = e?.days[day];
  return h ? [minute(h[0]), minute(h[1])] : null;
}
/** Open at a moment of a day. Items on that day without listed hours count as open (we can't say otherwise). */
export function openAt(e: Item | undefined, at: number, day = current) {
  if (!onDay(e, day)) return false;
  const w = windowOf(e, day);
  return !w || (at >= w[0] && at < w[1]);
}
/** "13:00–21:00", "Hours not listed" or "Not on this day". */
export function hoursText(e: Item | undefined, day = current) {
  if (!onDay(e, day)) return "Not on " + dayOf(day).name;
  const h = e!.days[day];
  return h ? `${h[0]}–${h[1]}` : "Hours not listed";
}
/** The days an item is on, as "Wed–Sun" style short names. */
export const daysText = (e: Item) => DAYS.filter((d) => d.id in e.days).map((d) => d.short.slice(0, 3)).join(" · ");

/** A day's span for the timeline and time slider, on the hour: from when most places have opened to when most have
 *  closed (a 9:00 talk or a midnight party doesn't stretch the whole day; those stops still show where they fall). */
const ranges = new Map<string, [number, number]>();
export function dayRange(day = current): [number, number] {
  if (!ranges.has(day)) {
    const starts: number[] = [], ends: number[] = [];
    for (const e of activities) { const w = windowOf(e, day); if (w) { starts.push(w[0]); ends.push(w[1]); } }
    starts.sort((a, b) => a - b); ends.sort((a, b) => a - b);
    const at = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * q))];
    ranges.set(day, starts.length ? [Math.floor(at(starts, 0.1) / 60) * 60, Math.ceil(at(ends, 0.92) / 60) * 60] : [minute("10:00"), minute("22:00")]);
  }
  return ranges.get(day)!;
}
/** The full span of a day: the earliest opening to the latest closing, for planning (a late party still fits). */
export function dayExtent(day = current): [number, number] {
  let lo = 24 * 60, hi = 0;
  for (const e of activities) { const w = windowOf(e, day); if (w) { lo = Math.min(lo, w[0]); hi = Math.max(hi, w[1]); } }
  return lo < hi ? [lo, hi] : dayRange(day);
}

export function warnings(s: UiStop) {
  const e = byId.get(s.id), day = s.day ?? current;
  if (!onDay(e, day)) return `Not on ${dayOf(day).name}. Check the days it's on.`;
  const w = windowOf(e, day);
  if (!w || !s.arrival) return "";
  const a = minute(s.arrival);
  if (a < w[0] || a >= w[1]) return "Arrival is outside the listed hours.";
  if (a + s.duration > w[1]) return "This visit runs past the listed closing time.";
  return "";
}

/* ---------- colour: what it is ---------- */

/** The four colours from the look (board 40), plus one for mixed or other work. Grey means closed now. */
export const GROUPS = [
  { id: "painting", label: "Painting & paper", color: "#2b3bff", match: ["Painting", "Work on paper"] },
  { id: "photo", label: "Photography", color: "#00b67a", match: ["Photography"] },
  { id: "sculpture", label: "Sculpture & installation", color: "#f5d90a", match: ["Sculpture", "Installation", "Ceramics", "Textile"] },
  { id: "video", label: "Video & performance", color: "#ff4fa3", match: ["Video | Film", "Performance", "Digital art"] },
  { id: "mixed", label: "Mixed & other", color: "#ff7a1a", match: ["Mixed Media", "Other"] },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];
export const CLOSED = "#c2c1ba";
/** The first listed discipline that isn't "mixed" decides the colour. */
export function groupOf(e: Item | undefined): (typeof GROUPS)[number] {
  if (!e) return GROUPS[4];
  if (e.kind === "venue") return venueGroup(e.museumId);
  const named = e.disciplines.find((d) => !GROUPS[4].match.includes(d as never)) ?? e.disciplines[0];
  return GROUPS.find((g) => (g.match as readonly string[]).includes(named ?? "")) ?? GROUPS[4];
}
const venueGroups = new Map<string, (typeof GROUPS)[number]>();
/** A venue's colour: the most common colour among what it shows. */
export function venueGroup(id: string | null | undefined) {
  if (!id) return GROUPS[4];
  if (!venueGroups.has(id)) {
    const count = new Map<string, number>();
    for (const e of activities) if (e.museumId === id) { const g = groupOf(e).id; count.set(g, (count.get(g) ?? 0) + (e.kind === "exhibition" ? 2 : 1)); }
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    venueGroups.set(id, GROUPS.find((g) => g.id === best) ?? GROUPS[4]);
  }
  return venueGroups.get(id)!;
}
/** What to call it in one word: "Painting", "Photography", ... */
export const disciplineOf = (e: Item | undefined) => (e?.kind === "venue" ? KIND_LABEL[byMuseum.get(e.museumId ?? "")?.kind ?? "other"] : e?.disciplines.find((d) => d !== "Mixed Media" && d !== "Other")?.replace(" | Film", "") ?? e?.disciplines[0] ?? e?.tags[0] ?? "Art");

export const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();
export const COLORS = ["#2b3bff", "#b9452f", "#6e55a3", "#00a36c", "#c2185b", "#d97706", "#0f6e86", "#111111"];
