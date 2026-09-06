/** OSM France — fond clair libre, sans clé API. Pas Carto, pas Mapbox, pas satellite, pas dark. */
export const MAP_TILE_URL =
  "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.fr/">OSM France</a>';

export const MAP_TILE_OPTIONS = {
  attribution: MAP_TILE_ATTRIBUTION,
  subdomains: "abc",
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
  return /mapbox|satellite|dark_all|dark_matter|basemaps\.cartocdn|carto\.com\/basemaps/i.test(url);
}
