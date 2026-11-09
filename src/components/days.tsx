import { clock, DAYS, dayOf, dayRange, minute } from "../lib/catalogue";

/** The five days of Art Week, each with its theme (board 32). Picking one changes the whole site. */
export function DayBar({ day, onDay, counts, compact }: { day: string; onDay: (id: string) => void; counts?: Record<string, number>; compact?: boolean }) {
  return <nav className={"day-bar" + (compact ? " compact" : "")} aria-label="Art Week days" data-tour="days">
    {DAYS.map((d) => <button key={d.id} className={"day" + (d.id === day ? " on" : "")} aria-pressed={d.id === day} onClick={() => onDay(d.id)}>
      <b>{compact ? d.short : d.label}</b>
      {(!compact || (d.id === day && d.night)) && <span>{compact ? "Gallery Night" : d.theme}</span>}
      {counts?.[d.id] ? <i className="day-count" title={`${counts[d.id]} ${counts[d.id] === 1 ? "stop" : "stops"} planned`}>{counts[d.id]}</i> : null}
    </button>)}
  </nav>;
}

/** "Open at": the moment the map greys out what's closed. On the day itself it follows the clock until moved. */
export function TimeBar({ day, at, onAt, live, onLive }: { day: string; at: number; onAt: (n: number) => void; live: boolean; onLive?: () => void }) {
  const [lo, hi] = dayRange(day), d = dayOf(day);
  const pct = (n: number) => ((Math.min(Math.max(n, lo), hi) - lo) / (hi - lo)) * 100;
  const night = d.night ? [minute(d.night[0]), minute(d.night[1])] : null;
  return <div className="time-bar">
    <b className="tb-day">{d.label}</b>
    <span className="tb-label">{live ? "Open now" : "Open at"}</span>
    <span className="tb-edge">{clock(lo)}</span>
    <div className="tb-track">
      <div className="tb-rail" />
      {night && <div className="tb-night" style={{ left: pct(night[0]) + "%", width: pct(night[1]) - pct(night[0]) + "%" }}><span>Gallery Night</span></div>}
      <input type="range" min={lo} max={hi} step={10} value={Math.min(Math.max(at, lo), hi)} onChange={(e) => onAt(Number(e.target.value))}
        aria-label={`Show what's open on ${d.name} at`} aria-valuetext={clock(at)} />
    </div>
    <span className="tb-edge">{clock(hi)}</span>
    {onLive && !live ? <button className="tb-now" onClick={onLive} title="Back to now">{clock(at)}</button> : <b className="tb-now">{clock(at)}</b>}
  </div>;
}
