import { Check, Plus, X } from "lucide-react";
import { byMuseum, CLOSED, disciplineOf, groupOf, minute, openAt, windowOf, clock, type Item } from "../lib/catalogue";
import { walkFrom, type Spot } from "../lib/location";

export type Chip = { key: string; label: string; onRemove: () => void };

/** The programme for the day shown, as rows of four things at most: colour, name, what · how far · until when, and
 *  one button (Add). Board 58. Tapping a row opens its card. */
export function ProgrammeList({ list, day, at, me, live, openOnly, chips, inRoute, onAdd, onPick, likes, routeLabel, onClear }: {
  list: Item[]; day: string; at: number; me: Spot | null; live: boolean; openOnly: boolean; chips: Chip[];
  inRoute: (id: string) => boolean; onAdd: (e: Item) => void; onPick: (e: Item) => void; likes: (id: string) => string; routeLabel: string; onClear: () => void;
}) {
  const near = !!me;
  const heading = `${openOnly ? (live ? "Open now" : `Open at ${clock(at)}`) : "On this day"}${near ? " near you" : ""}`;
  return <section className="programme" aria-label="Programme">
    <div className="pg-head">
      <h2>{heading}</h2>
      <span>{list.length} · {near ? "nearest first" : openOnly ? "by name" : "open first"}</span>
    </div>
    {chips.length > 0 && <div className="pg-chips">{chips.map((c) => <button key={c.key} className="chip" onClick={c.onRemove} aria-label={"Remove filter " + c.label}>{c.label}<X size={14} /></button>)}</div>}
    {list.length === 0 && <div className="pg-empty"><p>Nothing matches on this day{openOnly ? " at this time" : ""}.</p><button className="secondary" onClick={onClear}>Clear filters</button></div>}
    <ul className="pg-rows">{list.map((e) => {
      const open = openAt(e, at, day), w = windowOf(e, day), walk = me ? walkFrom(me, e.museumId) : null, added = inRoute(e.id), liked = likes(e.id);
      const when = !w ? "hours not listed" : !open && at < w[0] ? `opens ${clock(w[0])}` : !open ? "closed now" : e.kind === "event" ? `${clock(w[0])}–${clock(w[1])}` : `open till ${clock(w[1])}`;
      const bits = [e.kind === "venue" ? disciplineOf(e) : disciplineOf(e), walk && walk.metres < 15000 ? `${walk.minutes} min` : byMuseum.get(e.museumId ?? "")?.area, when, liked].filter(Boolean);
      return <li key={e.id} className={"pg-row" + (open ? "" : " closed") + (added ? " added" : "")}>
        <i className="pg-dot" style={{ background: open ? groupOf(e).color : CLOSED }} aria-hidden="true" />
        <button className="pg-main" onClick={() => onPick(e)}>
          <b>{e.title}</b>
          {e.kind !== "venue" && <span className="pg-venue">{e.venue}</span>}
          <small>{bits.join(" · ")}</small>
        </button>
        <button className={"pg-add" + (added ? " on" : "")} aria-label={added ? `In your ${routeLabel}: ${e.title}` : `Add to your ${routeLabel}: ${e.title}`} aria-pressed={added} onClick={() => onAdd(e)}>
          {added ? <Check size={22} /> : <Plus size={24} />}
        </button>
      </li>;
    })}</ul>
  </section>;
}

/** Programme order: open at the time shown first, then nearest (with a location) or by start time, then by name. */
export function sortProgramme(list: Item[], day: string, at: number, me: Spot | null) {
  const key = (e: Item) => {
    const w = windowOf(e, day), open = openAt(e, at, day);
    const dist = me ? walkFrom(me, e.museumId)?.metres ?? 1e9 : 0;
    return [open ? 0 : w && at < w[0] ? 1 : 2, dist, e.kind === "event" && w ? w[0] : minute("23:00"), e.title.toLocaleLowerCase()] as const;
  };
  return [...list].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
}
