export type LatLon = {
  lat: number;
  lon: number;
};

/** Rayon moyen WGS84, en km. */
export const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance affichée en km, virgule FR. */
export function formatDistanceKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return `${rounded.toFixed(1).replace(".", ",")} km`;
}
