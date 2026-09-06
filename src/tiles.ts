/** OpenFreeMap Bright — fond vectoriel clair, sans clé API. Pas Carto, pas Mapbox, pas satellite, pas dark. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const MAP_TILE_OPTIONS = {
  style: MAP_STYLE_URL,
  attributionControl: {
    customAttribution: MAP_TILE_ATTRIBUTION,
  },
} as const;

export const USER_DOT = {
  radius: 7,
  color: "#1d4ed8",
  fillColor: "#2563eb",
  fillOpacity: 0.92,
  weight: 2,
} as const;

export function isForbiddenTileUrl(url: string): boolean {
  return /mapbox|satellite|dark_all|dark_matter|basemaps\.cartocdn|carto\.com\/basemaps|tile\.openstreetmap\.fr\/osmfr|openfreemap\.org\/styles\/(dark|fiord)/i.test(
    url,
  );
}
