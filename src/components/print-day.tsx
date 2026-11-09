import { Printer, X } from "lucide-react";
import { byId, byMuseum, clock, dayOf, disciplineOf, GROUPS, groupOf, type UiStop } from "../lib/catalogue";
import { analyse } from "../lib/plan";
import { smooth } from "./map-view";

/** "Print my Thursday": the day as a drawing, a colour for what you saw, a size for how long you stayed and a line
 *  for how you got there (board 40), with the stops listed underneath. Prints on one page. */
export function PrintDay({ day, stops, title, onClose }: { day: string; stops: UiStop[]; title: string; onClose: () => void }) {
  const d = dayOf(day), a = analyse(stops);
  const pts = stops.map((s) => { const e = byId.get(s.id), m = byMuseum.get(e?.museumId ?? ""); return m?.lat != null ? { s, e: e!, lat: m.lat, lng: m.lng!, name: e!.kind === "venue" ? e!.title : m.name } : null; }).filter(Boolean) as { s: UiStop; e: NonNullable<ReturnType<typeof byId.get>>; lat: number; lng: number; name: string }[];
  const W = 1000, H = 620, pad = 110;
  const k = Math.cos((52.37 * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k), ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, (maxY - minY) * (W / H), 0.004);
  const scale = (W - pad * 2) / span;
  const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
  const xy = (p: { lat: number; lng: number }): [number, number] => [offX + (p.lng * k - minX) * scale, offY + (-p.lat - minY) * scale];
  const line = smooth(pts.filter((p) => !p.s.maybe).map(xy), 14);
  const path = line.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const used = GROUPS.filter((g) => pts.some((p) => groupOf(p.e).id === g.id));
  const hours = a.slots.length ? a.ends! - a.slots[0].start : 0;
  return <div className="print-backdrop" role="dialog" aria-modal="true" aria-label={`Print my ${d.name}`}>
    <div className="print-tools">
      <button className="btn" onClick={() => window.print()}><Printer size={16} />Print or save as PDF</button>
      <button className="btn alt" onClick={onClose}><X size={16} />Close</button>
    </div>
    <article className="print-sheet">
      <h1 className="drawn-title">{d.name},<span> drawn</span></h1>
      <p className="print-sub">{title} · {d.short} Nov 2026 · {d.theme}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="print-drawing" role="img" aria-label={`Drawing of ${stops.length} stops`}>
        {pts.map((p, i) => { const [x, y] = xy(p), r = Math.min(110, 30 + p.s.duration * 0.9); return <circle key={i} cx={x} cy={y} r={r} fill={groupOf(p.e).color} opacity={p.s.maybe ? 0.4 : 1} />; })}
        {line.length > 1 && <><path d={path} fill="none" stroke="#111" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
          <path d={path} fill="none" stroke="#111" strokeWidth={2.5} strokeLinecap="round" transform="translate(9 7)" /></>}
        {pts.map((p, i) => { const [x, y] = xy(p), r = Math.min(110, 30 + p.s.duration * 0.9), left = x > W * 0.62; return <g key={"l" + i} transform={`translate(${left ? x - r - 12 : x + r * 0.55 + 10} ${y - r * 0.35})`} textAnchor={left ? "end" : "start"}>
          <text className="print-hand">{i + 1} · {p.name}</text>
          <text className="print-small" y={22}>{clock(a.slots[i]?.start ?? 0)} · {disciplineOf(p.e)} · {p.s.duration} min</text>
        </g>; })}
      </svg>
      <div className="print-foot">
        <div className="print-legend">{used.map((g) => <span key={g.id}><i style={{ background: g.color }} />{g.label}</span>)}<span>Size: how long you stay</span></div>
        <b>{stops.length} stops · {(a.metres / 1000).toFixed(1)} km · {Math.floor(hours / 60)} h {String(hours % 60).padStart(2, "0")}</b>
      </div>
      <ol className="print-list">{a.slots.map((s, i) => { const e = byId.get(s.id); return <li key={i}><b>{clock(s.start)}</b> {e?.kind === "venue" ? e.title : `${byMuseum.get(e?.museumId ?? "")?.name ?? e?.venue}: ${e?.title}`} · {byMuseum.get(e?.museumId ?? "")?.address}</li>; })}</ol>
      <p className="print-note">Made with ArtHop (arthop.arian-shafa.xyz), an unofficial fan planner, not affiliated with Amsterdam Art Week. Times and places from amsterdamart.com; check there for changes.</p>
    </article>
  </div>;
}
