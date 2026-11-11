import { useEffect, useRef, useState } from "react";
import { byId, byMuseum, CLOSED, disciplineOf, groupOf, museumItem, venueGroup, type Item, type Museum, type UiStop } from "../lib/catalogue";
import type { TransportMode } from "../data/transport";
import type { Spot } from "../lib/location";

/** Transport drawn over the map: the modes switched on, and which stop is selected. */
export type TransportLayer = { modes: TransportMode[]; selected: { mode: string; stop: number } | null; onSelect: (mode: string, stop: number) => void };
export const stopPoint = (s: TransportMode["stops"][number]): [number, number] | null => {
  const m = s.museumId ? byMuseum.get(s.museumId) : undefined;
  return m?.lat != null ? [m.lat, m.lng!] : s.at ?? null;
};

/** A route drawn on the map. The `numbered` route is "the drawing": a colour dot per stop, sized by how long you stay,
 *  joined by a bold black walk line, with hand-written labels. Other routes (crews) are thinner lines in their colour. */
export type MapLine = { stops: UiStop[]; color: string; numbered?: boolean; dashed?: boolean; labels?: string[] };

/** A smooth line through points (Catmull-Rom, a few steps per leg), so the walk reads as a drawn stroke. */
export function smooth(points: [number, number][], steps = 10): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    for (let t = 0; t < steps; t++) {
      const u = t / steps, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3)) as [number, number]);
    }
  }
  out.push(points.at(-1)!);
  return out;
}
/** A stop's dot size in pixels: bigger for a longer stay. */
export const stopRadius = (minutes: number) => Math.round(Math.min(38, 12 + minutes / 3));

type Leaflet = any; // loaded from the CDN at runtime, as before

/** Loads Leaflet once: a second copy (e.g. from a double mount) breaks lines drawn on a map made by the first. */
let leafletLoading: Promise<void> | null = null;
function loadLeaflet() {
  if ((window as any).L) return Promise.resolve();
  // Bundled with the site rather than loaded from a CDN, so no visitor's IP address goes to a third party for it.
  leafletLoading ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
    .then(([mod]) => { (window as any).L = (mod as any).default ?? mod; })
    .catch(() => { leafletLoading = null; throw new Error("Map library could not load."); });
  return leafletLoading;
}

