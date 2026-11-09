import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { ArrowLeft, ArrowRight, Mail, X } from "lucide-react";

/** Problems and ideas go straight to the developer. The address in the link never includes invite or personal links. */
export const CONTACT = "mailto:arian.shafa.analytics@gmail.com?subject=" + encodeURIComponent("ArtHop: a problem or an idea")
  + "&body=" + encodeURIComponent("What happened, or what would you like?\n\n\nPhone or computer, and which browser:\n");
export const MAKER = "https://arian-shafa.xyz";

/** Which part of the app a spotlight step needs on screen (phones show one tab at a time). */
export type Place = { tab?: "programme" | "day" | "friends"; dayView?: "list" | "timeline" | "ideas"; sheet?: "peek" | "half" | "full" };
type Spot = Place & { target: string; title: string; body: string };

const SEEN = "ah:intro-seen";
export const introSeen = () => { try { return !!localStorage.getItem(SEEN); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* private mode */ } };

/** What's new compared with MuseumHop, on the welcome card and in the help panel. */
const NEW = [
  { color: "#f5d90a", title: "Five days, five moods", body: "Pick a day. Each has its own theme and opening hours, from the first openings on Wednesday to Family Sunday." },
  { color: "#2b3bff", title: "Your walk becomes a drawing", body: "Every stop adds a colour, sized by how long you stay. Print it or share it afterwards." },
  { color: "#ff4fa3", title: "Open now, closed in grey", body: "Slide the time along the bottom of the map, so you never walk to a locked door." },
];

/** The optional tour: four steps, each pointing at the real screen (board 64). A target can list several selectors; the
 *  first one on screen wins, so a step works on phones and on computers. */
const TOUR: Spot[] = [
  { tab: "programme", target: "[data-tour=search]", title: "Search and filter", body: "Look for an artist, a gallery or a street. Filters narrow it to painting, photography, tours, free entry and more." },
  { tab: "programme", target: "[data-tour=days]", title: "Pick a day", body: "Each day of Art Week has its own theme and opening hours. Thursday is Gallery Night, 17:00–21:00." },
  { tab: "programme", sheet: "half", target: ".pg-add, .pg-rows, .map-panel", title: "Tap + to add it to your day", body: "Your walk draws itself on the map: a colour for what it is, a size for how long you stay, a bold line for the walk. Grey dots are closed at the time shown." },
  { target: "[data-tour=tab-friends], [data-tour=tab-friends-phone]", title: "Bring your friends", body: "Invite friends with one link, no account. See their picks, decide together, split into crews and meet up." },
];

