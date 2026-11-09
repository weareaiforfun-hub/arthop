import { useCallback, useEffect, useMemo, useState } from "react";
import { Accessibility, ArrowUpRight, Check, Layers, LocateFixed, Map as MapIcon, MapPin, Minus, Navigation, Plus, Route, Search, SlidersHorizontal, Undo2, Users, X } from "lucide-react";
import { activities, byId, byMuseum, clock, COLORS, dayOf, DAYS, dayRange, disciplineOf, GROUPS, initials, KIND_LABEL, museumItem, museums, onDay, openAt, setCurrentDay, type GroupId, type Item, type Kind, type UiStop } from "./lib/catalogue";
import { addStopOps, derive, personalRouteOps, replaceRouteOps, rescheduleOps, useSync } from "./lib/night";
import { newId, sync, type Op } from "./lib/sync";
import { MapView, type MapLine } from "./components/map-view";
import { RouteIdeas, type Proposal } from "./components/route-ideas";
import { ActivityFeed, describe } from "./components/live";
import { Timeline } from "./components/timeline";
import { ShareDialog } from "./components/share-dialog";
import { Crews } from "./components/crews";
import { CONTACT, MAKER, introSeen, Onboarding, type HelpTab, type Place } from "./components/onboarding";
import { BackupNudge, KeepSpot, OtherDevice, RecoverByEmail, TwoDoors, YourSpot } from "./components/keep-spot";
import { GettingAround, RideCard } from "./components/getting-around";
import { MODES } from "./data/transport";
import exampleIdeas from "./data/route-ideas.json";
import { Decide, type ReactionKey } from "./components/decide";
import { track } from "./lib/track";
import { amsterdamNow, dayMinute, mapsNext, nextStop, todayId, useLocation, walkFrom } from "./lib/location";
import { GoogleMapsSheet } from "./components/google-maps";
import { DayBar, TimeBar } from "./components/days";
import { StopCard } from "./components/stop-card";
import { ProgrammeList, sortProgramme, type Chip } from "./components/programme";
import { DayActions, DayStops, daySummary, DrawnTitle, RouteSwitch, ViewLinks, type Face, type RouteChoice } from "./components/my-day";
import { loadWalk, NowCard, saveWalk, walkIndex, type WalkState } from "./components/now";
import { FriendsTop } from "./components/friends";
import { PrintDay } from "./components/print-day";
import { analyse, leg } from "./lib/plan";

type Tab = "programme" | "day" | "friends";
type DayView = "list" | "timeline" | "ideas" | "suggested";
type Kindish = RouteChoice["kind"];
type Undo = { text: string; ops: Op[] };

/** Built-in suggested routes: readable by everyone, with or without a group. Each stop carries its day. */
const SUGGESTED: Proposal[] = exampleIdeas.map((idea, i) => ({ id: "suggested-" + (i + 1), member_id: "arthop", title: idea.title, description: idea.description, practical: idea.practical, route: idea.route as UiStop[], checked_at: "" }));
const SUGGESTER = [{ id: "arthop", name: "Suggested route" }];

/** Invite token -> group id, so a returning browser opens its group without asking for a name again. */
const KNOWN = "ah:nights";
const known = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KNOWN) ?? "{}"); } catch { return {}; } };
const remember = (token: string, nightId: string) => { try { localStorage.setItem(KNOWN, JSON.stringify({ ...known(), [token]: nightId })); } catch { /* private mode */ } };
const EXAMPLE_NAME = ["Sanne", "Daan", "Noor", "Sam", "Gallery Hopper", "Mondriaan Fan", "Rietveld Rider"][Math.floor(Math.random() * 7)];
const pref = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const setPref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

/** The day to open on: today during Art Week, Sunday after it, and before it the Thursday Gallery Night. */
function startDay() {
  const t = todayId();
  if (t) return t;
  return amsterdamNow().date > DAYS[4].id ? DAYS[4].id : DAYS[1].id;
}
/** The time to show on a day: now on the day itself, else the start of Gallery Night on Thursday, else 14:00. */
function startAt(day: string) {
  const now = dayMinute(new Date(), day);
  const [lo, hi] = dayRange(day);
  if (now != null) return Math.min(Math.max(now, lo), hi);
  return day === DAYS[1].id ? 17 * 60 : 14 * 60;
}

