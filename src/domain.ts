export const FUELS = ["gazole", "sp95", "sp98", "e85"] as const;
export type Fuel = (typeof FUELS)[number];

export const MAX_PRICE_AGE_MS = 72 * 60 * 60 * 1000;

export const FUEL_FIELDS = {
  gazole: { price: "gazole_prix", updatedAt: "gazole_maj", label: "Gazole" },
  sp95: { price: "sp95_prix", updatedAt: "sp95_maj", label: "SP95" },
  sp98: { price: "sp98_prix", updatedAt: "sp98_maj", label: "SP98" },
  e85: { price: "e85_prix", updatedAt: "e85_maj", label: "E85" },
} as const satisfies Record<
  Fuel,
  { price: string; updatedAt: string; label: string }
>;

export type RawStation = {
  id?: string | number;
  geom?: { lat?: number; lon?: number } | null;
  adresse?: string | null;
  ville?: string | null;
  gazole_prix?: number | null;
  gazole_maj?: string | null;
  sp95_prix?: number | null;
  sp95_maj?: string | null;
  sp98_prix?: number | null;
  sp98_maj?: string | null;
  e85_prix?: number | null;
  e85_maj?: string | null;
};

export type VisibleStation = {
  id: string;
  lat: number;
  lon: number;
  address: string;
  city: string;
  fuel: Fuel;
  priceEur: number;
  updatedAt: Date;
};

export function isFreshPrice(updatedAt: Date, now: Date): boolean {
  return now.getTime() - updatedAt.getTime() <= MAX_PRICE_AGE_MS;
}

export function visibleStationFromRaw(
  raw: RawStation,
  fuel: Fuel,
  now: Date,
): VisibleStation | null {
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

  const fields = FUEL_FIELDS[fuel];
  const price = raw[fields.price];
  const maj = raw[fields.updatedAt];
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }
  if (typeof maj !== "string" || maj.length === 0) {
    return null;
  }

  const updatedAt = new Date(maj);
  if (Number.isNaN(updatedAt.getTime()) || !isFreshPrice(updatedAt, now)) {
    return null;
  }

  return {
    id: String(raw.id ?? `${lat},${lon}`),
    lat,
    lon,
    address: raw.adresse ?? "",
    city: raw.ville ?? "",
    fuel,
    priceEur: price,
    updatedAt,
  };
}

export function formatAge(updatedAt: Date, now: Date): string {
  const minutes = Math.floor(
    Math.max(0, now.getTime() - updatedAt.getTime()) / 60_000,
  );
  if (minutes < 1) {
    return "<1 min";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h`;
  }
  return `${Math.floor(hours / 24)} j`;
}

export function formatPrice(priceEur: number): string {
  return `${priceEur.toFixed(3).replace(".", ",")} €`;
}
