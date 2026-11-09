import { ArrowUpRight } from "lucide-react";
import { byId, byMuseum, clock, disciplineOf, windowOf, type Item, type UiStop } from "../lib/catalogue";
import { analyse, leg } from "../lib/plan";
import { amsterdamNow, mapsNext, walkFrom, type Spot } from "../lib/location";

/** Where a walk stands on the day, kept in this browser only: stops you've reached or skipped. */
export type WalkState = { done: string[]; skipped: string[] };
const KEY = (day: string) => "ah:walk:" + day;
export const loadWalk = (day: string): WalkState => { try { return JSON.parse(localStorage.getItem(KEY(day)) ?? "") as WalkState; } catch { return { done: [], skipped: [] }; } };
export const saveWalk = (day: string, w: WalkState) => { try { localStorage.setItem(KEY(day), JSON.stringify(w)); } catch { /* private mode */ } };
/** The stop to head for: the first one not reached or skipped. */
export const walkIndex = (stops: UiStop[], w: WalkState) => stops.findIndex((s) => !w.done.includes(s.rowId ?? s.id) && !w.skipped.includes(s.rowId ?? s.id));

/** On the way: one stop, how far it is, one big button (board 60). Bigger type and 64 px buttons, for walking. */
export function NowCard({ stops, index, me, onHere, onSkip, onPick, groupLine, onWholeDay, onRestart }: {
  stops: UiStop[]; index: number; me: Spot | null; onHere: () => void; onSkip: () => void; onPick: (e: Item) => void;
  groupLine: string | null; onWholeDay: () => void; onRestart: () => void;
}) {
  if (!stops.length) return null;
  if (index < 0) return <section className="now-card done">
    <span className="eyebrow">Now · all {stops.length} stops done</span>
    <h2>That’s your day, drawn.</h2>
    <p>Print it or share it from My day.</p>
    <button className="btn big" onClick={onWholeDay}>See my whole day</button>
    <button className="btn alt" onClick={onRestart}>Start the walk again</button>
  </section>;
  const s = stops[index], e = byId.get(s.id)!, m = byMuseum.get(e?.museumId ?? "");
  const slots = analyse(stops).slots, w = windowOf(e);
  const fromMe = me ? walkFrom(me, e.museumId) : null;
  const fromPrev = index > 0 ? leg(stops[index - 1].id, s.id, s.mode) : null;
  const minutes = fromMe?.minutes ?? fromPrev?.minutes ?? null;
  const now = amsterdamNow().minutes;
  const arrive = minutes != null && fromMe ? clock(now + minutes) : clock(slots[index].start);
  const next = stops[index + 1] ? byId.get(stops[index + 1].id) : null;
  const href = mapsNext(s);
  return <section className="now-card" aria-label="Your next stop">
    <span className="eyebrow">Now · stop {index + 1} of {stops.length}</span>
    <button className="now-title" onClick={() => onPick(e)}><h2>{e.kind === "venue" ? e.title : m?.name ?? e.venue}</h2></button>
    <p className="now-what">{e.kind === "venue" ? disciplineOf(e) : e.title} · {w ? `open till ${clock(w[1])}` : "hours not listed"}</p>
    <p className="now-far">{minutes != null ? <><b>{minutes} min</b> {s.mode === "bike" ? "by bike" : s.mode === "car" ? "by car" : "walk"} · there at {arrive}</> : <>Planned for <b>{clock(slots[index].start)}</b></>}</p>
    {href ? <a className="btn huge" href={href} target="_blank" rel="noreferrer">{s.mode === "bike" ? "Cycle there" : s.mode === "car" ? "Drive there" : "Walk there"}<ArrowUpRight size={20} /></a> : null}
    <div className="two">
      <button className="btn alt huge" onClick={onHere}>I’m here</button>
      <button className="btn alt huge" onClick={onSkip}>Skip</button>
    </div>
    {groupLine && <p className="now-group">{groupLine}</p>}
    {next && <p className="now-next">After this: {next.kind === "venue" ? next.title : byMuseum.get(next.museumId ?? "")?.name ?? next.venue}</p>}
    <button className="link" onClick={onWholeDay}>See my whole day</button>
  </section>;
}