export default function App() {
  const { data, status, userId } = useSync();
  const [day, setDayState] = useState(startDay);
  setCurrentDay(day); // before anything below reads opening hours
  const [at, setAt] = useState(() => startAt(day)), [atMoved, setAtMoved] = useState(false);
  const today = todayId(), live = day === today && !atMoved;
  const [tab, setTab] = useState<Tab>("programme"), [dayView, setDayView] = useState<DayView>("list"), [kind, setKind] = useState<Kindish>("personal");
  const [friendsView, setFriendsView] = useState<"top" | "decide">("top");
  const [previewId, setPreviewId] = useState<string | null>(null), [previewStops, setPreviewStops] = useState<UiStop[] | null>(null);
  const [query, setQuery] = useState(""), [openOnly, setOpenOnly] = useState(false), [stepFree, setStepFree] = useState(false);
  const [types, setTypes] = useState<Set<string>>(new Set()), [groups, setGroups] = useState<Set<GroupId>>(new Set()), [kinds, setKinds] = useState<Set<Kind>>(new Set());
  const [free, setFree] = useState(false), [picksOnly, setPicksOnly] = useState(false), [personFilter, setPersonFilter] = useState("all"), [venuesToo, setVenuesToo] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [invite, setInvite] = useState(""), [nightId, setNightId] = useState(""), [resolving, setResolving] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false), [deviceOpen, setDeviceOpen] = useState(false), [nudgeOpen, setNudgeOpen] = useState(false), [doorChosen, setDoorChosen] = useState(false), [switchLink, setSwitchLink] = useState(false), [, setLinkMade] = useState(0);
  const loc = useLocation(), [locateTick, setLocateTick] = useState(0), [gmapsOpen, setGmapsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false), [emailReady, setEmailReady] = useState(false), [recoverOpen, setRecoverOpen] = useState(false), [printOpen, setPrintOpen] = useState(false);
  useEffect(() => { sync?.emailReady().then(setEmailReady); }, []);
  const [name, setName] = useState(pref("ah:name")), [color, setColor] = useState(pref("ah:color") || COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [note, setNote] = useState(""), [selected, setSelected] = useState<Item | null>(null), [focus, setFocus] = useState<string | null>(null), [fit, setFit] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [toast, setToast] = useState(""), [undo, setUndo] = useState<Undo | null>(null), [nameDialog, setNameDialog] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string | null>(null), [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false), [helpTab, setHelpTab] = useState<HelpTab>("what");
  const [ridesOpen, setRidesOpen] = useState(false), [layers, setLayers] = useState(() => new Set(MODES.filter((m) => m.on).map((m) => m.id)));
  const [hideVenues, setHideVenues] = useState(false), [ride, setRide] = useState<{ mode: string; stop: number } | null>(null);
  const [zoom, setZoom] = useState({ by: 0, tick: 0 });
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("half"), [nowMode, setNowMode] = useState(false), [walk, setWalk] = useState<WalkState>(() => loadWalk(day));
  const shownModes = useMemo(() => (ridesOpen ? MODES.filter((m) => layers.has(m.id)) : []), [ridesOpen, layers]);
  const rideMode = ride && shownModes.find((m) => m.id === ride.mode);

  /* ---------- the day and the time shown ---------- */
  function pickDay(id: string) {
    if (id === day) return;
    setCurrentDay(id); setDayState(id); setAt(startAt(id)); setAtMoved(false); setWalk(loadWalk(id)); setNowMode(false);
    setPreviewStops(null); setPreviewId(null); setFit((f) => f + 1);
    track("day", { day: id });
  }
  useEffect(() => { // on the day itself, the time follows the clock until someone moves the slider
    if (!live) return;
    const t = setInterval(() => setAt(startAt(day)), 30_000);
    return () => clearInterval(t);
  }, [live, day]);
  useEffect(() => { if (day === today && tab === "day") setNowMode(true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the group ---------- */
  const night = useMemo(() => (data ? derive(data, userId, day) : null), [data, userId, day]);
  const identity = night?.me;
  const realMembers = night?.members.filter((m) => !m.fictional) ?? [];
  const shared = night?.stopsOf(night.shared?.id) ?? [];
  const mine = night?.stopsOf(night.mine?.id) ?? [];
  const crewRoute = night?.crewRoute(night.myCrewId);
  const crewStops = night?.stopsOf(crewRoute?.id) ?? [];
  const myCrewName = data?.ah_crews.find((c) => c.id === night?.myCrewId)?.name;
  const sharedDays = night?.daysOf(night.shared?.id) ?? {};
  const choices: RouteChoice[] = [
    { kind: "personal", label: "Mine" },
    ...(identity && (realMembers.length > 1 || Object.keys(sharedDays).length) ? [{ kind: "shared" as const, label: "Our group" }] : []),
    ...(crewRoute ? [{ kind: "crew" as const, label: myCrewName ?? "Crew" }] : []),
  ];
  const routeKind: Kindish = choices.some((c) => c.kind === kind) ? kind : "personal";
  const routeRow = routeKind === "shared" ? night?.shared : routeKind === "crew" ? crewRoute : night?.mine;
  const stops = routeKind === "shared" ? shared : routeKind === "crew" ? crewStops : mine;
  const canEdit = routeKind === "personal" ? true : identity?.role !== "viewer";
  const routeName = routeKind === "personal" ? "your route" : routeKind === "shared" ? "our route" : `${myCrewName}’s route`;
  const dayName = dayOf(day).name;
  const dayLabel = `${routeKind === "shared" ? "Our" : routeKind === "crew" ? (myCrewName ?? "Crew") + "’s" : "My"} ${dayName}`;
  const proposals: Proposal[] = useMemo(() => (night?.personal ?? []).map((r) => ({
    id: r.id, member_id: r.owner_user!, title: r.title || (night!.memberOf.get(r.owner_user!)?.display_name ?? "Someone") + "’s route",
    description: r.description, practical: r.practical, route: night!.stopsOf(r.id), checked_at: r.updated_at,
  })), [night]);
  const people = useMemo(() => (night?.members ?? []).map((m) => ({ id: m.user_id, name: m.display_name, fictional: m.fictional ? 1 : 0, color: m.color })), [night]);
  const suggestions = useMemo(() => (data?.ah_reactions ?? []).filter((r) => r.reaction !== "skip"), [data]);
  const myReaction = (eventId: string) => data?.ah_reactions.find((r) => r.user_id === userId && r.event_id === eventId)?.reaction;
  const canEditShared = !!identity && identity.role !== "viewer";
  const nameOf = (uid: string) => night?.memberOf.get(uid)?.display_name;
  const proposal = proposals.find((p) => p.id === previewId) ?? SUGGESTED.find((p) => p.id === previewId);
  const proposalStops = proposal ? proposal.route.filter((s) => (s.day ?? day) === day) : null;
  const mapStops = previewStops || proposalStops || stops;

  /* ---------- which group: the invite token in the address ---------- */
  useEffect(() => {
    const readLocation = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("night") || "";
      setPreviewId(null); setSelected(null); setError("");
      setInvite(token);
      if (token && !/^[a-f0-9]{64}$/.test(token)) { setError("This invitation link is incomplete. Ask your friend for the whole link."); return; }
      const id = token ? known()[token] : "";
      setNightId(id || "");
      if (!id) sync?.close();
      if (token && !id && sync) {
        setResolving(true);
        sync.memberNight(token).then((found) => { if (found) { remember(token, found); setNightId(found); } }).finally(() => setResolving(false));
      }
    };
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);
  useEffect(() => { if (nightId && sync) sync.open(nightId, { name: pref("ah:name"), color: pref("ah:color") }).catch((e) => setError(e.message)); }, [nightId]);
  useEffect(() => sync?.onNotice((n) => (n.kind === "error" ? setError(n.text) : setToast(n.text))), []);
  useEffect(() => { sync?.ready.then(() => { if (sync!.linkProblem) setError(sync!.linkProblem); if (sync!.pendingLink) setSwitchLink(true); }); }, []);
  const backedUp = !!identity && !!sync?.backedUp();
  const planned = !!data && (data.ah_reactions.some((r) => r.user_id === userId) || data.ah_stops.some((s) => s.updated_by === userId));
  useEffect(() => {
    if (!identity || backedUp || !planned || !emailReady || !introSeen()) return;
    const asked = "ah:backup-asked:" + userId;
    if (pref(asked)) return;
    const t = setTimeout(() => { setPref(asked, "1"); setNudgeOpen(true); track("backup-nudge"); }, 1500);
    return () => clearTimeout(t);
  }, [identity?.id, backedUp, planned, emailReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (identity) sync?.updatePresence({ name: identity.display_name, color: identity.color }); }, [identity?.display_name, identity?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 7000); return () => clearTimeout(t); }, [undo]);
  useEffect(() => {
    if (!selected && !nameDialog && !filtersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); setNameDialog(false); setFiltersOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, nameDialog, filtersOpen]);
  useEffect(() => { setPreviewStops(null); }, [previewId, tab, dayView]);
  useEffect(() => { if (identity) track("in-group", { role: identity.role, people: realMembers.length }); }, [identity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- changes ---------- */
  /** Shows ops at once and saves them; with a label, offers to undo. */
  function run(ops: Op[], label?: string) {
    if (!sync || !ops.length) return;
    if (!identity) { setNameDialog(true); return; }
    const inverse = sync.apply(ops);
    if (label) setUndo({ text: label, ops: inverse });
  }
  const title = (id: string) => byId.get(id)?.title ?? "stop";
  function addShared(id: string) { if (night?.shared) run(addStopOps(night.shared, shared, id), `Added ${title(id)} to our ${dayName}`); }
  function addCrew(id: string) { if (crewRoute) run(addStopOps(crewRoute, crewStops, id), `Added ${title(id)} to ${myCrewName}’s ${dayName}`); }
  function addPersonal(id: string) {
    if (!night || !identity) { setPendingAdd(id); setNameDialog(true); return; }
    if (night.mine) run(addStopOps(night.mine, mine, id), `Added ${title(id)} to your ${dayName}`);
    else run(personalRouteOps(identity.night_id, userId, undefined, identity.display_name + "’s route", [{ id, arrival: "", duration: 45, day }]).ops, `Added ${title(id)} to your ${dayName}`);
  }
  function addTo(id: string) {
    if (!onDay(byId.get(id), day)) { setToast(`That isn’t on ${dayName}.`); return; }
    track("stop-add", { route: routeKind });
    if (routeKind === "shared") addShared(id); else if (routeKind === "crew") addCrew(id); else addPersonal(id);
  }
  const inRoute = (id: string) => stops.some((s) => s.id === id);
  function toggleAdd(e: Item) {
    const s = stops.find((x) => x.id === e.id);
    if (s?.rowId) run([{ t: "delete", table: "ah_stops", id: s.rowId }], `Removed ${e.title} from ${routeName}`);
    else addTo(e.id);
  }
  useEffect(() => { // the stop someone tapped before they had a name
    if (!pendingAdd || !identity || !night) return;
    const id = pendingAdd; setPendingAdd(null); addPersonal(id);
  }, [pendingAdd, identity?.id, night?.night?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Replaces my personal route for this day with these stops (e.g. a suggested order). */
  function proposeMine(next: UiStop[]) {
    if (!night || !identity) { setNameDialog(true); return; }
    const clear: Op[] = mine.map((s) => ({ t: "delete", table: "ah_stops", id: s.rowId! }));
    run([...clear, ...personalRouteOps(identity.night_id, userId, night.mine, night.mine?.title || identity.display_name + "’s route", next.map((s) => ({ ...s, day })), []).ops], "Saved as your route idea");
    setToast("Saved as your route idea. Friends can compare it under Route ideas.");
  }
  function react(eventId: string, reaction: ReactionKey | null, withNote?: string) {
    if (!night || !identity) { setNameDialog(true); return; }
    const row = data!.ah_reactions.find((r) => r.user_id === userId && r.event_id === eventId);
    track("reaction", { kind: reaction ?? "clear", note: !!withNote });
    if (!reaction) { if (row) run([{ t: "delete", table: "ah_reactions", id: row.id }]); return; }
    run(row ? [{ t: "update", table: "ah_reactions", id: row.id, patch: { reaction, note: withNote ?? row.note, updated_at: new Date().toISOString() } }]
      : [{ t: "insert", table: "ah_reactions", row: { id: newId(), night_id: identity.night_id, user_id: userId, event_id: eventId, reaction, note: withNote ?? "" } }]);
  }
  function vote(routeId: string | null) {
    if (!identity) { setNameDialog(true); return; }
    const row = data!.ah_idea_votes.find((v) => v.user_id === userId);
    run(!routeId ? (row ? [{ t: "delete", table: "ah_idea_votes", id: row.id }] : [])
      : row ? [{ t: "update", table: "ah_idea_votes", id: row.id, patch: { route_id: routeId } }]
      : [{ t: "insert", table: "ah_idea_votes", row: { id: newId(), night_id: identity.night_id, user_id: userId, route_id: routeId } }]);
  }
  async function adoptIdea(id: string) {
    if (!identity) { setNameDialog(true); return; }
    setBusy(true);
    try { await sync!.rpc("ah_adopt_route", { p_route: id, p_day: day }); track("route-adopt", { from: "idea" }); setPreviewId(null); setKind("shared"); setDayView("list"); setFit((f) => f + 1); setError(""); setToast(`Our ${dayName} is ready. Everyone can adjust it.`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  /** Uses a suggested route for its day as the plan shown (mine, the group's or the crew's); without a group, makes one first. */
  function adoptSuggested(id: string) {
    const idea = SUGGESTED.find((p) => p.id === id);
    if (!idea || !data) { if (idea) { setPendingSuggestion(id); setNameDialog(true); } return; }
    if (!identity || !night) { setPendingSuggestion(id); setNameDialog(true); return; }
    const ideaDay = idea.route[0]?.day ?? day;
    if (ideaDay !== day) pickDay(ideaDay);
    const target = routeKind === "shared" && canEditShared ? night.shared : routeKind === "crew" ? crewRoute : night.mine;
    const current = derive(data, userId, ideaDay).stopsOf(target?.id);
    track("route-adopt", { from: "suggested", route: idea.id });
    if (!target) run(personalRouteOps(identity.night_id, userId, undefined, identity.display_name + "’s route", idea.route).ops, `Using “${idea.title}”`);
    else run(replaceRouteOps(target, current, idea.route), `Using “${idea.title}” for ${dayOf(ideaDay).name}`);
    setPreviewId(null); setDayView("list"); setTab("day"); setFit((f) => f + 1);
  }
  useEffect(() => {
    if (!pendingSuggestion || !identity || !night) return;
    const id = pendingSuggestion; setPendingSuggestion(null); adoptSuggested(id);
  }, [pendingSuggestion, identity?.id, night?.night?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function enter() {
    if (!sync || !name.trim()) return;
    setBusy(true); setError("");
    setPref("ah:name", name.trim()); setPref("ah:color", color);
    try {
      if (identity && nameDialog) {
        run([{ t: "update", table: "ah_members", id: identity.id, patch: { display_name: name.trim(), color } }]);
        setNameDialog(false);
        return;
      }
      const token = invite || await sync.createNight("Art Week 2026", name.trim(), color);
      const id = await sync.joinNight(token, name.trim(), color);
      remember(token, id);
      history.replaceState(null, "", "#night=" + token);
      setInvite(token);
      if (id === nightId) await sync.reload(); else setNightId(id);
      setNameDialog(false); setKind("personal"); setPreviewId(null);
      track(invite ? "night-join" : "night-create", { via: pendingSuggestion ? "suggested" : pendingAdd ? "add" : "start" });
      setToast(invite ? "You joined the group." : "Saved. Invite friends any time from Friends.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!invite) { setNameDialog(true); return; }
    if (identity) { setShareOpen(true); return; }
    try { await navigator.clipboard.writeText(location.origin + location.pathname + "#night=" + invite); setToast("Invite link copied. Anyone with it can join and plan."); }
    catch { setToast("Copy the invitation from your browser’s address bar."); }
  }

  /* ---------- the programme for the day ---------- */
  const groupMatch = (e: Item, g: GroupId) => e.disciplines.some((d) => (GROUPS.find((x) => x.id === g)!.match as readonly string[]).includes(d));
  const filtered = useMemo(() => {
    let list = activities.filter((e) => onDay(e, day));
    if (venuesToo) list = [...list, ...museums.filter((m) => day in m.hours).map(museumItem)];
    if (types.size) list = list.filter((e) => e.tags.some((t) => types.has(t)));
    if (groups.size) list = list.filter((e) => e.kind === "venue" || [...groups].some((g) => groupMatch(e, g)));
    if (kinds.size) list = list.filter((e) => kinds.has(byMuseum.get(e.museumId ?? "")?.kind ?? "other"));
    if (free) list = list.filter((e) => e.admission === "Free admission");
    if (openOnly) list = list.filter((e) => openAt(e, at, day));
    if (query.trim()) { const q = query.toLocaleLowerCase(); list = list.filter((e) => [e.title, e.venue, e.tags.join(" "), e.disciplines.join(" "), byMuseum.get(e.museumId || "")?.address, byMuseum.get(e.museumId || "")?.area].join(" ").toLocaleLowerCase().includes(q)); }
    if (picksOnly) list = list.filter((e) => suggestions.some((s) => s.event_id === e.id && (personFilter === "all" || s.user_id === personFilter)));
    return sortProgramme(list, day, at, loc.spot);
  }, [day, at, query, types, groups, kinds, free, openOnly, picksOnly, personFilter, suggestions, venuesToo, loc.spot]); // eslint-disable-line react-hooks/exhaustive-deps
  const filterCount = types.size + groups.size + kinds.size + (free ? 1 : 0) + (picksOnly ? 1 : 0) + (venuesToo ? 1 : 0);
  const toggle = <T,>(set: Set<T>, v: T, put: (s: Set<T>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); put(n); };
  const clearFilters = () => { setTypes(new Set()); setGroups(new Set()); setKinds(new Set()); setFree(false); setPicksOnly(false); setVenuesToo(false); setOpenOnly(false); setQuery(""); setStepFree(false); };
  const openLabel = live ? "Open now" : `Open at ${clock(at)}`;
  const chips: Chip[] = [
    ...[...groups].map((g) => ({ key: "g" + g, label: GROUPS.find((x) => x.id === g)!.label, onRemove: () => toggle(groups, g, setGroups) })),
    ...[...types].map((t) => ({ key: "t" + t, label: t, onRemove: () => toggle(types, t, setTypes) })),
    ...[...kinds].map((k) => ({ key: "k" + k, label: KIND_LABEL[k] + "s", onRemove: () => toggle(kinds, k, setKinds) })),
    ...(free ? [{ key: "free", label: "Free", onRemove: () => setFree(false) }] : []),
    ...(picksOnly ? [{ key: "picks", label: "Friends’ picks", onRemove: () => setPicksOnly(false) }] : []),
    ...(venuesToo ? [{ key: "venues", label: "Venues too", onRemove: () => setVenuesToo(false) }] : []),
    ...(openOnly ? [{ key: "open", label: openLabel, onRemove: () => setOpenOnly(false) }] : []),
    ...(stepFree ? [{ key: "step", label: "♿ Step-free", onRemove: () => setStepFree(false) }] : []),
  ];
  const allTypes = useMemo(() => Array.from(new Set(activities.flatMap((e) => e.tags))).sort(), []);
  const openVenues = useMemo(() => new Set(museums.filter((m) => openAt(museumItem(m), at, day) || activities.some((e) => e.museumId === m.id && openAt(e, at, day))).map((m) => m.id)), [at, day]);
  const isOpen = useCallback((id: string) => openVenues.has(id), [openVenues]);
  function pick(e: Item) { setSelected(e); setFocus(e.museumId); setNote(data?.ah_reactions.find((r) => r.event_id === e.id && r.user_id === userId)?.note || ""); track("details-open", { kind: e.kind }); }
  const likes = (id: string) => {
    const who = suggestions.filter((s) => s.event_id === id && s.user_id !== userId).map((s) => nameOf(s.user_id)).filter(Boolean);
    return who.length ? `${who.slice(0, 2).join(" and ")}${who.length > 2 ? " and more" : ""} ${who.length === 1 ? "likes" : "like"} this` : "";
  };
  /** Others in the group who have this on their plan for the day, or want to see it. */
  const faces = (id: string): Face[] => {
    if (!night) return [];
    const out = new Map<string, Face>();
    for (const r of night.personal) { if (r.owner_user === userId) continue; if (night.stopsOf(r.id).some((s) => s.id === id)) { const m = night.memberOf.get(r.owner_user!); if (m && !m.fictional) out.set(m.user_id, { name: m.display_name, color: m.color }); } }
    for (const s of suggestions) if (s.event_id === id && s.user_id !== userId) { const m = night.memberOf.get(s.user_id); if (m && !m.fictional) out.set(m.user_id, { name: m.display_name, color: m.color }); }
    return [...out.values()];
  };

  /* ---------- the map ---------- */
  const labels = useMemo(() => analyse(mapStops).slots.map((s) => `${clock(s.start)} · ${disciplineOf(byId.get(s.id))} · ${s.duration} min`), [mapStops]);
  const lines: MapLine[] = useMemo(() => {
    const crewLines = tab === "friends" && !previewStops && night && data?.ah_crews.length
      ? data.ah_crews.filter((c) => c.id !== night.myCrewId || routeKind !== "crew").map((c) => ({ stops: night.stopsOf(night.crewRoute(c.id)?.id), color: c.color })) : [];
    return [{ stops: mapStops, color: "#111", numbered: true, labels }, ...crewLines];
  }, [mapStops, labels, tab, previewStops, night, data?.ah_crews, routeKind]);
  const visible = ridesOpen && hideVenues ? [] : proposalStops ? proposalStops.map((s) => byId.get(s.id)!).filter(Boolean) : filtered;
  const nextIndex = !previewStops && !proposal ? nextStop(stops) : -1;
  const nextItem = nextIndex >= 0 ? byId.get(stops[nextIndex].id) : undefined;
  const nextWalk = nextItem ? (loc.spot ? walkFrom(loc.spot, nextItem.museumId)?.minutes : nextIndex > 0 ? leg(stops[nextIndex - 1].id, stops[nextIndex].id).minutes : null) : null;
  const go = nextItem ? { label: `Go: ${stops[nextIndex].mode === "bike" ? "cycle" : "walk"} to ${nextItem.kind === "venue" ? nextItem.title : byMuseum.get(nextItem.museumId ?? "")?.name ?? nextItem.venue}${nextWalk ? ` · ${nextWalk} min` : ""}`, href: mapsNext(stops[nextIndex]), onClick: () => track("google-maps", { kind: "go" }) } : null;

  /* ---------- walking it (Now) ---------- */
  const walkAt = walkIndex(stops, walk);
  const markWalk = (k: "done" | "skipped") => { const s = stops[walkAt]; if (!s) return; const next = { ...walk, [k]: [...walk[k], s.rowId ?? s.id] }; setWalk(next); saveWalk(day, next); };
  const groupLine = useMemo(() => {
    if (!data || !night) return null;
    const last = data.ah_activity.find((a) => a.user_id && a.user_id !== userId && !night.memberOf.get(a.user_id)?.fictional);
    return last ? describe(last, data, night) : null;
  }, [data, night, userId]);
  const loading = (resolving || !!nightId) && !night?.members.length && status?.conn !== "offline";
  const doorPending = /[#&]night=/.test(location.hash) && !identity && !doorChosen;
  const doors = doorPending && !!invite && !loading;
  const emailLink = async (address: string) => { const made = await sync!.emailMyLink(address, invite); setLinkMade((n) => n + 1); return made; };
  const lastChange = data?.ah_activity[0];

  const joinForm = (
    <form className="join-form" onSubmit={(e) => { e.preventDefault(); enter(); }}>
      <label htmlFor="your-name">Your name</label>
      <input id="your-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder={"e.g. " + EXAMPLE_NAME} autoComplete="given-name" required />
      <div className="color-choice" role="radiogroup" aria-label="Your colour">
        {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={"Colour " + c} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}
      </div>
      <button className="btn big" disabled={busy || !name.trim()}>{busy ? "Saving…" : identity && nameDialog ? "Save name" : invite ? "Join this group" : "Save my Art Week"}</button>
      <small>No account needed. Your name is remembered in this browser. Friends you invite later see your plan and can plan with you.</small>
    </form>
  );

  if (!sync) return <main className="config-missing"><h1>ArtHop</h1><p>The backend isn't configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></main>;

  /* ---------- pieces used in both layouts ---------- */
  const filterPanel = <div className="filters-panel" role="dialog" aria-label="Filters">
    <div className="fp-head"><h2>Filters</h2><button className="sc-close" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X size={20} /></button></div>
    <h3>What it is</h3>
    <div className="fp-chips">{GROUPS.map((g) => <button key={g.id} className={"chip" + (groups.has(g.id) ? " on" : "")} aria-pressed={groups.has(g.id)} onClick={() => toggle(groups, g.id, setGroups)}><i className="fp-dot" style={{ background: g.color }} />{g.label}</button>)}</div>
    <h3>Kind of entry</h3>
    <div className="fp-chips">{allTypes.map((t) => <button key={t} className={"chip" + (types.has(t) ? " on" : "")} aria-pressed={types.has(t)} onClick={() => toggle(types, t, setTypes)}>{t}</button>)}</div>
    <h3>Kind of place</h3>
    <div className="fp-chips">{(["gallery", "project-space", "museum", "residency", "partner", "corporate", "other"] as Kind[]).map((k) => <button key={k} className={"chip" + (kinds.has(k) ? " on" : "")} aria-pressed={kinds.has(k)} onClick={() => toggle(kinds, k, setKinds)}>{k === "other" ? "Other places" : KIND_LABEL[k] + "s"}</button>)}</div>
    <h3>More</h3>
    <div className="fp-chips">
      <button className={"chip" + (free ? " on" : "")} aria-pressed={free} onClick={() => setFree(!free)}>Free admission</button>
      <button className={"chip" + (openOnly ? " on" : "")} aria-pressed={openOnly} onClick={() => setOpenOnly(!openOnly)}>{openLabel}</button>
      <button className={"chip" + (stepFree ? " on" : "")} aria-pressed={stepFree} onClick={() => setStepFree(!stepFree)}><Accessibility size={15} />Step-free</button>
      <button className={"chip" + (venuesToo ? " on" : "")} aria-pressed={venuesToo} onClick={() => setVenuesToo(!venuesToo)}>List venues too</button>
      {identity && <button className={"chip" + (picksOnly ? " on" : "")} aria-pressed={picksOnly} onClick={() => setPicksOnly(!picksOnly)}>Friends’ picks</button>}
    </div>
    {picksOnly && <select className="fp-person" aria-label="Whose picks" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}><option value="all">Everyone’s picks</option>{people.filter((p) => !p.fictional).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
    <div className="fp-foot"><button className="text-button" onClick={clearFilters}>Clear all</button><button className="btn" onClick={() => setFiltersOpen(false)}>Show {filtered.length}</button></div>
  </div>;

  const programme = <>
    {stepFree && <p className="notice">Art Week’s pages don’t list step-free access for any venue yet, so this can’t narrow the list. Each card says so; ask the venue before you go.</p>}
    <ProgrammeList list={filtered} day={day} at={at} me={loc.spot} live={live} openOnly={openOnly} chips={chips} inRoute={inRoute} onAdd={toggleAdd} onPick={pick} likes={likes} routeLabel={dayLabel.replace(/^My /, "")} onClear={clearFilters} />
    <footer className="data-note">Programme from amsterdamart.com, imported 9 Nov 2026. Check the official page for changes.<br />Unofficial fan planner, not affiliated with Amsterdam Art Week. · <button className="link" onClick={() => { setHelpTab("data"); setHelpOpen(true); }}>Your data</button> · <a className="link" href={CONTACT}>Contact</a> · <a className="link" href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></footer>
  </>;

  const timeline = <Timeline stops={stops} title={dayLabel} onPick={pick} onPropose={proposeMine} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }}
    onReschedule={canEdit ? (next, label) => run(rescheduleOps(stops, next), label) : null} route={routeRow} onOps={canEdit ? run : null} />;
  const daySuggested = SUGGESTED.filter((p) => p.route[0]?.day === day);
  const ideasCount = proposals.filter((p) => p.route.length).length + daySuggested.length;
  const decideBox = night && data && realMembers.length > 1 && (() => {
    const ids = new Set(data.ah_reactions.filter((r) => onDay(byId.get(r.event_id), day)).map((r) => r.event_id));
    const splitCount = [...ids].filter((id) => { const rs = data.ah_reactions.filter((r) => r.event_id === id); return rs.some((r) => r.reaction === "skip") && rs.some((r) => r.reaction !== "skip"); }).length;
    const others = realMembers.filter((m) => m.user_id !== userId).map((m) => m.display_name);
    return <div className="decide-box"><p><b>{others.slice(0, 2).join(" and ")}{others.length > 2 ? ` and ${others.length - 2} more` : ""} {others.length === 1 ? "is" : "are"} in.</b> {splitCount ? `${splitCount} ${splitCount === 1 ? "pick" : "picks"} still split.` : "No split picks."}</p><button className="btn" onClick={() => { setTab("friends"); setFriendsView("decide"); }}>Decide</button></div>;
  })();

  const myDay = <section className="my-day" aria-label={dayLabel}>
    <div className="md-head"><DrawnTitle day={day} /><p className="md-sub">{daySummary(day, stops)}</p>
      <RouteSwitch choices={choices} kind={routeKind} onKind={(k) => { setKind(k); setFit((f) => f + 1); }} /></div>
    {loading ? <p className="md-empty">Loading your group…</p>
      : dayView === "ideas" ? <>
        <ViewLinks view={dayView} onView={setDayView} ideas={ideasCount} />
        {night && proposals.length > 0 && <RouteIdeas votes={data?.ah_idea_votes ?? []} proposals={proposals} members={people} events={byId} previewId={previewId} onPreview={(id) => { setPreviewId(id); setFit((f) => f + 1); }} onAdopt={adoptIdea} onSelect={pick} busy={busy} currentRoute={shared} />}
        <RouteIdeas suggested proposals={daySuggested} members={SUGGESTER} events={byId} previewId={previewId} onPreview={(id) => { setPreviewId(id); setFit((f) => f + 1); }} onAdopt={async (id) => adoptSuggested(id)} onSelect={pick} busy={busy} currentRoute={stops} />
        {SUGGESTED.some((p) => p.route[0]?.day !== day) && <p className="md-other-days">More suggested routes on {DAYS.filter((d) => d.id !== day && SUGGESTED.some((p) => p.route[0]?.day === d.id)).map((d) => <button key={d.id} className="link" onClick={() => pickDay(d.id)}>{d.name}</button>)}</p>}
      </>
      : !stops.length ? <div className="md-empty">
        <p>Nothing on {routeKind === "personal" ? "your" : "this"} {dayName} yet. Tap <b>+</b> on anything in the programme, or start from a suggested route.</p>
        <div className="two"><button className="btn" onClick={() => setTab("programme")}><Search size={16} />Find things</button><button className="btn alt" onClick={() => setDayView("ideas")}><Route size={16} />Suggested routes</button></div>
        {routeKind === "personal" && shared.length > 0 && identity && <button className="link" onClick={() => run(personalRouteOps(identity.night_id, userId, night!.mine, identity.display_name + "’s route", shared, mine).ops, "Copied our route")}>Start with a copy of our group’s {dayName}</button>}
        {!identity && <button className="link" onClick={() => setRecoverOpen(true)}>Already planning on another device? Get back in</button>}
      </div>
      : <>
        {dayView === "timeline" ? timeline : <DayStops stops={stops} run={run} canEdit={canEdit} onPick={pick} faces={faces} routeName={routeName} onReschedule={canEdit ? (next, label) => run(rescheduleOps(stops, next), label) : null} />}
        <ViewLinks view={dayView} onView={setDayView} ideas={ideasCount} />
        {decideBox}
        <button className="btn big phone-only" onClick={() => setNowMode(true)}>Start my walk</button>
        <DayActions day={day} go={go} onMaps={() => setGmapsOpen(true)} onPrint={() => { setPrintOpen(true); track("print"); }} hasStops={stops.length > 0} />
        {lastChange && data && night && <p className="last-change">Last change: {describe(lastChange, data, night)}</p>}
      </>}
  </section>;

  const nowCard = <NowCard stops={stops} index={walkAt} me={loc.spot} onHere={() => markWalk("done")} onSkip={() => markWalk("skipped")} onPick={pick} groupLine={groupLine}
    onWholeDay={() => setNowMode(false)} onRestart={() => { const w = { done: [], skipped: [] }; setWalk(w); saveWalk(day, w); }} />;

  const friends = friendsView === "decide" && data && night ? <section className="friends-decide">
    <button className="link" onClick={() => setFriendsView("top")}>← Back to Friends</button>
    <Decide data={data} night={night} userId={userId} proposals={proposals} onPick={pick} onReact={(id, r) => react(id, r)}
      onDeadline={identity?.role === "organiser" ? (iso) => run([{ t: "update", table: "ah_nights", id: night.night!.id, patch: { vote_deadline: iso } }]) : null}
      onVote={vote} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }} onPropose={proposeMine}
      onUseShared={canEditShared && night.shared ? (next) => { run(replaceRouteOps(night.shared!, shared, next), `Replaced our ${dayName} with the draft`); setKind("shared"); setTab("day"); } : null} />
  </section> : <>
    <FriendsTop data={data} night={night} userId={userId} day={day} onInvite={share} onPick={pick} onDecide={() => setFriendsView("decide")} inGroup={!!identity} onStart={() => setNameDialog(true)} />
    {identity && data && night && <Crews data={data} night={night} userId={userId} canWrite={canEditShared} shared={shared} run={run} onPick={pick}
      onChooseStops={() => { setKind("crew"); setTab("programme"); }} onPreview={(p) => { setPreviewStops(p); if (p) setFit((f) => f + 1); }} onPropose={proposeMine} routeView="list" toggle={null} />}
    {identity && data && night && <section className="activity-panel"><h3>What changed</h3><ActivityFeed data={data} night={night} /></section>}
  </>;

  const tabLabel = (t: Tab) => t === "programme" ? "Programme" : t === "day" ? `My ${dayName}` : `Friends${realMembers.length > 1 ? " · " + realMembers.length : ""}`;
  const here = status?.here ?? [];

  function card() {
    if (!selected) return null;
    const n = stops.findIndex((s) => s.id === selected.id);
    const also = [
      ...(routeKind !== "personal" ? [{ label: "Mine", added: mine.some((s) => s.id === selected.id), onAdd: () => addPersonal(selected.id) }] : []),
      ...(routeKind !== "shared" && identity && night?.shared && choices.some((c) => c.kind === "shared") ? [{ label: "Our group", added: shared.some((s) => s.id === selected.id), onAdd: () => addShared(selected.id) }] : []),
      ...(routeKind !== "crew" && crewRoute ? [{ label: myCrewName ?? "Crew", added: crewStops.some((s) => s.id === selected.id), onAdd: () => addCrew(selected.id) }] : []),
    ];
    const friendsSaid = (data?.ah_reactions ?? []).filter((r) => r.event_id === selected.id && r.user_id !== userId && !night?.memberOf.get(r.user_id)?.fictional).map((r) => ({ name: nameOf(r.user_id) ?? "Someone", reaction: r.reaction, note: r.note }));
    return <StopCard item={selected} day={day} at={at} me={loc.spot} stopNumber={n >= 0 ? n + 1 : null} routeLabel={dayLabel.replace(/^My /, "")} inRoute={n >= 0}
      onAdd={() => addTo(selected.id)} also={also} reaction={myReaction(selected.id)} onReact={(r, nt) => react(selected.id, r, nt)} note={note} onNote={setNote}
      friends={friendsSaid} onPick={pick} onClose={() => setSelected(null)} />;
  }

  return <main className={"app tab-" + tab + (nowMode && tab === "day" && stops.length ? " now-mode" : "") + " sheet-" + sheet}>
    {/* ---------- header: one row plus the days on desktop; search, filters and ? on phones ---------- */}
    <header className="top">
      <div className="top-row">
        <a href="./" className="brand" aria-label="ArtHop home">arthop</a>
        <span className="brand-sub">Amsterdam Art Week<br />18–22 Nov</span>
        <label className="search chip" data-tour="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artists, galleries, shows" aria-label="Search artists, galleries and shows" />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button>}</label>
        <button className={"chip filters-button" + (filterCount ? " on" : "")} aria-expanded={filtersOpen} aria-label={"Filters" + (filterCount ? `, ${filterCount} on` : "")} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17} /><span className="label">Filters{filterCount ? ` · ${filterCount}` : ""}</span>{filterCount > 0 && <i className="badge">{filterCount}</i>}</button>
        <button className={"chip desk-only" + (openOnly ? " on" : "")} aria-pressed={openOnly} onClick={() => setOpenOnly(!openOnly)}>{openLabel}{openOnly && <Check size={15} />}</button>
        <button className={"chip desk-only" + (stepFree ? " on" : "")} aria-pressed={stepFree} onClick={() => setStepFree(!stepFree)}><Accessibility size={16} />Step-free</button>
        <span className="grow" />
        {identity && <span className={"chip live-chip desk-only " + (status?.conn ?? "")} role="status"><i />{status?.conn === "offline" ? `Offline${status.pending ? ` · ${status.pending} to sync` : ""}` : status?.pending ? "Saving…" : `Live · ${Math.max(1, here.length)} here`}</span>}
        {identity && <span className="faces desk-only" aria-label={realMembers.map((m) => m.display_name).join(", ")}>{realMembers.slice(0, 4).map((m) => <i key={m.id} title={m.display_name} style={{ background: m.color }}>{initials(m.display_name)}</i>)}</span>}
        {invite && !identity && !loading && <button className="chip desk-only" onClick={() => setNameDialog(true)}>Join this group</button>}
        <button className="chip on desk-only" onClick={share}>Invite</button>
        <button className="chip help-button" aria-label="How ArtHop works" title="How ArtHop works (?)" onClick={() => { setHelpTab("what"); setHelpOpen(true); }}>?</button>
        <button className="chip desk-only your-link" title="Your private link, no account" onClick={() => (identity ? setMenuOpen(true) : setRecoverOpen(true))}>Your link</button>
      </div>
      <DayBar day={day} onDay={pickDay} counts={night?.daysOf(routeRow?.id)} />
      {filtersOpen && !isPhone() && <div className="filters-pop">{filterPanel}</div>}
    </header>
    {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError("")}><X size={16} /></button></div>}
    {identity && !backedUp && <button className="spot-banner" onClick={() => setSpotOpen(true)}><span>Your plan lives only in this browser so far.</span><b>Keep it</b></button>}

    {/* ---------- phone heading for My day, above its map ---------- */}
    {tab === "day" && !(nowMode && stops.length) && <div className="phone-head"><div><DrawnTitle day={day} /><p className="md-sub">{daySummary(day, stops)}</p></div>
      {stops.length > 0 && <button className="ph-print" aria-label={`Print or share my ${dayName}`} onClick={() => setPrintOpen(true)}><ArrowUpRight size={22} /></button>}</div>}

    <div className="workspace">
      <section className="map-panel" aria-label="Map of Amsterdam">
        <MapView isOpen={isOpen} transport={{ modes: shownModes, selected: ride, onSelect: (mode, stop) => setRide({ mode, stop }) }} visible={visible} lines={lines} onSelect={pick} focus={focus} fit={fit} me={loc.spot} locate={locateTick} zoomBy={zoom.by} zoomTick={zoom.tick} />
        {proposal && <div className="preview-banner"><span>Preview: {proposal.title}</span><button onClick={() => setPreviewId(null)} aria-label="Close preview"><X size={15} /></button></div>}
        {previewStops && <div className="preview-banner"><span>Preview: suggested order</span><button onClick={() => setPreviewStops(null)} aria-label="Close preview"><X size={15} /></button></div>}
        <button className={"map-btn rides-button" + (ridesOpen ? " on" : "")} aria-pressed={ridesOpen} aria-label="Getting around" onClick={() => { setRidesOpen(!ridesOpen); setRide(null); }} data-tour="rides"><Layers size={19} /><span>Getting around</span></button>
        <div className="map-controls">
          <button className="map-btn desk-only" aria-label="Zoom in" onClick={() => setZoom((z) => ({ by: 1, tick: z.tick + 1 }))}><Plus size={20} /></button>
          <button className="map-btn desk-only" aria-label="Zoom out" onClick={() => setZoom((z) => ({ by: -1, tick: z.tick + 1 }))}><Minus size={20} /></button>
          <button className={"map-btn locate-button" + (loc.status === "on" ? " on" : loc.status === "blocked" ? " blocked" : "")} aria-pressed={loc.status === "on"} aria-label={loc.status === "on" ? "Centre the map on me" : "Show where I am"}
            onClick={() => { setLocateTick((n) => n + 1); if (loc.status !== "on") { track("locate", { from: loc.status }); loc.toggle(); } }}>{loc.status === "on" ? <LocateFixed size={20} /> : <Navigation size={18} />}</button>
        </div>
        {tab === "day" && stops.length > 0 && <button className="map-btn open-map phone-only" onClick={() => { setTab("programme"); setFit((f) => f + 1); }}>Open map</button>}
        {loc.status === "on" && <button className="locate-off" onClick={loc.toggle}>Hide my location</button>}
        {loc.status === "waiting" && <p className="locate-note" role="status">Finding you…</p>}
        {loc.status === "blocked" && <p className="locate-note" role="alert"><b>Location is blocked for this site.</b> Turn it on in your browser’s site settings, then tap the arrow again.<button aria-label="Close" onClick={loc.dismiss}><X size={14} /></button></p>}
        {loc.status === "unavailable" && <p className="locate-note" role="alert"><b>Can’t find your location right now.</b> Try again outside.<button aria-label="Close" onClick={loc.dismiss}><X size={14} /></button></p>}
        {loc.status === "explain" && <div className="locate-explain" role="dialog" aria-label="Show where you are?">
          <b>Show where you are?</b>
          <p>A blue dot shows you on the map, with walking times from where you stand. Your location stays on this phone: nobody in your group sees it, and ArtHop doesn’t store it.</p>
          <button className="btn" autoFocus onClick={loc.start}>Show my location</button>
          <button className="text-button" onClick={loc.dismiss}>Not now</button>
        </div>}
        {ridesOpen && <GettingAround className="in-map" modes={MODES} layers={layers} hideVenues={hideVenues} onHideVenues={setHideVenues} onClose={() => { setRidesOpen(false); setRide(null); }}
          onToggle={(id) => { setLayers((l) => { const n = new Set(l); if (n.has(id)) n.delete(id); else n.add(id); return n; }); if (ride?.mode === id) setRide(null); }} />}
        {ride && rideMode && <RideCard mode={rideMode} stop={ride.stop} onClose={() => setRide(null)} />}
        <div className="map-legend desk-only" data-tour="legend">
          <b>Colour: what it is</b>
          <div className="lg-grid">{GROUPS.map((g) => <span key={g.id}><i style={{ background: g.color }} />{g.label.split(" & ")[0]}</span>)}</div>
          <p><b>Size:</b> how long you stay · <b>Grey:</b> closed {live ? "now" : `at ${clock(at)}`}</p>
        </div>
        <p className="map-credit">Map © Kadaster / PDOK</p>
        {selected && !isPhone() && <div className="card-float">{card()}</div>}
      </section>
      <div className="time-wrap"><TimeBar day={day} at={at} onAt={(n) => { setAt(n); setAtMoved(true); }} live={live} onLive={day === today ? () => { setAtMoved(false); setAt(startAt(day)); } : undefined} /></div>

      {/* ---------- the side panel (desktop) / the tab's content (phone) ---------- */}
      <aside className="panel" aria-label="Programme and plan">
        <nav className="panel-tabs" role="tablist" aria-label="Views">{(["programme", "day", "friends"] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); if (t === "friends") setFriendsView("top"); }} data-tour={"tab-" + t}>{tabLabel(t)}</button>)}</nav>
        <button className="sheet-handle" aria-label={sheet === "full" ? "Show more map" : "Show more list"} onClick={() => setSheet(sheet === "peek" ? "half" : sheet === "half" ? "full" : "peek")}><span /></button>
        <div className="panel-body">
          {tab === "programme" ? programme : tab === "day" ? (nowMode && stops.length ? nowCard : myDay) : friends}
        </div>
      </aside>
    </div>

    {/* ---------- phone tab bar ---------- */}
    <nav className="tabbar" aria-label="ArtHop">
      <button className={tab === "programme" ? "on" : ""} aria-current={tab === "programme" ? "page" : undefined} onClick={() => setTab("programme")} data-tour="tab-programme-phone"><MapIcon size={24} />Discover</button>
      <button className={tab === "day" ? "on" : ""} aria-current={tab === "day" ? "page" : undefined} onClick={() => setTab("day")} data-tour="tab-day-phone">{day === today ? <MapPin size={24} /> : <Route size={24} />}{day === today ? "Now" : `My ${dayName}`}</button>
      <button className={tab === "friends" ? "on" : ""} aria-current={tab === "friends" ? "page" : undefined} onClick={() => { setTab("friends"); setFriendsView("top"); }} data-tour="tab-friends-phone"><Users size={24} />Friends{realMembers.length > 1 && <i className="badge">{realMembers.length}</i>}</button>
    </nav>

    {(toast || undo) && <div className="toast" role="status"><Check size={17} /><span>{toast || undo!.text}</span>{!toast && undo && <button className="toast-undo" onClick={() => { sync!.apply(undo.ops); setUndo(null); }}><Undo2 size={14} />Undo</button>}</div>}
    {selected && isPhone() && <div className="sheet-backdrop" onClick={() => setSelected(null)}><div className="card-sheet" onClick={(e) => e.stopPropagation()}>{card()}</div></div>}
    {filtersOpen && isPhone() && <div className="sheet-backdrop" onClick={() => setFiltersOpen(false)}><div className="card-sheet" onClick={(e) => e.stopPropagation()}>{filterPanel}</div></div>}
    {printOpen && <PrintDay day={day} stops={stops} title={dayLabel} onClose={() => setPrintOpen(false)} />}
    <Onboarding hold={doorPending || recoverOpen || nameDialog} inNight={!!identity} helpOpen={helpOpen} setHelpOpen={setHelpOpen} helpTab={helpTab} show={(p: Place) => {
      setSelected(null); setPreviewId(null); setFiltersOpen(false);
      if (p.tab) setTab(p.tab);
      if (p.dayView) { setDayView(p.dayView); setNowMode(false); }
      if (p.sheet) setSheet(p.sheet);
    }} />
    {spotOpen && identity && sync && <KeepSpot name={identity.display_name} nightName="your Art Week group" saved={sync.savedPersonalLink()}
      onCreate={async () => { const link = await sync!.newPersonalLink(invite); setLinkMade((n) => n + 1); return link; }} onClose={() => setSpotOpen(false)}
      emailReady={emailReady} onEmail={emailLink} onSaved={() => sync!.markBackedUp()} />}
    {menuOpen && identity && <YourSpot name={identity.display_name} backedUp={backedUp} onClose={() => setMenuOpen(false)} onOtherDevice={() => { setMenuOpen(false); setDeviceOpen(true); }} onLink={() => { setMenuOpen(false); setSpotOpen(true); }}
      onName={() => { setMenuOpen(false); setName(identity.display_name); setColor(identity.color); setNameDialog(true); }} />}
    {deviceOpen && identity && sync && <OtherDevice name={identity.display_name} saved={sync.savedPersonalLink()} emailReady={emailReady} onEmail={emailLink} onSaved={() => sync!.markBackedUp()} onClose={() => setDeviceOpen(false)}
      onCreate={async () => { const link = await sync!.newPersonalLink(invite); setLinkMade((n) => n + 1); return link; }} />}
    {nudgeOpen && !menuOpen && !spotOpen && !deviceOpen && <BackupNudge onEmail={emailLink} onClose={() => setNudgeOpen(false)} />}
    {doors && <TwoDoors onNew={() => { setDoorChosen(true); setNameDialog(true); }} onBack={() => { setDoorChosen(true); setRecoverOpen(true); track("get-back-in"); }} onLook={() => setDoorChosen(true)} />}
    {recoverOpen && sync && <RecoverByEmail emailReady={emailReady} onSend={(address) => sync!.recoverByEmail(address)} onClose={() => setRecoverOpen(false)} />}
    {gmapsOpen && <GoogleMapsSheet stops={stops} title={dayLabel} onClose={() => setGmapsOpen(false)} />}
    {shareOpen && identity && invite && <ShareDialog invite={invite} nightId={identity.night_id} canPlan={identity.role !== "viewer"} onClose={() => setShareOpen(false)} />}
    {switchLink && sync?.pendingLink && <div className="modal-backdrop"><section className="name-modal" role="dialog" aria-modal="true" aria-label="Open this personal link?">
      <h2>Open this personal link?</h2>
      <p>This browser is already someone in a group. The link switches it to the person the link belongs to, with their plans. This browser’s current spot stays safe only if that person has a personal link of their own.</p>
      <button className="btn big" onClick={async () => { try { await sync!.useLink(sync!.pendingLink!); location.reload(); } catch (e) { setSwitchLink(false); setError((e as Error).message); } }}>Switch to the link’s person</button>
      <button className="text-button" onClick={() => { sync!.pendingLink = null; setSwitchLink(false); }}>Stay as I am</button>
    </section></div>}
    {nameDialog && <div className="modal-backdrop" onClick={() => setNameDialog(false)}><section className="name-modal" role="dialog" aria-modal="true" aria-label={identity ? "Your name" : "Save your Art Week"} onClick={(e) => e.stopPropagation()}>
      <button className="sc-close" aria-label="Close" onClick={() => setNameDialog(false)}><X size={20} /></button>
      <h2>{identity ? "Your name" : invite ? "Join your friends" : "Save your Art Week"}</h2>
      <p>{identity ? "This is how your name appears to your group." : invite ? "Add your name to plan together." : "Add a name to keep your plan. You can invite friends to plan with you whenever you like."}</p>
      {error && <p className="dialog-error" role="alert">{error}</p>}{joinForm}
    </section></div>}
  </main>;
}
