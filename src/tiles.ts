/** Carto Positron — fond clair libre. Pas Mapbox, pas satellite, pas dark. */
export const MAP_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const MAP_TILE_OPTIONS = {
  attribution: MAP_TILE_ATTRIBUTION,
  subdomains: "abcd",
  maxZoom: 20,
} as const;

export const USER_DOT = {
  radius: 7,
  color: "#1d4ed8",
  fillColor: "#2563eb",
  fillOpacity: 0.92,
  weight: 2,
} as const;

export function isForbiddenTileUrl(url: string): boolean {
  return /mapbox|satellite|dark_all|dark_matter/i.test(url);
}
