import { brandName, type RawStation, type VisibleStation } from "./domain";
import { EARTH_RADIUS_KM, haversineKm, type LatLon } from "./geo";
import { type BBox } from "./viewport";

/** Rayon de recherche POI `amenity=fuel` autour du geom ODS. 200–300 m ne suffit pas. */
export const SNAP_RADIUS_KM = 2;

/** Écart de score minimum pour départager plusieurs candidats. */
export const SNAP_SCORE_GAP = 0.12;

/** Au moins une preuve texte (adresse / ville / CP / enseigne) pour un match multi-candidats. */
export const SNAP_MIN_IDENTITY = 0.2;

/** Match spatial net : le plus proche est collé au geom, le suivant est nettement plus loin. */
export const SNAP_CLEAR_NEAR_KM = 0.4;
export const SNAP_CLEAR_NEAR_GAP_KM = 0.6;

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OSM_IDENT =
  "stations-prix/1.0 (https://github.com/allardlucas/stations-prix)";

const OVERPASS_CLIENT_MS = 4000;
const KM_PER_DEG_LAT = (EARTH_RADIUS_KM * Math.PI) / 180;

export type OsmFuel = LatLon & {
  name?: string;
  brand?: string;
  address?: string;
  city?: string;
  postcode?: string;
};

export type SnapHint = LatLon & {
  address?: string;
  city?: string;
  postcode?: string;
  brand?: string;
};

export type ScoredFuel = OsmFuel & {
  distKm: number;
  proximity: number;
  addressScore: number;
  cityScore: number;
  postcodeScore: number;
  brandScore: number;
  identity: number;
  score: number;
};

export type SnapDecision =
  | { kind: "snap"; lat: number; lon: number; score: number }
  | { kind: "keep" };

export function stationSnapId(raw: RawStation): string | undefined {
  if (raw.id !== undefined && raw.id !== null && String(raw.id).length > 0) {
    return String(raw.id);
  }
  const lat = raw.geom?.lat;
  const lon = raw.geom?.lon;
  if (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lon === "number" &&
    Number.isFinite(lon)
  ) {
    return `${lat},${lon}`;
  }
  return undefined;
}

export function hintFromRaw(raw: RawStation): SnapHint | null {
  const lat = raw.geom?.lat;
  const lon = raw.geom?.lon;
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }
  return {
    lat,
    lon,
    address: raw.adresse ?? undefined,
    city: raw.ville ?? undefined,
    postcode: raw.cp ?? undefined,
    brand: brandName(raw) || undefined,
  };
}

export function expandBboxKm(bbox: BBox, km = SNAP_RADIUS_KM): BBox {
  const midLat = (bbox.south + bbox.north) / 2;
  const latDelta = km / KM_PER_DEG_LAT;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const lonDelta = lonScale > 0.01 ? km / (KM_PER_DEG_LAT * lonScale) : km / KM_PER_DEG_LAT;
  return {
    west: bbox.west - lonDelta,
    south: bbox.south - latDelta,
    east: bbox.east + lonDelta,
    north: bbox.north + latDelta,
  };
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "l",
  "d",
  "et",
  "rue",
  "avenue",
  "av",
  "chemin",
  "bd",
  "boulevard",
  "route",
  "rte",
  "place",
  "impasse",
  "allee",
  "st",
  "saint",
]);

function tokens(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  return new Set(
    fold(value)
      .split(" ")
      .filter((token) => token.length > 1 && !STOP.has(token)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) {
      inter += 1;
    }
  }
  return inter / (a.size + b.size - inter);
}

function tokenSimilarity(a: string | undefined, b: string | undefined): number {
  return jaccard(tokens(a), tokens(b));
}

function citySimilarity(a: string | undefined, b: string | undefined): number {
  const left = a ? fold(a) : "";
  const right = b ? fold(b) : "";
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  return tokenSimilarity(a, b);
}

function postcodeMatch(a: string | undefined, b: string | undefined): number {
  const left = a?.replace(/\s+/g, "") ?? "";
  const right = b?.replace(/\s+/g, "") ?? "";
  if (!left || !right) {
    return 0;
  }
  return left === right ? 1 : 0;
}

function brandSimilarity(
  hintBrand: string | undefined,
  name: string | undefined,
  brand: string | undefined,
): number {
  const hint = hintBrand ? fold(hintBrand) : "";
  if (!hint) {
    return 0;
  }
  const hay = [name, brand].filter(Boolean).map((value) => fold(value as string));
  for (const item of hay) {
    if (!item) {
      continue;
    }
    if (item === hint || item.includes(hint) || hint.includes(item)) {
      return 1;
    }
  }
  return tokenSimilarity(hintBrand, [name, brand].filter(Boolean).join(" "));
}

