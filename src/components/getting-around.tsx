import { ArrowUpRight, Eye, EyeOff, X } from "lucide-react";
import type { TransportMode } from "../data/transport";

/** The "Getting around" panel over the map: ferries drawn on the map, and how trams and bikes fit in. */
export function GettingAround({ className, modes, layers, onToggle, hideVenues, onHideVenues, onClose }: {
  className: string; modes: TransportMode[]; layers: Set<string>; onToggle: (id: string) => void; hideVenues: boolean; onHideVenues: (v: boolean) => void; onClose: () => void;
}) {
  return <section className={"getting-around " + className} aria-label="Getting around">
    <div className="ga-head">
      <div><span className="eyebrow">Map layer</span><h2>Getting around</h2></div>
      <button className="sc-close" aria-label="Close getting around" onClick={onClose}><X size={20} /></button>
    </div>
    <div className="ga-modes">{modes.map((m) => {
      const on = layers.has(m.id), drawable = m.stops.length > 0;
      return <div key={m.id} className={"ga-mode" + (on && drawable ? " on" : "")} style={{ ["--c" as string]: m.color }}>
        <span className="ga-swatch">{m.short}</span>
        <span className="ga-text"><b>{m.name}</b><small>{m.summary}</small>
          <a href={m.url} target="_blank" rel="noreferrer">{m.id === "ferry" ? "Ferry times at GVB" : m.id === "tram" ? "Plan on 9292.nl" : "About OV-fiets"}<ArrowUpRight size={12} /></a></span>
        {drawable && <button className="chip" aria-pressed={on} onClick={() => onToggle(m.id)}>{on ? "On map" : "Show"}</button>}
      </div>;
    })}</div>
    <button className="link" aria-pressed={hideVenues} onClick={() => onHideVenues(!hideVenues)}>{hideVenues ? <><Eye size={14} />Show venues again</> : <><EyeOff size={14} />Hide venues</>}</button>
  </section>;
}

/** One selected ferry pier: where it goes. */
export function RideCard({ mode, stop, onClose }: { mode: TransportMode; stop: number; onClose: () => void }) {
  const s = mode.stops[stop];
  const others = (mode.lines ?? []).filter((l) => l.includes(stop)).map(([a, b]) => mode.stops[a === stop ? b : a].name);
  return <section className="ride-card" style={{ ["--c" as string]: mode.color }} aria-label={s.name}>
    <button className="sc-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
    <span className="eyebrow">{mode.name}</span>
    <h3>{s.name}</h3>
    {others.length > 0 && <p>Ferry to {others.join(" or ")}.</p>}
    <p>{mode.summary}</p>
    {mode.note && <p className="ride-note">{mode.note}</p>}
    <a className="link" href={mode.url} target="_blank" rel="noreferrer">Times at GVB<ArrowUpRight size={13} /></a>
  </section>;
}