type Feature = Spot & { needsNight?: boolean; group: string };
/** Everything ArtHop does: all of MuseumHop's functions, plus Art Week's own. `needsNight` ones need a saved plan. */
const FEATURES: Feature[] = [
  { group: "Find things", tab: "programme", target: "[data-tour=search]", title: "Search and filters", body: "Search artists, galleries, shows or streets. Filter by what it is, kind of entry (exhibition, opening, tour, talk), kind of place, free entry, open now or your friends’ picks." },
  { group: "Find things", tab: "programme", target: ".map-panel", title: "Every venue on the map", body: "Coloured by what’s on there; grey while closed at the time shown. Tap a dot to open it, or a ring to zoom into venues close together." },
  { group: "Find things", tab: "programme", target: ".pg-main, .pg-rows", title: "Details and the official page", body: "Tap anything for its hours that day, admission, address, how far it is from you, and a link to its page on amsterdamart.com." },
  { group: "Find things", tab: "programme", target: ".locate-button", title: "Show my location", body: "A blue dot, with walking times from where you stand. Your location stays on your phone." },
  { group: "Find things", tab: "programme", target: "[data-tour=rides]", title: "Getting around", body: "The free ferries to Noord on the map, plus tips for trams, metro and bikes." },
  { group: "Plan your day", tab: "day", target: ".my-day, .phone-head", title: "My day, with walking minutes", body: "Your plan for the day as a list, with the walk between stops. Drag a stop by its handle to move it; tap its time to change it or mark it maybe." },
  { group: "Plan your day", tab: "day", dayView: "timeline", target: ".timeline, .my-day", needsNight: true, title: "Timeline, clashes and a suggested order", body: "See the day on a timeline. Clashes show in red with “Push later stops”; a suggested order walks less and keeps to opening hours. Walk, bike or car; export to your calendar." },
  { group: "Plan your day", tab: "day", dayView: "ideas", target: "[data-tour=ideas], .route-ideas", title: "Route ideas", body: "Suggested routes for each day, and the routes your friends made. Preview one on the map, then use it." },
  { group: "Plan your day", tab: "day", target: ".day-actions, .my-day", needsNight: true, title: "Go, Google Maps, and Now", body: "Go opens walking directions to your next stop. On the day itself, My day turns into Now: one stop, how far, one big button." },
  { group: "Plan your day", tab: "day", target: "[data-wn=print], .ph-print", needsNight: true, title: "Print my day (new)", body: "Your day as a drawing with the stops listed underneath. Print it or save it as a PDF." },
  { group: "With your group", target: "[data-tour=tab-friends], [data-tour=tab-friends-phone]", title: "Plan with friends", body: "One invite link, everyone gets a colour. No accounts." },
  { group: "With your group", tab: "programme", target: ".pg-main, .pg-rows", title: "Must-see, Up for it, Skip", body: "React to anything from its card, with an optional note. Your group sees it." },
  { group: "With your group", tab: "friends", target: ".friends-top", title: "Friends’ picks and Decide", body: "Your picks together, who’s in and what’s split, and Decide for a vote and a draft plan from the favourites." },
  { group: "With your group", tab: "friends", target: ".crews, .friends-top", needsNight: true, title: "Crews and meet-up points", body: "Split into small groups with their own plans and meet up along the way, with a “We’re here” button." },
  { group: "With your group", tab: "friends", target: ".activity-panel, .friends-top", needsNight: true, title: "Live changes, activity and undo", body: "Changes show for everyone at once, What changed lists them, and your own can be undone from the message that appears." },
  { group: "With your group", tab: "friends", target: "[data-tour=invite], .friends-top", needsNight: true, title: "View-only link", body: "Under Invite: people with it see your plans, times and places, but no names or votes, and can’t change anything." },
  { group: "Your spot and your data", target: ".your-link, .spot-banner, .help-button", needsNight: true, title: "Keep your spot: a personal link", body: "A private link that opens your plan as you on any device, no account. Keep it to yourself." },
  { group: "Your spot and your data", tab: "programme", target: ".data-note", title: "See what’s stored about you", body: "Your data explains who sees your plan, what ArtHop keeps and that it’s all deleted 30 days after Art Week." },
];
const GROUPS = Array.from(new Set(FEATURES.map((f) => f.group)));

/** Step through slides by swiping or scrolling (wheel or trackpad), on top of the buttons and arrow keys. One gesture
 *  moves one step: a trackpad's long scroll is ignored until it has stopped. */
function useFlip(onNext?: () => void, onBack?: () => void) {
  const g = useRef({ sum: 0, locked: false, timer: 0, x: 0, y: 0, swiped: false });
  const flip = (forward: boolean) => { (forward ? onNext : onBack)?.(); };
  return {
    onWheel(e: React.WheelEvent) {
      const s = g.current, d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      clearTimeout(s.timer);
      s.timer = window.setTimeout(() => { s.locked = false; s.sum = 0; }, 220);
      if (s.locked) return;
      s.sum += d;
      if (Math.abs(s.sum) > 50) { s.locked = true; flip(s.sum > 0); }
    },
    onTouchStart(e: React.TouchEvent) { g.current.x = e.touches[0].clientX; g.current.y = e.touches[0].clientY; g.current.swiped = false; },
    onTouchEnd(e: React.TouchEvent) {
      const t = e.changedTouches[0], dx = t.clientX - g.current.x, dy = t.clientY - g.current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      g.current.swiped = true; // not a tap: don't let it close anything
      flip(Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0);
    },
    /** True right after a swipe, so the tap-to-close behind it can ignore the touch. */
    swiped: () => { const s = g.current.swiped; g.current.swiped = false; return s; },
  };
}

