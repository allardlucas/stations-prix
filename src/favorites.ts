export const FAVORITES_STORAGE_KEY = "stations-prix:favorites";
export const MAX_FAVORITES = 8;

export type Favorite = {
  id: string;
  lat: number;
  lon: number;
  address: string;
  city: string;
  brand: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseFavorite(value: unknown): Favorite | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const lat = asFiniteNumber(row.lat);
  const lon = asFiniteNumber(row.lon);
  if (!id || lat === undefined || lon === undefined) {
    return null;
  }
  return {
    id,
    lat,
    lon,
    address: asString(row.address),
    city: asString(row.city),
    brand: asString(row.brand),
  };
}

/** JSON localStorage → liste dédupliquée par id, plafonnée. */
export function parseFavorites(raw: string | null | undefined): Favorite[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const seen = new Set<string>();
  const items: Favorite[] = [];
  for (const row of parsed) {
    const item = parseFavorite(row);
    if (!item || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    items.push(item);
    if (items.length >= MAX_FAVORITES) {
      break;
    }
  }
  return items;
}

export function serializeFavorites(items: readonly Favorite[]): string {
  return JSON.stringify(items.slice(0, MAX_FAVORITES).map((item) => ({
    id: item.id,
    lat: item.lat,
    lon: item.lon,
    address: item.address,
    city: item.city,
    brand: item.brand,
  })));
}

export function favoriteFromStation(
  station: Pick<Favorite, "id" | "lat" | "lon" | "address" | "city" | "brand">,
): Favorite {
  return {
    id: station.id,
    lat: station.lat,
    lon: station.lon,
    address: station.address,
    city: station.city,
    brand: station.brand,
  };
}

export function isFavorite(items: readonly Favorite[], id: string): boolean {
  return items.some((item) => item.id === id);
}

/** Ajoute en tête. Si déjà présent, le remonte. Au-delà du max, le plus ancien sort. */
export function addFavorite(
  items: readonly Favorite[],
  next: Favorite,
  max = MAX_FAVORITES,
): Favorite[] {
  const parsed = parseFavorite(next);
  if (!parsed) {
    return [...items];
  }
  return [parsed, ...items.filter((item) => item.id !== parsed.id)].slice(0, max);
}

export function removeFavorite(
  items: readonly Favorite[],
  id: string,
): Favorite[] {
  return items.filter((item) => item.id !== id);
}

export function favoriteChipLabel(item: Favorite): string {
  return item.brand || item.city || item.address || item.id;
}
