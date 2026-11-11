import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, GripVertical, MapPin, Printer, X } from "lucide-react";
import { byId, byMuseum, clock, dayOf, disciplineOf, groupOf, hoursText, warnings, type Item, type UiStop } from "../lib/catalogue";
import { analyse, pushToFit } from "../lib/plan";
import { maybeOps, removeOps, reorderOps, timingOps } from "../lib/night";
import { useReorder } from "../lib/reorder";
import { TRAVELMODE } from "../lib/location";
import type { Op } from "../lib/sync";

type Run = (ops: Op[], label?: string) => void;
export type Face = { name: string; color: string };
export type RouteChoice = { kind: "personal" | "shared" | "crew"; label: string };
const km = (m: number) => (m / 1000).toFixed(1) + " km";

/** "Thursday, drawn": the big heading of My day (board 56 and 59). */
export function DrawnTitle({ day, as = "h2" }: { day: string; as?: "h1" | "h2" }) {
  const H = as;
  return <H className="drawn-title">{dayOf(day).name},<span> drawn</span></H>;
}

/** The plan's one-line summary: "Gallery Night · 5 stops · 2.6 km · 17:00–20:55". */
export function daySummary(day: string, stops: UiStop[]) {
  const a = analyse(stops), d = dayOf(day);
  const theme = d.night ? "Gallery Night" : d.theme;
  if (!stops.length) return theme + " · nothing planned yet";
  return [theme, `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`, a.metres ? km(a.metres) : null, a.slots.length ? `${clock(a.slots[0].start)}–${clock(a.ends!)}` : null].filter(Boolean).join(" · ");
}

/** The day's stops in order: time, colour, what and how long, who else is going; walks in between, with clashes.
 *  Drag a stop by its handle to move it; tap its time to change it, mark it maybe or remove it. */
/** A stop's bubble grows with how long you stay there (board 68): 15 min ≈ 20 px, 90 min and up 34 px. */
const bubble = (minutes: number) => Math.round(Math.min(34, Math.max(18, 16 + minutes / 4)));

export function DayStops({ stops, run, canEdit, onPick, faces, routeName, onReschedule }: {
  stops: UiStop[]; run: Run; canEdit: boolean; onPick: (e: Item) => void; faces: (id: string) => Face[]; routeName: string;
  onReschedule: ((next: UiStop[], label: string) => void) | null;
}) {
  const a = useMemo(() => analyse(stops), [stops]);
  const fitted = useMemo(() => pushToFit(stops), [stops]);
  const canPush = fitted.some((s, i) => s.arrival !== stops[i].arrival);
  const [open, setOpen] = useState<string | null>(null);
  const { handle, rowStyle, dragging } = useReorder(stops.length, (from, to) => run(reorderOps(stops, from, to), `Moved ${byId.get(stops[from].id)?.title ?? "a stop"}`));
  return <ol className={"day-stops" + (dragging != null ? " dragging" : "")}>
    {a.slots.map((s, i) => {
      const e = byId.get(s.id);
      if (!e) return null;
      const m = byMuseum.get(e.museumId ?? ""), prev = i ? byMuseum.get(byId.get(stops[i - 1].id)?.museumId ?? "") : null;
      const who = faces(s.id), warn = warnings(stops[i]), key = s.rowId ?? s.id;
      return <li key={key} className={"ds-item" + (s.maybe ? " maybe" : "") + (dragging === i ? " lifted" : "")} data-reorder-row style={rowStyle(i)}>
        {i > 0 && s.walk.minutes > 0 && <div className={"ds-leg" + (s.tight ? " tight" : "")}>
          {s.tight ? <>{s.walk.minutes} min {s.walk.mode === "foot" ? "walk" : s.walk.mode === "bike" ? "ride" : "drive"}, you planned {Math.max(0, s.gap ?? 0)}.
            {onReschedule && canPush && <button className="link" onClick={() => onReschedule(fitted, "Pushed later stops to fit")}>Push later stops</button>}</>
            : `${s.walk.minutes} min ${s.walk.mode === "foot" ? "walk" : s.walk.mode === "bike" ? "by bike" : "by car"}`}
        </div>}
        <div className="ds-row">
          {canEdit ? <button className="ds-grip" {...handle(i, e.title)}><GripVertical size={16} /></button> : <span className="ds-grip" aria-hidden="true" />}
          <button className={"ds-time" + (s.estimated ? " estimated" : "")} aria-expanded={open === key} aria-label={`Time and options for ${e.title}: ${clock(s.start)}`} onClick={() => setOpen(open === key ? null : key)}>{clock(s.start)}</button>
          <i className="ds-dot" style={{ background: groupOf(e).color, width: bubble(s.duration), height: bubble(s.duration) }} aria-hidden="true" />
          <button className="ds-body" onClick={() => onPick(e)}>
            <b>{e.kind === "venue" ? e.title : m?.name ?? e.venue}</b>
            <small>{e.kind === "venue" ? disciplineOf(e) : e.title} · {s.duration} min{s.maybe ? " · maybe" : ""}{s.fixed ? " · fixed time" : ""}</small>
          </button>
          {who.length > 0 && <span className="ds-faces" title={who.map((f) => f.name).join(", ") + " too"}>{who.slice(0, 3).map((f) => <i key={f.name} style={{ background: f.color }}>{f.name.slice(0, 2).toUpperCase()}</i>)}</span>}
        </div>
        {warn && <p className="ds-warn">{warn}</p>}
        {open === key && <div className="ds-edit">
          <p className="ds-hours">{e.venue} · {hoursText(e, s.day)}</p>
          {canEdit ? <>
            <div className="ds-timing">
              <label>Arrive<input key={s.rowId + s.arrival} type="time" defaultValue={s.arrival} aria-label={"Arrival at " + e.title}
                onBlur={(ev) => { if (ev.target.value !== stops[i].arrival) run(timingOps(stops[i], ev.target.value, s.duration), `Changed arrival at ${e.title}`); }} /></label>
              <label>Stay<select value={s.duration} aria-label={"How long at " + e.title} onChange={(ev) => run(timingOps(stops[i], stops[i].arrival, Number(ev.target.value)), `Changed time at ${e.title}`)}>
                {Array.from(new Set([15, 20, 30, 45, 60, 90, 120, s.duration])).sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} min</option>)}</select></label>
            </div>
            <div className="seg" role="group" aria-label={"Sure or maybe: " + e.title}>
              <button aria-pressed={!s.maybe} className={!s.maybe ? "on" : ""} onClick={() => s.maybe && run(maybeOps(stops[i], false), `${e.title} is a sure stop`)}>Sure</button>
              <button aria-pressed={!!s.maybe} className={s.maybe ? "on" : ""} onClick={() => !s.maybe && run(maybeOps(stops[i], true), `${e.title} is a maybe`)}>Maybe</button>
            </div>
          </> : <p className="ds-hours">Only {routeName === "your route" ? "you" : "planners"} can change this route.</p>}
          <div className="ds-edit-actions">
            {m && <a className="link" href={"https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(m.address + ", Amsterdam") + (prev ? "&origin=" + encodeURIComponent(prev.address + ", Amsterdam") : "") + "&travelmode=" + TRAVELMODE[s.mode ?? "foot"]} target="_blank" rel="noreferrer"><MapPin size={13} />{prev ? "Directions from the stop before" : "Directions"}<ArrowUpRight size={12} /></a>}
            {canEdit && <button className="link danger" onClick={() => { run(removeOps(stops[i]), `Removed ${e.title} from ${routeName}`); setOpen(null); }}><X size={13} />Remove</button>}
          </div>
        </div>}
      </li>;
    })}
  </ol>;
}

