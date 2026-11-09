/**
 * Getting around during Art Week: the free GVB ferries across the IJ (drawn on the map), plus trams and bikes as
 * plain advice. Art Week runs no special transport of its own. Ferry piers are approximate.
 * Stops can also sit at a programme venue (`museumId`).
 */
export type TransportStop = { name: string; museumId?: string; at?: [number, number]; events?: string[] };
export type TransportMode = {
  id: string; name: string; short: string; color: string; summary: string; note?: string; url: string;
  stops: TransportStop[]; lines?: [number, number][]; dashed?: boolean; on: boolean;
};

export const SOURCE = "https://www.gvb.nl/en/travel-information/ferry-timetables";

export const MODES: TransportMode[] = [
  {
    id: "ferry", name: "GVB ferries · free", short: "F", color: "#0f6e86", on: true, url: SOURCE, dashed: true,
    summary: "Free ferries from behind Centraal Station to Noord: Buiksloterweg runs day and night; for NDSM-werf, check the GVB times. Bikes go on board.",
    note: "Pier positions are approximate. Check GVB for times.",
    stops: [
      { name: "Centraal Station (IJ side)", at: [52.3809, 4.8996] },
      { name: "Buiksloterweg", at: [52.3838, 4.9013] },
      { name: "NDSM-werf", at: [52.4013, 4.8915] },
    ],
    lines: [[0, 1], [0, 2]],
  },
  {
    id: "tram", name: "Trams and metro", short: "T", color: "#2b3bff", on: false, url: "https://9292.nl/en",
    summary: "Most galleries in the centre are a short walk apart. For Zuid, Oost or Noord, trams and the metro run all day; plan a trip on 9292.nl or with GVB.",
    stops: [],
  },
  {
    id: "bike", name: "By bike", short: "B", color: "#00a36c", on: false, url: "https://www.ns.nl/en/door-to-door/ov-fiets",
    summary: "Switch your plan to Bike in the Timeline to see cycling times. OV-fiets rental bikes wait at Centraal and other stations. Park in the racks.",
    stops: [],
  },
];