/** A dimmed page with one element cut out, and a card that explains it. */
function Spotlight({ spot, step, steps, onBack, onNext, onJump, onClose }: { spot: Spot; step?: number; steps?: string[]; onBack?: () => void; onNext?: () => void; onJump?: (i: number) => void; onClose: () => void }) {
  const total = steps?.length, flip = useFlip(total ? onNext : undefined, onBack);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLElement>(null), [cardH, setCardH] = useState(200);
  useLayoutEffect(() => { const h = card.current?.offsetHeight; if (h && h !== cardH) setCardH(h); });
  useLayoutEffect(() => {
    // Follows the target while open: smooth scrolling, layout shifts and resizes all move it.
    let last = "";
    const el = () => {
      for (const sel of spot.target.split(",")) { const n = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((x) => x.offsetParent !== null); if (n) return n; }
      return null;
    };
    el()?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const measure = () => {
      const r = el()?.getBoundingClientRect() ?? null, key = r ? [r.top, r.left, r.width, r.height].map(Math.round).join() : "";
      if (key !== last) { last = key; setRect(r); }
    };
    measure();
    const timer = setInterval(measure, 50);
    return () => clearInterval(timer);
  }, [spot.target, spot.tab, spot.dayView]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onNext?.(); if (e.key === "ArrowLeft") onBack?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onBack]);

  const pad = 8, w = Math.min(340, window.innerWidth - 32);
  const box = rect && { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: Math.min(rect.height + pad * 2, window.innerHeight * 0.7) };
  const below = !box || box.top + box.height + cardH + 24 < window.innerHeight;
  const tall = !!box && box.height > window.innerHeight * 0.45; // no room beside it: sit at the bottom, over the target
  const cardTop = !box ? window.innerHeight / 2 - 90 : tall ? window.innerHeight - cardH - 16 : below ? Math.min(box.top + box.height + 12, window.innerHeight - cardH - 12) : Math.max(12, box.top - 12 - cardH);
  const cardLeft = !box || tall ? (window.innerWidth - w) / 2 : Math.max(16, Math.min(box.left, window.innerWidth - w - 16));
  return <div className={"spotlight" + (total ? " touring" : "")} role="dialog" aria-modal="true" aria-label={spot.title} {...(total ? { onWheel: flip.onWheel, onTouchStart: flip.onTouchStart, onTouchEnd: flip.onTouchEnd } : {})}>
    <div className="spotlight-catch" onClick={() => { if (!flip.swiped()) onClose(); }} />
    {box ? <div className="spotlight-hole" style={box} /> : <div className="spotlight-dim" />}
    <section ref={card} className="spotlight-card" style={{ top: cardTop, left: cardLeft, width: w }}>
      {total ? <span className="eyebrow">Tour · {step! + 1} of {total}</span> : <span className="eyebrow">Show me</span>}
      <h3>{spot.title}</h3><p>{spot.body}</p>
      {total && <nav className="tour-dots" aria-label="Tour steps">{steps!.map((t, i) => <button key={t} aria-label={`Step ${i + 1}: ${t}`} title={t} aria-current={i === step ? "step" : undefined} className={i === step ? "on" : ""} onClick={() => onJump?.(i)} />)}</nav>}
      {total && step === 0 && <small className="tour-hint">Swipe, scroll or use the arrow keys to move between steps.</small>}
      <div className="spotlight-actions">
        {total || !onNext ? <button className="text-button" onClick={onClose}>{total ? "End tour" : "Close"}</button> : <span />}
        <span>{total ? <button className="secondary" aria-label="Previous step" disabled={!onBack} onClick={onBack}><ArrowLeft size={15} />Back</button> : onBack && <button className="secondary" aria-label="Previous step" onClick={onBack}><ArrowLeft size={15} /></button>}
          {onNext && <button className="primary" autoFocus onClick={onNext}>{!total ? "Got it" : step! + 1 === total ? "Done" : "Next"}<ArrowRight size={15} /></button>}</span>
      </div>
    </section>
  </div>;
}