export function scoreCandidate(hint: SnapHint, poi: OsmFuel): ScoredFuel {
  const distKm = haversineKm(hint, poi);
  const proximity = Math.max(0, 1 - distKm / SNAP_RADIUS_KM);
  const addressScore = tokenSimilarity(hint.address, poi.address);
  const cityScore = citySimilarity(hint.city, poi.city);
  const postcodeScore = postcodeMatch(hint.postcode, poi.postcode);
  const brandScore = brandSimilarity(hint.brand, poi.name, poi.brand);
  const identity = Math.max(addressScore, cityScore, postcodeScore, brandScore);
  const score =
    0.3 * proximity +
    0.25 * addressScore +
    0.15 * cityScore +
    0.2 * postcodeScore +
    0.1 * brandScore;
  return {
    ...poi,
    distKm,
    proximity,
    addressScore,
    cityScore,
    postcodeScore,
    brandScore,
    identity,
    score,
  };
}

export function pickReliableSnap(
  hint: SnapHint,
  pois: readonly OsmFuel[],
): SnapDecision {
  const scored = pois
    .map((poi) => scoreCandidate(hint, poi))
    .filter((poi) => poi.distKm <= SNAP_RADIUS_KM)
    .sort((a, b) => b.score - a.score || a.distKm - b.distKm);

  if (scored.length === 0) {
    return { kind: "keep" };
  }

  const best = scored[0];
  if (scored.length === 1) {
    return { kind: "snap", lat: best.lat, lon: best.lon, score: best.score };
  }

  const second = scored[1];
  const identityWin =
    best.identity >= SNAP_MIN_IDENTITY &&
    best.score - second.score >= SNAP_SCORE_GAP;
  const nearWin =
    best.distKm <= SNAP_CLEAR_NEAR_KM &&
    second.distKm - best.distKm >= SNAP_CLEAR_NEAR_GAP_KM;

  if (identityWin || nearWin) {
    return { kind: "snap", lat: best.lat, lon: best.lon, score: best.score };
  }
  return { kind: "keep" };
}

export function applySnapToVisible(
  station: VisibleStation,
  decision: SnapDecision | undefined,
): VisibleStation {
  if (!decision || decision.kind !== "snap") {
    return station;
  }
  return {
    ...station,
    lat: decision.lat,
    lon: decision.lon,
    snapped: true,
  };
}

export function decideSnaps(
  stations: readonly RawStation[],
  pois: readonly OsmFuel[],
  cache: Map<string, SnapDecision>,
): void {
  for (const raw of stations) {
    const id = stationSnapId(raw);
    if (!id || cache.has(id)) {
      continue;
    }
    const hint = hintFromRaw(raw);
    const decision: SnapDecision = hint
      ? pickReliableSnap(hint, pois)
      : { kind: "keep" };
    cache.set(id, decision);
    if (decision.kind === "snap") {
      console.debug("stations-prix snap", id, decision.lat, decision.lon);
    }
  }
}

export function overpassFuelQuery(bbox: BBox): string {
  const { south, west, north, east } = bbox;
  return `[out:json][timeout:15];
// ${OSM_IDENT}
(
  node["amenity"="fuel"](${south},${west},${north},${east});
  way["amenity"="fuel"](${south},${west},${north},${east});
);
out center tags;`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function parseOverpassFuels(body: unknown): OsmFuel[] {
  const elements = asRecord(body)?.elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  return elements.flatMap((row) => {
    const item = asRecord(row);
    if (!item) {
      return [];
    }
    const tags = asRecord(item.tags) ?? {};
    const center = asRecord(item.center);
    const lat = asFiniteNumber(item.lat) ?? asFiniteNumber(center?.lat);
    const lon = asFiniteNumber(item.lon) ?? asFiniteNumber(center?.lon);
    if (lat === undefined || lon === undefined) {
      return [];
    }
    const house = asOptionalString(tags["addr:housenumber"]);
    const street = asOptionalString(tags["addr:street"]);
    const place = asOptionalString(tags["addr:place"]);
    const address = [house, street].filter(Boolean).join(" ") || place;
    return [
      {
        lat,
        lon,
        name: asOptionalString(tags.name),
        brand:
          asOptionalString(tags.brand) ?? asOptionalString(tags.operator),
        address,
        city:
          asOptionalString(tags["addr:city"]) ??
          asOptionalString(tags["addr:municipality"]),
        postcode: asOptionalString(tags["addr:postcode"]),
      },
    ];
  });
}

export async function fetchFuelPoisInBbox(
  bbox: BBox,
  options: {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
  } = {},
): Promise<OsmFuel[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeout = AbortSignal.timeout(OVERPASS_CLIENT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  const response = await fetchFn(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({ data: overpassFuelQuery(bbox) }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Overpass HTTP ${response.status}`);
  }
  return parseOverpassFuels(await response.json());
}

/** Remplit le cache pour les stations encore inconnues. `false` = rien changé ou OSM en échec. */
export async function refreshSnaps(
  stations: readonly RawStation[],
  bbox: BBox,
  cache: Map<string, SnapDecision>,
  options: {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
  } = {},
): Promise<boolean> {
  const pending = stations.some((raw) => {
    const id = stationSnapId(raw);
    return id !== undefined && !cache.has(id) && hintFromRaw(raw) !== null;
  });
  if (!pending) {
    return false;
  }

  try {
    const pois = await fetchFuelPoisInBbox(expandBboxKm(bbox, SNAP_RADIUS_KM), options);
    decideSnaps(stations, pois, cache);
    return true;
  } catch {
    return false;
  }
}
