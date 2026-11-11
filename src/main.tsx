import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ViewNight } from "./components/view-night";
// Fonts are served from this site (not Google Fonts), so visitors' IP addresses stay here.
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/syne/700.css";
import "@fontsource/syne/800.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";
import "./styles.css";
import "./arthop.css";

// A view-only link (#view=<token>) gets its own small read-only page instead of the planner.
const view = new URLSearchParams(location.hash.slice(1)).get("view");
createRoot(document.getElementById("root")!).render(<StrictMode>{view && /^[0-9a-f]{48}$/.test(view) ? <ViewNight token={view} /> : <App />}</StrictMode>);
