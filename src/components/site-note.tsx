import { IMPORTED, SOURCE } from "../lib/catalogue";
import { CONTACT, CONTACT_ADDRESS, MAKER } from "./onboarding";

/** The words every page carries (legal check, 10 Nov 2026): unofficial, times can change, the source with a link,
 *  and a contact address. Keep the first sentence word for word. */
export const NOTICE = "Unofficial fan planner, not affiliated with Amsterdam Art Week. Times can change: always check the official page.";
const updated = new Date(IMPORTED + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function SiteNote({ onData }: { onData?: () => void }) {
  return <footer className="site-note">
    <p className="sn-notice">{NOTICE}</p>
    <p>Source: <a href={SOURCE} target="_blank" rel="noreferrer">amsterdamart.com</a> (titles, times, places and admission; each item links to its page there). Updated {updated}.</p>
    <p>Contact: <a href={CONTACT}>{CONTACT_ADDRESS}</a>{onData && <> · <button className="link" onClick={onData}>Your data</button></>} · <a href={MAKER} target="_blank" rel="noopener">A project by Arian Shafa ↗</a></p>
  </footer>;
}