/** First-visit welcome card (board 62), the optional tour and the ? help panel. `show` moves the app to a step's place. */
export type HelpTab = "what" | "do" | "data";

export function Onboarding({ hold, show, inNight, helpOpen, setHelpOpen, helpTab }: { hold?: boolean; show: (p: Place) => void; inNight: boolean; helpOpen: boolean; setHelpOpen: (v: boolean) => void; helpTab?: HelpTab }) {
  const [welcome, setWelcome] = useState(!introSeen());
  const [hint, setHint] = useState(false), [tour, setTour] = useState<number | null>(null), [single, setSingle] = useState<Spot | null>(null);
  const [tab, setTab] = useState<HelpTab>("what");
  useEffect(() => { if (helpOpen && helpTab) setTab(helpTab); }, [helpOpen, helpTab]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]");
      if (e.key === "?" && !typing) { e.preventDefault(); setHelpOpen(true); }
      if (e.key === "Escape" && helpOpen) setHelpOpen(false);
      if (e.key === "Escape" && welcome) closeWelcome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function closeWelcome(thenTour = false) { track("intro-close", { then: thenTour ? "tour" : "explore" }); markSeen(); setWelcome(false); if (thenTour) startTour(); else setHint(true); }
  function go(i: number) { show(TOUR[i]); setTour(i); }
  function startTour() { track("tour-start"); setHelpOpen(false); setHint(false); markSeen(); go(0); }
  function showMe(f: Spot) { track("show-me", { feature: f.title }); setHelpOpen(false); show(f); setSingle(f); }

  return <>
    {welcome && !hold && <div className="modal-backdrop welcome-backdrop"><section className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to ArtHop">
      <h1>Welcome to <span>ArtHop</span></h1>
      <p className="welcome-lead"><b>Coming from MuseumHop?</b> Everything works the same: the map, your route, planning with friends and your private link. No account needed.</p>
      <h2 className="eyebrow">New for Art Week</h2>
      <ul className="welcome-new">{NEW.map((n) => <li key={n.title}><i style={{ background: n.color }} /><div><b>{n.title}</b><span>{n.body}</span></div></li>)}</ul>
      <div className="two">
        <button className="btn big" autoFocus onClick={() => closeWelcome()}>Start exploring</button>
        <button className="btn alt big" onClick={() => closeWelcome(true)}>Show me around · 4 steps</button>
      </div>
      <p className="welcome-foot">Open this again any time with the <b>?</b> button at the top. Unofficial fan planner, not affiliated with Amsterdam Art Week.</p>
    </section></div>}

    {hint && <Spotlight spot={{ target: ".help-button", title: "Help lives here", body: "The ? button lists everything ArtHop can do, with a “Show me” for each, and replays the tour." }} onNext={() => setHint(false)} onClose={() => setHint(false)} />}
    {tour !== null && <Spotlight spot={TOUR[tour]} step={tour} steps={TOUR.map((t) => t.title)} onJump={go} onClose={() => { track("tour-end", { step: tour + 1, finished: false }); setTour(null); }}
      onBack={tour > 0 ? () => go(tour - 1) : undefined} onNext={() => (tour + 1 < TOUR.length ? go(tour + 1) : (track("tour-end", { step: tour + 1, finished: true }), setTour(null)))} />}
    {single && <Spotlight spot={single} onClose={() => setSingle(null)} />}

    {helpOpen && <div className="modal-backdrop help-backdrop" onClick={() => setHelpOpen(false)}>
      <aside className="help-drawer" role="dialog" aria-modal="true" aria-label="How ArtHop works" onClick={(e) => e.stopPropagation()}>
        <button className="sc-close" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={20} /></button>
        <div className="help-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "what"} className={tab === "what" ? "on" : ""} onClick={() => setTab("what")}>How it works</button>
          <button role="tab" aria-selected={tab === "do"} className={tab === "do" ? "on" : ""} onClick={() => setTab("do")}>Everything it does</button>
          <button role="tab" aria-selected={tab === "data"} className={tab === "data" ? "on" : ""} onClick={() => setTab("data")}>Your data</button>
        </div>
        {tab === "data" ? <YourData /> : tab === "what" ? <div role="tabpanel" className="help-panel">
          <h2>How ArtHop works</h2>
          <p>ArtHop puts the whole Amsterdam Art Week programme (Wednesday 18 to Sunday 22 November 2026) on one map, day by day. Pick a day, add what you like, and your walk draws itself. Plan alone or with friends; no account needed.</p>
          <h3 className="eyebrow">Everything from MuseumHop is here, plus</h3>
          <ul className="welcome-new">{NEW.map((n) => <li key={n.title}><i style={{ background: n.color }} /><div><b>{n.title}</b><span>{n.body}</span></div></li>)}
            <li><i style={{ background: "#00b67a" }} /><div><b>Print my day</b><span>Your day as a drawing, to print or save as a PDF.</span></div></li></ul>
          <div className="help-legend">
            <h3>Reading the map</h3>
            <p><i className="lg-dot" style={{ background: "#2b3bff" }} />A colour for what’s on: painting, photography, sculpture, video, mixed.</p>
            <p><i className="lg-dot" style={{ background: "#c2c1ba" }} />Grey: closed at the time on the slider.</p>
            <p><i className="lg-dot big" style={{ background: "#00b67a" }} />A stop on your day. Bigger means a longer stay; the black line is your walk.</p>
          </div>
          <p className="help-note">ArtHop is an unofficial fan planner, not affiliated with Amsterdam Art Week. Titles, times and places come from amsterdamart.com; always check there for changes and tickets.</p>
          <p className="help-contact"><Mail size={15} /><span>Found a bug, or missing something? <a href={CONTACT}>Email the developer</a>.<br /><a href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></span></p>
          <div className="two"><button className="btn alt" onClick={() => { setHelpOpen(false); setWelcome(true); }}>Show the welcome again</button><button className="btn" onClick={startTour}>Take the 4-step tour<ArrowRight size={16} /></button></div>
        </div> : <div role="tabpanel" className="help-panel">
          <h2>Everything ArtHop does</h2>
          <p>Every MuseumHop function, plus Art Week’s own. Tap Show me to see where it is.</p>
          {GROUPS.map((g) => <section key={g} className="help-group"><h3>{g}</h3><ul className="help-features">{FEATURES.filter((f) => f.group === g).map((f) => <li key={f.title}>
            <div><b>{f.title}</b><span>{f.body}</span>{f.needsNight && !inNight && <small>Available once you’ve saved a plan.</small>}</div>
            <button className="link show-me" disabled={f.needsNight && !inNight} onClick={() => showMe(f)}>Show me</button>
          </li>)}
            {g === "With your group" && <li><div><b>Works without signal</b><span>Changes made offline wait on your phone and sync when you’re back online.</span></div></li>}
          </ul></section>)}
          <button className="btn big" onClick={startTour}>Take the 4-step tour</button>
          <div className="help-keys"><span className="eyebrow">Keyboard</span><p><kbd>?</kbd>This help</p><p><kbd>Esc</kbd>Close any panel</p><p><kbd>←</kbd><kbd>→</kbd>Tour steps</p></div>
        </div>}
      </aside>
    </div>}
  </>;
}

