import { useEffect, useState } from "react";
import { Accessibility, ArrowUpRight, Check, ChevronRight, Plus, X } from "lucide-react";
import { activities, byMuseum, dayOf, daysText, disciplineOf, groupOf, hoursText, KIND_LABEL, onDay, openAt, CLOSED, type Item } from "../lib/catalogue";
import { liveStatus, walkFrom, type Spot } from "../lib/location";
import { REACTIONS, ReactionButtons, type ReactionKey } from "./decide";

/** The current time, ticking every half minute so live statuses stay right while the card is open. */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

type Props = {
  item: Item; day: string; at: number; me: Spot | null; stopNumber: number | null;
  routeLabel: string; inRoute: boolean; onAdd: () => void; also: { label: string; added: boolean; onAdd: () => void }[];
  reaction: ReactionKey | undefined; onReact: (r: ReactionKey | null, note?: string) => void; note: string; onNote: (s: string) => void;
  friends: { name: string; reaction: ReactionKey; note: string }[];
  onPick: (e: Item) => void; onClose: () => void;
};

/** One venue or programme entry: what it is, when it's open on the day shown, reactions and the official page. Board 56. */
export function StopCard({ item, day, at, me, stopNumber, routeLabel, inRoute, onAdd, also, reaction, onReact, note, onNote, friends, onPick, onClose }: Props) {
  const now = useMinute(), m = byMuseum.get(item.museumId || ""), isVenue = item.kind === "venue";
  const open = openAt(item, at, day), on = onDay(item, day), d = dayOf(day);
  const status = on ? liveStatus(item, now) : null, walk = me ? walkFrom(me, item.museumId) : null;
  const [noteOpen, setNoteOpen] = useState(!!note);
  const here = isVenue ? activities.filter((e) => e.museumId === item.museumId) : [];
  const eyebrow = [m ? KIND_LABEL[m.kind] : null, m?.area, stopNumber != null ? `Stop ${stopNumber}` : null].filter(Boolean).join(" · ");
  return <section className="stop-card" role="dialog" aria-label={item.title}>
    <button className="sc-close" autoFocus aria-label="Close" onClick={onClose}><X size={20} /></button>
    <span className="sc-eyebrow">{eyebrow || "Art Week"}</span>
    <h2>{item.title}</h2>
    {!isVenue && <p className="sc-line"><i className="sc-dot" style={{ background: open ? groupOf(item).color : CLOSED }} />{disciplineOf(item)}{item.tags.length ? ", " + item.tags.join(", ").toLowerCase() : ""}</p>}
    {!isVenue && <button className="sc-venue" onClick={() => m && onPick({ ...item, id: "museum:" + m.id, title: m.name, kind: "venue", days: m.hours, tags: [KIND_LABEL[m.kind]], disciplines: [], url: m.url ?? item.url })}>{item.venue}<ChevronRight size={15} /></button>}
    <p className="sc-when"><b>{d.short.slice(0, 3)} {hoursText(item, day)}</b>{on && d.night && m?.kind === "gallery" ? ` · Gallery Night ${d.night[0].slice(0, 2)}–${d.night[1].slice(0, 2)}` : ""}
      {on ? (open ? "" : " · closed at this time") : ""}</p>
    {status && <p className={"sc-live live-" + status.tone}>{status.tone === "on" && "● "}{status.text}</p>}
    <p className="sc-meta">{[item.kind !== "venue" && item.dates ? item.dates : null, item.kind === "venue" ? null : "On " + daysText(item), item.admission].filter(Boolean).join(" · ")}</p>
    {m && <p className="sc-meta">{m.address}{walk && walk.metres < 15000 ? ` · ${walk.minutes} min walk from you` : ""}{m.pinSource?.includes("approximate") ? " · map pin approximate" : ""}</p>}
    <p className="sc-access"><Accessibility size={16} />{m?.accessible ? "Step-free entrance listed" : "Step-free access isn’t listed by Art Week. Ask the venue."}</p>
    <ReactionButtons big value={reaction} onChange={(r) => onReact(r, note)} title={item.title} />
    {friends.length > 0 && <p className="sc-friends">{friends.map((f) => `${f.name}: ${REACTIONS.find((x) => x.key === f.reaction)!.label}${f.note ? ` (“${f.note}”)` : ""}`).join(" · ")}</p>}
    {noteOpen ? <label className="sc-note">Why you’d like to go <span>(optional, your group sees it)</span>
      <textarea value={note} onChange={(e) => onNote(e.target.value)} maxLength={240} placeholder="Looks like our kind of thing…" />
      <button className="text-button" onClick={() => onReact(reaction ?? "up", note)}>Save note{reaction ? "" : " (as Up for it)"}</button></label>
      : <button className="text-button sc-add-note" onClick={() => setNoteOpen(true)}>Add a note for your group</button>}
    <div className="sc-actions">
      <a className="sc-official" href={item.url} target="_blank" rel="noreferrer">Official page<ArrowUpRight size={16} /></a>
      <button className={"sc-add" + (inRoute ? " added" : "")} data-track={inRoute ? "Already in plan" : on ? "Add to plan" : "Not on this day"} onClick={onAdd} disabled={inRoute || !on} data-wn="add">
        {inRoute ? <>In your {routeLabel}<Check size={17} /></> : on ? <><Plus size={17} />Add to {routeLabel}</> : <>Not on {d.name}</>}</button>
    </div>
    {on && also.length > 0 && <p className="sc-also">Also add to: {also.map((a) => <button key={a.label} data-track="Also add to another plan" className="text-button" disabled={a.added} onClick={a.onAdd}>{a.added ? <Check size={13} /> : <Plus size={13} />}{a.label}</button>)}</p>}
    {here.length > 0 && <div className="sc-here"><h3>What’s on here during Art Week</h3>{here.map((e) => <button key={e.id} onClick={() => onPick(e)} className={onDay(e, day) ? "" : "off"}>
      <i style={{ background: onDay(e, day) ? groupOf(e).color : CLOSED }} /><span>{e.title}<small>{onDay(e, day) ? hoursText(e, day) : "Not on " + d.name} · {daysText(e)}</small></span><ChevronRight size={16} /></button>)}</div>}
    <p className="sc-source">From <a href={item.url} target="_blank" rel="noreferrer">amsterdamart.com</a>. Times can change: always check the official page.</p>
  </section>;
}
