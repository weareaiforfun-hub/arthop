import { useEffect, useMemo, useState } from "react";
import { Eye, Footprints } from "lucide-react";
import { byId, byMuseum, DAYS, groupOf, setCurrentDay, type UiStop } from "../lib/catalogue";
import { analyse, leg } from "../lib/plan";
import { sync, type ViewNight as Night } from "../lib/sync";
import { MapView } from "./map-view";
import { DayBar } from "./days";
import { DrawnTitle } from "./my-day";
import { SiteNote } from "./site-note";

/** What someone with a view-only link sees: the group's plans for each day on a map and as a list, refreshed every
 *  30 seconds. No sign-in, no names; nothing here can change anything. */
export function ViewNight({ token }: { token: string }) {
  const [night, setNight] = useState<Night | null | undefined>(undefined), [error, setError] = useState("");
  const [which, setWhich] = useState(0), [fit, setFit] = useState(1), [day, setDay] = useState(DAYS[1].id);
  setCurrentDay(day);

  useEffect(() => {
    let alive = true;
    const load = () => sync?.viewNight(token).then((n) => {
      if (!alive) return;
      setNight(n); setError("");
      // Open on the first day that has stops.
      const first = DAYS.find((d) => n?.routes.some((r) => r.stops.some((s) => s.day === d.id)));
      if (first && night === undefined) setDay(first.id);
    }).catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = night?.routes[Math.min(which, night.routes.length - 1)];
  const stops: UiStop[] = useMemo(() => route?.stops.filter((s) => s.day === day).map((s) => ({ id: s.event_id, day: s.day, arrival: s.arrival, duration: s.duration, maybe: s.maybe, fixed: s.fixed })) ?? [], [route, day]);
  const counts = useMemo(() => Object.fromEntries(DAYS.map((d) => [d.id, route?.stops.filter((s) => s.day === d.id).length ?? 0])), [route]);
  const lines = useMemo(() => (route ? [{ stops, color: "#111", numbered: true }] : []), [route, stops]);
  const slots = useMemo(() => analyse(stops).slots, [stops]);
  useEffect(() => setFit((f) => f + 1), [which, day, night === undefined]);

  return <main className="view-night" data-day={day}>
    <header className="top">
      <div className="top-row"><a href="./" className="brand" aria-label="ArtHop home">arthop</a><span className="brand-sub">Amsterdam Art Week<br />18–22 Nov</span><span className="grow" /><span className="chip"><Eye size={15} />View only</span></div>
      <DayBar day={day} onDay={setDay} counts={counts} />
    </header>
    {night === undefined && !error ? <div className="view-message"><p>Loading…</p><SiteNote /></div>
      : error ? <div className="view-message"><p role="alert">{error}</p><SiteNote /></div>
      : !night ? <div className="view-message"><h1>This link doesn’t work anymore</h1><p>The group turned it off or made a new one. Ask them for the current view-only link.</p><a className="btn" href="./">Plan your own Art Week</a><SiteNote /></div>
      : <div className="view-body">
        <section className="view-map" aria-label="Map of the plan"><MapView visible={[]} lines={lines} onSelect={(e) => window.open(e.url, "_blank", "noopener")} focus={null} fit={fit} isOpen={() => true} /></section>
        <aside className="view-list">
          <span className="eyebrow">Shared with you</span>
          {night.routes.length > 1 && <div className="seg" role="group" aria-label="Plans">{night.routes.map((r, i) => <button key={r.title + i} data-track="Switch plan" className={i === which ? "on" : ""} aria-pressed={i === which} onClick={() => setWhich(i)}>{r.title}</button>)}</div>}
          <DrawnTitle day={day} as="h1" />
          {!stops.length ? <p className="view-empty">Nothing planned for this day yet. This page updates by itself when the group adds stops.</p>
            : <ol className="day-stops">{slots.map((s, i) => {
              const e = byId.get(s.id), walk = i ? leg(stops[i - 1].id, s.id) : null;
              return <li key={s.id + i} className={"ds-item" + (s.maybe ? " maybe" : "")}>
                {walk && walk.minutes > 0 && <div className="ds-leg"><Footprints size={12} /> {walk.minutes} min walk</div>}
                <div className="ds-row"><span className="ds-time">{s.arrival || "–"}</span><i className="ds-dot" style={{ background: groupOf(e).color }} />
                  <a className="ds-body" href={e?.url} target="_blank" rel="noreferrer"><b>{e?.kind === "venue" ? e.title : byMuseum.get(e?.museumId ?? "")?.name ?? e?.venue}</b><small>{e?.kind === "venue" ? "" : e?.title + " · "}{s.duration} min{s.fixed ? " · fixed time" : ""}{s.maybe ? " · maybe" : ""}</small></a></div>
              </li>;
            })}</ol>}
          <p className="view-foot">Updates by itself as the group changes the plan. Want to help plan? Ask the group for their invite link.</p>
          <p className="view-foot"><a href="./">Plan your own Art Week with ArtHop</a></p>
          <SiteNote />
        </aside>
      </div>}
  </main>;
}