/** Plain-language privacy page. Every line here must stay true: change it when the app's data handling changes. */
function YourData() {
  return <div role="tabpanel" className="help-panel your-data">
    <h2>Your plan is only visible to the people in your group.</h2>
    <section>
      <h3>What ArtHop keeps</h3>
      <ul>
        <li>The name and colour you pick</li>
        <li>Your reactions, notes, plans for each day, votes, crews and meet-up points</li>
        <li>A list of changes in your group, so everyone sees who changed what</li>
      </ul>
      <p><b>Just looking around?</b> Then ArtHop keeps nothing about you. An anonymous sign-in (no name, email or password) is made only when you save a plan, start a group or join one.</p>
      <p><b>Not kept:</b> your phone number, contacts or location. No ads, no tracking cookies and no usage statistics.</p>
      <p><b>Your location</b>, only if you tap the arrow on the map: your phone works out the blue dot and the walking times, and the location never leaves it. It isn’t sent to your group, to ArtHop or anyone else, and it’s forgotten when you close the page. “Google Maps” and “Go” hand the addresses of your stops to Google Maps; Google then sees what you do there.</p>
      <p><b>Your email</b>, only if you ask us to email your personal link: ArtHop keeps a fingerprint of the address (to recognise it when you ask for a new link), never the address itself. Your group never sees it.</p>
      <p><b>In this browser:</b> who you are, your groups, changes waiting to sync, which stops you’ve reached on a walk, and whether you’ve seen the welcome. Clearing your browser removes them, which is why a personal link helps.</p>
    </section>
    <section>
      <h3>How long</h3>
      <p>Every group, with everything in it, is deleted automatically 30 days after Art Week: on 23 December 2026. A sign-in that never ended up in a group is removed after a day.</p>
    </section>
    <section>
      <h3>Who sees what</h3>
      <p><b className="ok">Your group</b>, everyone who joined with your invite link, sees names, reactions, notes, plans and the list of changes.</p>
      <p><b className="ok">People with your view-only link</b>, if your group makes one, see the plans with times and places. No names, reactions or notes. They don’t join, and a new link or “turn off” stops the old one.</p>
      <p><b className="ok">Only you</b> have your personal link and know which email it goes to.</p>
      <p><b className="no">Other groups</b> can’t list, search or open yours. There’s no public list; the only way in is the invite link. Anyone you forward it to can join and plan, so share it with your group only.</p>
    </section>
    <section>
      <h3>How it’s enforced</h3>
      <ul>
        <li>Database rules check that you’re in a group on every read and every change.</li>
        <li>Invite links are stored only as a fingerprint (hash), and personal links only as a one-way password hash, so a copy of the database doesn’t reveal working links.</li>
        <li>A new personal link turns your old one off.</li>
        <li>Link emails are rate-limited, and asking for a new link by email always gives the same answer, so nobody can use it to find out whether an address is registered.</li>
        <li>Automated checks try to break these rules (for example “someone outside the group sees nothing”) whenever they change.</li>
      </ul>
    </section>
    <section>
      <h3>Services involved</h3>
      <p>GitHub Pages hosts the site, Supabase stores the plans (in the EU, Frankfurt), Google Fonts serves the fonts, unpkg serves the map code and PDOK (the Dutch government’s map service) serves the map. Like any website, they see your IP address when your browser loads from them. If you ask for your link by email, Resend sends it and keeps a delivery log with your address.</p>
    </section>
    <p className="help-note">ArtHop is an unofficial fan planner, not affiliated with Amsterdam Art Week. It uses the programme’s facts (titles, times, places), not its descriptions or images. Questions or a request to delete your data sooner: <a href={CONTACT}>email the developer</a>.</p>
  </div>;
}
