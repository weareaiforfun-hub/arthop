import { Plus } from "lucide-react";
import { byId, dayOf, onDay, type Item } from "../lib/catalogue";
import type { Derived } from "../lib/night";
import type { Data } from "../lib/sync";

const short = { must: "Must", up: "Up", skip: "Skip" } as const;

/** Everything about the group in one tab: who's in, the picks you share, deciding, crews and what changed (board 61). */
export function FriendsTop({ data, night, userId, day, onInvite, onPick, onDecide, inGroup, onStart }: {
  data: Data | undefined; night: Derived | null; userId: string; day: string; onInvite: () => void; onPick: (e: Item) => void; onDecide: () => void; inGroup: boolean; onStart: () => void;
}) {
  const d = dayOf(day);
  if (!inGroup || !night || !data) return <section className="friends-top">
    <h2 className="big-title">Friends</h2>
    <p className="friends-sub">Plan Art Week together: friends react to what you pick, you see who’s coming to each stop, and you decide together.</p>
    <button className="btn big" onClick={onStart}><Plus size={18} />Start a group</button>
    <p className="friends-note">No account needed. You get an invite link to send; anyone with it can join and plan.</p>
  </section>;
  const people = night.members.filter((m) => !m.fictional);
  const name = (uid: string) => (uid === userId ? "You" : night.memberOf.get(uid)?.display_name ?? "Someone");
  // Picks on this day: who reacted how, and who hasn't yet.
  const byEvent = new Map<string, Map<string, "must" | "up" | "skip">>();
  for (const r of data.ah_reactions) {
    if (!people.some((p) => p.user_id === r.user_id) || !onDay(byId.get(r.event_id), day)) continue;
    if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, new Map());
    byEvent.get(r.event_id)!.set(r.user_id, r.reaction);
  }
  const rows = [...byEvent.entries()].map(([id, by]) => {
    const vals = [...by.values()], pos = vals.filter((v) => v !== "skip").length, skip = vals.length - pos;
    const missing = people.filter((p) => !by.has(p.user_id));
    const state = pos && skip ? "split" : missing.length && people.length > 1 ? "waiting" : pos ? "in" : "skip";
    return { id, item: byId.get(id), by, state, missing, score: pos * 2 - skip + vals.length };
  }).filter((r) => r.item).sort((a, b) => b.score - a.score);
  const split = rows.filter((r) => r.state === "split").length;
  return <section className="friends-top">
    <h2 className="big-title">Friends</h2>
    <p className="friends-sub">{d.name} · {people.length} {people.length === 1 ? "of you so far" : "of you"}</p>
    <div className="friends-people">
      <span className="faces">{people.slice(0, 8).map((m) => <i key={m.id} title={m.display_name} style={{ background: m.color }}>{m.display_name.slice(0, 1).toUpperCase()}</i>)}</span>
      <button className="btn alt" onClick={onInvite} data-tour="invite"><Plus size={16} />Invite</button>
    </div>
    <div className="picks-head"><h3>Your picks together</h3><span>{rows.length ? `${split} split` : ""}</span></div>
    {!rows.length && <p className="friends-note">Nothing picked for {d.name} yet. Open anything on the map and tap Must-see, Up for it or Skip; your group sees it here.</p>}
    <ul className="picks">{rows.slice(0, 6).map((r) => <li key={r.id}>
      <button data-track="Group pick" onClick={() => onPick(r.item!)}><b>{r.item!.title}</b>
        <small>{[...r.by.entries()].map(([uid, v]) => `${name(uid)}: ${short[v]}`).join(" · ")}{r.state === "waiting" ? ` · waiting on ${r.missing.map((m) => name(m.user_id)).join(" and ")}` : ""}</small></button>
      <span className={"pick-state " + r.state}>{r.state === "in" ? "All in" : r.state === "split" ? "Split" : r.state === "waiting" ? "Waiting" : "Skip"}</span>
    </li>)}</ul>
    {rows.length > 0 && <button className="btn big" onClick={onDecide}>Decide together</button>}
  </section>;
}