export function MapView({ visible, lines, onSelect, focus, fit, transport, me, locate = 0, isOpen, zoomBy = 0, zoomTick = 0 }: {
  visible: Item[]; lines: MapLine[]; onSelect: (e: Item) => void; focus: string | null; fit: number; transport?: TransportLayer; me?: Spot | null; locate?: number;
  /** Whether a venue counts as open at the time shown: closed ones are grey. */
  isOpen: (museumId: string) => boolean;
  /** Zoom buttons outside the map: +1 or -1, applied each time zoomTick changes. */
  zoomBy?: number; zoomTick?: number;
}) {
  /** Runs a camera move now, or, while the map is hidden (another view on a phone), once it is shown: Leaflet can't move a 0×0 map. */
  const pendingMove = useRef<(() => void) | null>(null);
  const move = (fn: () => void) => {
    if (!element.current?.offsetWidth) { pendingMove.current = fn; return; }
    map.current?.invalidateSize({ pan: false }); // its cached size can lag a view switch
    fn();
  };
  const element = useRef<HTMLDivElement>(null), map = useRef<Leaflet>(null), layer = useRef<Leaflet>(null), line = useRef<Leaflet>(null), rides = useRef<Leaflet>(null), select = useRef(onSelect), pickRide = useRef(transport?.onSelect);
  pickRide.current = transport?.onSelect;
  select.current = onSelect;
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [zoom, setZoom] = useState(13);
  const dot = useRef<{ marker: Leaflet; circle: Leaflet } | null>(null);

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    async function init() {
      try {
        await loadLeaflet();
        if (disposed || !element.current) return;
        const L = (window as any).L;
        map.current = L.map(element.current, { zoomControl: false, zoomSnap: 0.25, minZoom: 10, maxZoom: 19, maxBounds: [[52.23, 4.68], [52.48, 5.1]] }).setView([52.37, 4.89], 14);
        let tileFailures = 0;
        const tiles = L.tileLayer("https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/{z}/{x}/{y}.png", { attribution: '<a href="https://www.pdok.nl/">Kadaster / PDOK</a> · BRT Achtergrondkaart', maxZoom: 19 });
        tiles.on("tileerror", () => { if (++tileFailures > 6) setError("Map tiles could not load. You can still browse places and open directions."); });
        tiles.on("load", () => { if (tileFailures === 0) setError(""); });
        tiles.addTo(map.current);
        line.current = L.layerGroup().addTo(map.current); // under the dots: the walk line is drawn first
        layer.current = L.layerGroup().addTo(map.current);
        rides.current = L.layerGroup().addTo(map.current);
        map.current.on("zoomend", () => setZoom(map.current.getZoom()));
        if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map.current;
        resize = new ResizeObserver(() => {
          map.current?.invalidateSize();
          if (pendingMove.current && element.current?.offsetWidth) { const fn = pendingMove.current; pendingMove.current = null; fn(); }
        });
        resize.observe(element.current);
        setReady(true);
      } catch {
        setError("The map could not load. Event lists and directions are still available.");
      }
    }
    init();
    return () => { disposed = true; resize?.disconnect(); map.current?.remove(); map.current = null; setReady(false); };
  }, []);

  /* Venue dots, coloured by what they show (grey while closed at the time shown); dots that would overlap at this
     zoom merge into a ring that zooms in when tapped. Then the drawing: one dot per stop, sized by the stay, and a bold
     black walk line through them, with hand-written labels. Crew routes are thinner coloured lines. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    layer.current.clearLayers();
    line.current.clearLayers();
    const groups = new Map<string, Item[]>();
    visible.forEach((e) => { if (e.museumId) groups.set(e.museumId, [...(groups.get(e.museumId) || []), e]); });
    const drawing = lines.find((l) => l.numbered);
    const onRoute = new Set(lines.flatMap((l) => l.stops.map((s) => byId.get(s.id)?.museumId)).filter(Boolean) as string[]);
    const optionsLabel = (list: Item[]) => list.length === 1 && list[0].kind === "venue" ? "venue" : list.length + (list.length === 1 ? " thing on" : " things on");
    const venueClick = (m: Museum) => select.current(museumItem(m));

    const plain: { m: Museum; list: Item[]; at: { x: number; y: number } }[] = [];
    for (const [id, list] of groups) {
      const m = byMuseum.get(id);
      if (!m || m.lat == null || (drawing && onRoute.has(id))) continue;
      plain.push({ m, list, at: map.current.project([m.lat, m.lng], zoom) });
    }
    const RADIUS = 22;
    const clusters: (typeof plain)[] = [];
    for (const v of [...plain].sort((a, b) => b.list.length - a.list.length)) {
      const home = clusters.find((c) => Math.hypot(c[0].at.x - v.at.x, c[0].at.y - v.at.y) < RADIUS);
      if (home) home.push(v); else clusters.push([v]);
    }
    for (const c of clusters) {
      if (c.length === 1) {
        const { m, list } = c[0], open = isOpen(m.id), size = 16;
        const color = open ? venueGroup(m.id).color : CLOSED;
        const icon = L.divIcon({ className: "venue-dot" + (open ? "" : " closed"), html: `<span style="background:${color}"></span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const label = `${m.name} · ${optionsLabel(list)}${open ? "" : " · closed now"}`;
        const marker = L.marker([m.lat, m.lng], { icon, keyboard: true, title: label }).addTo(layer.current);
        marker.bindTooltip(label, { direction: "top", offset: [0, -size / 2] });
        marker.on("click", () => venueClick(m));
        continue;
      }
      const lat = c.reduce((t, v) => t + v.m.lat!, 0) / c.length, lng = c.reduce((t, v) => t + v.m.lng!, 0) / c.length;
      const names = c.map((v) => v.m.name), anyOpen = c.some((v) => isOpen(v.m.id));
      const icon = L.divIcon({ className: "venue-cluster" + (anyOpen ? "" : " closed"), html: `<span>${c.length}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = L.marker([lat, lng], { icon, keyboard: true, title: c.length + " venues close together: " + names.join(", ") }).addTo(layer.current);
      marker.bindTooltip(c.length + " venues · " + (names.length > 3 ? names.slice(0, 3).join(", ") + "…" : names.join(", ")), { direction: "top", offset: [0, -15] });
      const samePlace = c.every((v) => v.m.lat === c[0].m.lat && v.m.lng === c[0].m.lng);
      if (samePlace || zoom >= 17) {
        const container = document.createElement("div");
        for (const v of c) {
          const button = document.createElement("button");
          button.textContent = v.m.name + " · " + optionsLabel(v.list) + (isOpen(v.m.id) ? "" : " · closed");
          button.className = "shared-location-button";
          button.onclick = () => venueClick(v.m);
          container.appendChild(button);
        }
        marker.bindPopup(container);
      } else marker.on("click", () => map.current.fitBounds(c.map((v) => [v.m.lat, v.m.lng]), { padding: [80, 80], maxZoom: Math.min(zoom + 3, 18) }));
    }

    const at = (stops: UiStop[]) => stops.map((s) => byMuseum.get(byId.get(s.id)?.museumId || "")).filter((m) => m?.lat != null).map((m) => [m!.lat!, m!.lng!] as [number, number]);
    for (const l of lines) {
      if (l.numbered) continue;
      const coords = at(l.stops.filter((s) => !s.maybe));
      if (coords.length > 1) L.polyline(smooth(coords), { color: l.color, weight: 5, opacity: 0.9, lineCap: "round", interactive: false }).addTo(line.current);
      for (const s of l.stops) {
        const m = byMuseum.get(byId.get(s.id)?.museumId || "");
        if (m?.lat == null) continue;
        const icon = L.divIcon({ className: "crew-pin", html: `<span style="background:${l.color}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] });
        L.marker([m.lat, m.lng], { icon, title: m.name }).addTo(layer.current).on("click", () => venueClick(m));
      }
    }
    if (drawing) {
      // The walk line: bold, plus a thin second stroke a few pixels off, like a brush that split. Maybes are dotted detours.
      const all = at(drawing.stops), sure = at(drawing.stops.filter((s) => !s.maybe));
      if (all.length > sure.length && all.length > 1) L.polyline(smooth(all), { color: "#111", weight: 2.5, opacity: 0.8, dashArray: "1 9", lineCap: "round", interactive: false }).addTo(line.current);
      if (sure.length > 1) {
        const path = smooth(sure);
        L.polyline(path, { color: "#111", weight: 7, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false, className: "walk-line" }).addTo(line.current);
        const shifted = path.map(([lat, lng]) => { const p = map.current.project([lat, lng], zoom); return map.current.unproject([p.x + 5, p.y + 4], zoom); });
        L.polyline(shifted, { color: "#111", weight: 1.6, opacity: 0.9, lineCap: "round", interactive: false }).addTo(line.current);
      }
      // One dot per stop; a second visit to the same venue the same day shares it. Labels go right or left of their dot,
      // or a little above or below, wherever they don't cover another label or dot.
      const seen = new Map<string, number>();
      const taken: { x: number; y: number; w: number; h: number }[] = [];
      const hit = (b: { x: number; y: number; w: number; h: number }) => taken.some((t) => b.x < t.x + t.w && b.x + b.w > t.x && b.y < t.y + t.h && b.y + b.h > t.y);
      const dotScale = zoom >= 16 ? 1 : zoom >= 15 ? 0.8 : 0.55; // zoomed out, big dots would hide the walk between them
      drawing.stops.forEach((s) => { const m = byMuseum.get(byId.get(s.id)?.museumId || ""); if (m?.lat == null) return; const p = map.current.project([m.lat, m.lng], zoom), r = Math.round(stopRadius(s.duration) * dotScale); taken.push({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }); });
      drawing.stops.forEach((s, i) => {
        const e = byId.get(s.id), m = byMuseum.get(e?.museumId || "");
        if (!e || m?.lat == null) return;
        const prior = seen.get(m.id);
        seen.set(m.id, i);
        const r = Math.round(stopRadius(s.duration) * dotScale), color = isOpen(m.id) || !e ? groupOf(e).color : CLOSED;
        const html = `<span class="stop-dot${s.maybe ? " maybe" : ""}" style="width:${r * 2}px;height:${r * 2}px;background:${color}"></span>`;
        const marker = L.marker([m.lat, m.lng], { icon: L.divIcon({ className: "stop-pin", html, iconSize: [r * 2, r * 2], iconAnchor: [r, r] }), keyboard: true, title: `${i + 1} · ${e.title}`, zIndexOffset: 1000 + (prior != null ? 1 : 0) }).addTo(layer.current);
        marker.on("click", () => select.current(e));
        const label = drawing.labels?.[i] ?? `${disciplineOf(e)} · ${s.duration} min`;
        const name = (e.kind === "venue" ? e.title : m.name).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const p = map.current.project([m.lat, m.lng], zoom), w = Math.max(name.length * 10 + 30, label.length * 7.4), h = 46;
        const spots = [[r + 6, -16], [-r - 6 - w, -16], [r + 2, r - 4], [-r - 2 - w, r - 4], [r + 2, -r - h + 4], [-r - 2 - w, -r - h + 4], [-w / 2, r + 4], [-w / 2, -r - h - 2]];
        const overlap = (b: { x: number; y: number; w: number; h: number }) => taken.reduce((n, t) => n + Math.max(0, Math.min(b.x + b.w, t.x + t.w) - Math.max(b.x, t.x)) * Math.max(0, Math.min(b.y + b.h, t.y + t.h) - Math.max(b.y, t.y)), 0);
        const [dx, dy] = spots.find(([x, y]) => !hit({ x: p.x + x, y: p.y + y, w, h }))
          ?? [...spots].sort((a, b) => overlap({ x: p.x + a[0], y: p.y + a[1], w, h }) - overlap({ x: p.x + b[0], y: p.y + b[1], w, h }))[0];
        taken.push({ x: p.x + dx, y: p.y + dy, w, h });
        const hand = L.divIcon({ className: "hand-label" + (dx < 0 ? " left" : "") + (zoom < 15 ? " small" : ""), html: `<b>${i + 1} · ${name}</b><small>${label.replace(/</g, "&lt;")}</small>`, iconSize: [w, h], iconAnchor: [-dx, -dy] });
        L.marker([m.lat, m.lng], { icon: hand, interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(layer.current);
      });
    }
  }, [ready, visible, lines, zoom, isOpen]);

  useEffect(() => { if (ready && zoomTick) map.current?.setZoom(map.current.getZoom() + zoomBy); }, [zoomTick]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Transport: lines between known ends, and square pins for boarding points, above the venue dots. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    rides.current.clearLayers();
    for (const mode of transport?.modes ?? []) {
      for (const [a, b] of mode.lines ?? []) {
        const p = stopPoint(mode.stops[a]), q = stopPoint(mode.stops[b]);
        if (p && q) L.polyline([p, q], { color: mode.color, weight: 5, opacity: 0.9, dashArray: mode.dashed ? "10 7" : undefined, interactive: false }).addTo(rides.current);
      }
      mode.stops.forEach((stop, i) => {
        const at = stopPoint(stop);
        if (!at) return;
        const on = transport!.selected?.mode === mode.id && transport!.selected.stop === i;
        const icon = L.divIcon({ className: "ride-pin" + (on ? " on" : ""), html: `<span style="background:${mode.color}">${mode.short}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        const marker = L.marker(at, { icon, keyboard: true, title: stop.name + " · " + mode.name, zIndexOffset: on ? 3000 : 2000 }).addTo(rides.current);
        marker.bindTooltip(stop.name, { direction: "top", offset: [0, -14] });
        marker.on("click", () => pickRide.current?.(mode.id, i));
      });
    }
  }, [ready, transport?.modes, transport?.selected]);

  // Selecting a ride brings it, and the other end of its line, into view.
  const selectedKey = transport?.selected ? transport.selected.mode + ":" + transport.selected.stop : "";
  useEffect(() => {
    if (!ready || !transport?.selected) return;
    const mode = transport.modes.find((m) => m.id === transport.selected!.mode), i = transport.selected.stop;
    if (!mode) return;
    const ends = [i, ...(mode.lines ?? []).filter((l) => l.includes(i)).flat()].map((n) => stopPoint(mode.stops[n])).filter(Boolean);
    if (ends.length) move(() => map.current?.fitBounds(ends, { padding: [90, 90], maxZoom: 15 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedKey]);

  // Opening the transport layer frames every ride once; toggling single modes afterwards leaves the view alone.
  const ridesShown = !!transport?.modes.length;
  useEffect(() => {
    if (!ready || !ridesShown) return;
    const points = (transport?.modes ?? []).flatMap((m) => m.stops.map(stopPoint)).filter(Boolean);
    if (points.length) move(() => map.current?.fitBounds(points, { padding: [40, 40], maxZoom: 15 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ridesShown]);

  /* The blue dot: where this phone is, a pale circle for how sure the GPS is, and a cone when you're walking. */
  useEffect(() => {
    if (!ready || !map.current) return;
    const L = (window as any).L;
    if (!me) { dot.current?.marker.remove(); dot.current?.circle.remove(); dot.current = null; return; }
    const html = `<span class="me-cone"${me.heading == null ? ' hidden' : ` style="transform:rotate(${me.heading}deg)"`}></span><span class="me-dot"></span>`;
    const weak = me.accuracy > 60;
    if (!dot.current) {
      const circle = L.circle([me.lat, me.lng], { radius: me.accuracy, color: "#2f6fdf", weight: 1, opacity: 0.4, fillColor: "#2f6fdf", fillOpacity: 0.12, interactive: false }).addTo(map.current);
      const marker = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "me-pin" + (weak ? " weak" : ""), html, iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false, interactive: false, zIndexOffset: 4000 }).addTo(map.current);
      dot.current = { marker, circle };
    } else {
      dot.current.marker.setLatLng([me.lat, me.lng]);
      dot.current.marker.setIcon(L.divIcon({ className: "me-pin" + (weak ? " weak" : ""), html, iconSize: [44, 44], iconAnchor: [22, 22] }));
      dot.current.circle.setLatLng([me.lat, me.lng]).setRadius(me.accuracy);
    }
  }, [ready, me]);
  useEffect(() => () => { dot.current?.marker.remove(); dot.current?.circle.remove(); dot.current = null; }, []);

  // The locate button (and the first fix after turning it on) centres the map on you, if you're in the city.
  const hasFix = !!me;
  useEffect(() => {
    if (!ready || !me || !locate) return;
    if (map.current?.options.maxBounds?.contains?.([me.lat, me.lng]) ?? true) move(() => map.current?.flyTo([me.lat, me.lng], Math.max(map.current.getZoom(), 15), { duration: 0.6 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locate, hasFix]);

  useEffect(() => {
    if (!ready || !focus) return;
    const m = byMuseum.get(focus);
    if (m?.lat != null) move(() => map.current?.flyTo([m.lat, m.lng], 15, { duration: 0.6 }));
  }, [focus, ready]);

  useEffect(() => {
    if (!ready || !fit) return;
    // Frame the sure stops: a far-off maybe (an after party) shouldn't zoom the whole drawing out.
    const all = lines.flatMap((l) => l.stops), sure = all.filter((s) => !s.maybe);
    const ms = (sure.length ? sure : all).map((s) => byMuseum.get(byId.get(s.id)?.museumId || "")).filter((m) => m?.lat != null);
    move(() => {
      if (ms.length) map.current?.fitBounds(ms.map((m) => [m!.lat, m!.lng]), { ...(element.current!.offsetWidth > 700 ? { paddingTopLeft: [150, 70], paddingBottomRight: [190, 90] } : { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40] }), maxZoom: 16 });
      else map.current?.setView([52.37, 4.9], 13);
    });
    // Refit only when asked (fit counter), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ready]);

  return <><div ref={element} className="map-canvas" aria-label="Map of Amsterdam with Art Week venues" />{error && <p className="map-error" role="alert">{error}</p>}</>;
}
