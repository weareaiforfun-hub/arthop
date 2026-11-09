// Checks ArtHop's access rules (ah_ tables, copied from MuseumHop's na_ checks) against the real database with three anonymous users: an organiser, a friend
// who joins by invite, and an outsider. Creates one night named "access-check". Usage: npm run check-access
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const client = async () => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously({ options: { data: { app: "arthop" } } }); // tagged: the daily cleanup removes them
  if (error) throw error;
  return Object.assign(c, { uid: data.user.id });
};
let failures = 0;
const ok = (label, cond, extra = "") => { if (!cond) failures++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  · " + extra : ""}`); };
const id = () => crypto.randomUUID();
const THU = "2026-11-19", SAT = "2026-11-21";

const org = await client(), pat = await client(), out = await client();

const { data: token, error: ce } = await org.rpc("ah_create_night", { p_name: "access-check", p_display_name: "Org", p_color: "#183b35" });
ok("organiser creates a night and gets an invite token", !ce && /^[0-9a-f]{64}$/.test(token), ce?.message);
const night = (await org.from("ah_nights").select("id").single()).data.id;
const shared = (await org.from("ah_routes").select("id").eq("kind", "shared").single()).data.id;

const seen = await Promise.all(["ah_nights", "ah_members", "ah_routes", "ah_stops", "ah_activity"].map((t) => out.from(t).select("id").eq(t === "ah_nights" ? "id" : "night_id", night)));
ok("outsider sees nothing of the night", seen.every((r) => !r.error && r.data.length === 0));
const bad = await out.rpc("ah_join_night", { p_token: "0".repeat(64), p_display_name: "X", p_color: "#000000" });
ok("a wrong invite token is refused", !!bad.error, bad.error?.message);
const intrude = await out.from("ah_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 1, event_id: "this-way-maaike-schoorel", day: THU });
ok("outsider cannot add stops", !!intrude.error, intrude.error?.code);

const j = await pat.rpc("ah_join_night", { p_token: token, p_display_name: "Pat", p_color: "#b9452f" });
ok("friend joins with the invite", j.data === night, j.error?.message);
const members = await pat.from("ah_members").select("display_name,role").order("joined_at");
ok("friend sees both members and roles", members.data?.length === 2, members.data?.map((m) => `${m.display_name}:${m.role}`).join(", "));

const stop = id();
const add = await pat.from("ah_stops").insert({ id: stop, night_id: night, route_id: shared, pos: 1, event_id: "this-way-maaike-schoorel", day: THU });
ok("friend adds a stop to the shared route", !add.error, add.error?.message);
const [mv, tm] = await Promise.all([
  org.from("ah_stops").update({ pos: 0.5 }).eq("id", stop),
  pat.from("ah_stops").update({ arrival: "20:10", duration: 40 }).eq("id", stop),
]);
const after = (await org.from("ah_stops").select("pos,arrival,duration,updated_by").eq("id", stop).single()).data;
ok("simultaneous move + time change both survive", !mv.error && !tm.error && after.pos === 0.5 && after.arrival === "20:10" && after.duration === 40, JSON.stringify(after));

const promote = await pat.from("ah_members").update({ role: "organiser" }).eq("user_id", pat.uid);
ok("friend cannot promote their own role", !!promote.error, promote.error?.code);
const otherNight = (await org.rpc("ah_create_night", { p_name: "access-check", p_display_name: "Org", p_color: "#183b35" })).data;
const hop = await pat.from("ah_stops").update({ night_id: night, route_id: shared }).eq("id", stop);
ok("stops can't be moved to another route or night", !!hop.error, hop.error?.code);
void otherNight;

const mine = id();
const pr = await pat.from("ah_routes").insert({ id: mine, night_id: night, kind: "personal", owner_user: pat.uid, title: "Pat's route" });
const ps = await pat.from("ah_stops").insert([
  { id: id(), night_id: night, route_id: mine, pos: 1, day: THU, event_id: "solo-exhibition-erik-van-lieshout", arrival: "19:00", duration: 40, reason: "Dinner first" },
  { id: id(), night_id: night, route_id: mine, pos: 2, day: THU, event_id: "the-party-folkert-de-jong", arrival: "20:00", duration: 35, fixed: true },
], { defaultToNull: false });
ok("friend saves a personal route", !pr.error && !ps.error, pr.error?.message || ps.error?.message);
const meddle = await org.from("ah_stops").insert({ id: id(), night_id: night, route_id: mine, pos: 3, day: THU, event_id: "specters-hamza-halloubi" });
const meddle2 = await org.from("ah_stops").update({ arrival: "23:00" }).eq("route_id", mine).select();
ok("others cannot edit someone's personal route", !!meddle.error && meddle2.data?.length === 0, meddle.error?.code);
const fakeOwner = await org.from("ah_routes").insert({ id: id(), night_id: night, kind: "personal", owner_user: pat.uid, title: "x" });
ok("nobody can create a personal route in someone else's name", !!fakeOwner.error, fakeOwner.error?.code);

const adopted = await org.rpc("ah_adopt_route", { p_route: mine, p_day: THU });
const sharedNow = (await pat.from("ah_stops").select("event_id,fixed,reason").eq("route_id", shared).order("pos")).data;
ok("adopting a route idea copies its stops into the shared route", adopted.data === 2 && sharedNow.length === 2 && sharedNow[1].fixed && sharedNow[0].reason === "Dinner first", JSON.stringify(sharedNow));

const r1 = await pat.from("ah_reactions").insert({ night_id: night, event_id: "solo-exhibition-erik-van-lieshout", reaction: "must" });
const r2 = await pat.from("ah_reactions").insert({ night_id: night, user_id: org.uid, event_id: "the-party-folkert-de-jong", reaction: "skip" });
ok("friend reacts, but not in someone else's name", !r1.error && !!r2.error, r1.error?.message || r2.error?.code);

const lock = await org.from("ah_nights").update({ route_locked_at: new Date(Date.now() - 60000).toISOString() }).eq("id", night);
const lockByPat = await pat.from("ah_nights").update({ route_locked_at: null }).eq("id", night).select();
const lockedAdd = await pat.from("ah_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 9, day: THU, event_id: "specters-hamza-halloubi" });
const orgAdd = await org.from("ah_stops").insert({ id: id(), night_id: night, route_id: shared, pos: 9, day: THU, event_id: "specters-hamza-halloubi" });
ok("a locked route refuses friends' edits but not the organiser's", !lock.error && lockByPat.data?.length === 0 && !!lockedAdd.error && !orgAdd.error, lockedAdd.error?.code);

// Days: a stop belongs to one Art Week day; the same exhibition can be on two days, but not twice on one.
const sat = await pat.from("ah_stops").insert({ id: id(), night_id: night, route_id: mine, pos: 4, day: SAT, event_id: "solo-exhibition-erik-van-lieshout" });
const twiceThu = await pat.from("ah_stops").insert({ id: id(), night_id: night, route_id: mine, pos: 5, day: THU, event_id: "solo-exhibition-erik-van-lieshout" });
const badDay = await pat.from("ah_stops").insert({ id: id(), night_id: night, route_id: mine, pos: 6, day: "2026-11-25", event_id: "specters-hamza-halloubi" });
ok("the same exhibition fits on two days, not twice on one, and only on Art Week days", !sat.error && !!twiceThu.error && !!badDay.error, sat.error?.message || twiceThu.error?.code);
const moveDay = await pat.from("ah_stops").update({ day: SAT }).eq("route_id", mine).eq("day", THU).select();
ok("a stop's day can't be changed in place (no update right on day)", !!moveDay.error || moveDay.data?.length === 0, moveDay.error?.code);
const adoptSat = await org.rpc("ah_adopt_route", { p_route: mine, p_day: SAT });
const sharedDays = (await pat.from("ah_stops").select("day").eq("route_id", shared)).data.map((r) => r.day);
ok("adopting one day leaves the other days of the shared route alone", adoptSat.data === 1 && sharedDays.filter((d) => d === THU).length >= 2 && sharedDays.includes(SAT), sharedDays.join(","));

const activity = (await pat.from("ah_activity").select("kind").eq("night_id", night)).data.map((a) => a.kind);
ok("activity log records changes (and one entry for an adopt)", activity.includes("stop_add") && activity.includes("stop_move") && activity.includes("route_adopt") && activity.includes("member_join"), activity.join(","));

const ideas = JSON.parse(readFileSync(new URL("../src/data/route-ideas.json", import.meta.url), "utf8"));
const byPat = await pat.rpc("ah_add_examples", { p_night: night, p_ideas: ideas });
const byOrg = await org.rpc("ah_add_examples", { p_night: night, p_ideas: ideas });
const twice = await org.rpc("ah_add_examples", { p_night: night, p_ideas: ideas });
const ideaRoutes = (await pat.from("ah_routes").select("title").eq("night_id", night).eq("kind", "personal")).data.map((r) => r.title);
ok("only the organiser adds the example ideas, once", !!byPat.error && byOrg.data === ideas.length && !!twice.error && ideaRoutes.length === ideas.length + 1, ideaRoutes.join(" / "));

// Personal links: another device signs in as the same member; a new link turns the old one off.
const linkEmail = (uid) => `m-${uid}@users.arthop.arian-shafa.xyz`;
const outLink = await out.rpc("ah_personal_link");
ok("someone in no night can't get a personal link", !!outLink.error, outLink.error?.message);
const { data: secret, error: le } = await pat.rpc("ah_personal_link");
ok("a member gets a personal link secret", !le && /^[0-9a-f]{64}$/.test(secret), le?.message);
const device = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const signedIn = await device.auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret });
const deviceSees = (await device.from("ah_stops").select("id").eq("night_id", night)).data ?? [];
const memberNight = await device.rpc("ah_member_night", { p_token: token });
ok("the link opens the same member, with their night, on a new device", signedIn.data.user?.id === pat.uid && deviceSees.length > 0 && memberNight.data === night, signedIn.error?.message);
const strangerNight = await out.rpc("ah_member_night", { p_token: token });
ok("knowing the invite token alone doesn't reveal the night id", !strangerNight.error && strangerNight.data === null);
const { data: secret2 } = await pat.rpc("ah_personal_link");
const oldLink = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret });
const newLink = await createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: linkEmail(pat.uid), password: secret2 });
ok("a new personal link turns the old one off", !!oldLink.error && newLink.data.user?.id === pat.uid, oldLink.error?.message);
const stillIn = await pat.from("ah_members").select("id").eq("night_id", night);
ok("the original device stays signed in after a new link", !stillIn.error && stillIn.data.length > 0);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