/** The buttons under the plan: Go (with the walk), Google Maps and Print my day. */
export function DayActions({ day, go, onMaps, onPrint, hasStops }: { day: string; go: { label: string; href: string | null; onClick?: () => void } | null; onMaps: () => void; onPrint: () => void; hasStops: boolean }) {
  if (!hasStops) return null;
  return <div className="day-actions">
    {go && (go.href ? <a className="btn big" href={go.href} target="_blank" rel="noreferrer" onClick={go.onClick}>{go.label}</a> : <button className="btn big" onClick={go.onClick}>{go.label}</button>)}
    <div className="two">
      <button className="btn alt" onClick={onMaps}><MapPin size={16} />Google Maps</button>
      <button className="btn alt" onClick={onPrint} data-wn="print"><Printer size={16} />Print my {dayOf(day).name}</button>
    </div>
  </div>;
}

export function RouteSwitch({ choices, kind, onKind }: { choices: RouteChoice[]; kind: RouteChoice["kind"]; onKind: (k: RouteChoice["kind"]) => void }) {
  if (choices.length < 2) return null;
  return <div className="seg route-switch" role="group" aria-label="Whose plan">
    {choices.map((c) => <button key={c.kind} data-track={c.kind === "crew" ? "Crew" : c.label} aria-pressed={kind === c.kind} className={kind === c.kind ? "on" : ""} onClick={() => onKind(c.kind)}>{c.label}</button>)}
  </div>;
}

export function ViewLinks({ view, onView, ideas, toggle }: { view: string; onView: (v: "list" | "timeline" | "ideas" | "suggested") => void; ideas: number; toggle?: React.ReactNode }) {
  return <div className="view-links">
    {view !== "list" && <button className="link" onClick={() => onView("list")}><ChevronDown size={13} style={{ transform: "rotate(90deg)" }} />Back to the list</button>}
    {view !== "timeline" && <button className="link" onClick={() => onView("timeline")}>Suggested order</button>}
    {view !== "timeline" && <button className="link" onClick={() => onView("timeline")}>Timeline view</button>}
    {view !== "ideas" && <button className="link" onClick={() => onView("ideas")} data-tour="ideas">Route ideas · {ideas}</button>}
    {toggle}
  </div>;
}
