export const FUELS = ["gazole", "sp95", "sp98", "e85", "e10"] as const;
export type Fuel = (typeof FUELS)[number];

export const FRESH_PRICE_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_PRICE_AGE_MS = 72 * 60 * 60 * 1000;

export type FreshnessBucket = "full" | "mid" | "faint";

export const FRESHNESS_OPACITY = {
  full: 1,
  mid: 0.62,
  faint: 0.34,
} as const satisfies Record<FreshnessBucket, number>;

/** Stations les moins chères dans le viewport (tous âges). */
export const TOP_CHEAPEST = 5;

export function freshnessBucket(ageMs: number): FreshnessBucket {
  if (ageMs <= FRESH_PRICE_AGE_MS) {
    return "full";
  }
  if (ageMs <= MAX_PRICE_AGE_MS) {
    return "mid";
  }
  return "faint";
}

export const FUEL_FIELDS = {
  gazole: { price: "gazole_prix", updatedAt: "gazole_maj", label: "Gazole" },
  sp95: { price: "sp95_prix", updatedAt: "sp95_maj", label: "SP95" },
  sp98: { price: "sp98_prix", updatedAt: "sp98_maj", label: "SP98" },
  e85: { price: "e85_prix", updatedAt: "e85_maj", label: "E85" },
  e10: { price: "e10_prix", updatedAt: "e10_maj", label: "E10" },
} as const satisfies Record<
  Fuel,
  { price: string; updatedAt: string; label: string }
>;

export type RawStation = {
  id?: string | number;
  geom?: { lat?: number; lon?: number } | null;
  adresse?: string | null;
  ville?: string | null;
  cp?: string | null;
  /** Absents du schéma v2 live (47 champs) — lus seulement s'ils arrivent. */
  marque?: string | null;
  nom?: string | null;
  enseigne?: string | null;
  horaires?: string | null;
  horaires_automate_24_24?: string | null;
  gazole_prix?: number | null;
  gazole_maj?: string | null;
  sp95_prix?: number | null;
  sp95_maj?: string | null;
  sp98_prix?: number | null;
  sp98_maj?: string | null;
  e85_prix?: number | null;
  e85_maj?: string | null;
  e10_prix?: number | null;
  e10_maj?: string | null;
};

export type HoursInfo = {
  automate24h: boolean;
  lines: string[];
};

export type VisibleStation = {
  id: string;
  lat: number;
  lon: number;
  address: string;
  city: string;
  brand: string;
  hours: HoursInfo | null;
  fuel: Fuel;
  priceEur: number;
  updatedAt: Date;
  freshness: FreshnessBucket;
  /** Coords remplacées par un POI OSM `amenity=fuel` (recalage fiable). */
  snapped?: boolean;
};

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
  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  return {
    id: String(raw.id ?? `${lat},${lon}`),
    lat,
    lon,
    address: raw.adresse ?? "",
    city: raw.ville ?? "",
    brand: brandName(raw),
    hours: hoursFromRaw(raw),
    fuel,
    priceEur: price,
    updatedAt,
    freshness: freshnessBucket(now.getTime() - updatedAt.getTime()),
  };
}

/** Enseigne / marque / nom ODS, sans fallback inventé. */
export function brandName(
  raw: Pick<RawStation, "enseigne" | "marque" | "nom">,
): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of [raw.enseigne, raw.marque, raw.nom]) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    parts.push(text);
  }
  return parts.join(" · ");
}

const DAY_SHORT: Record<string, string> = {
  Lundi: "Lun",
  Mardi: "Mar",
  Mercredi: "Mer",
  Jeudi: "Jeu",
  Vendredi: "Ven",
  Samedi: "Sam",
  Dimanche: "Dim",
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function odsTime(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const match = /^(\d{1,2})\.(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  return `${match[1].padStart(2, "0")}h${match[2]}`;
}

function parseSlots(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  const slots: string[] = [];
  for (const row of rows) {
    const item = asObject(row);
    if (!item) {
      continue;
    }
    const open = item["@ouverture"];
    const close = item["@fermeture"];
    if (typeof open !== "string" || typeof close !== "string") {
      continue;
    }
    if (open.length === 0 || close.length === 0 || open === close) {
      continue;
    }
    const openText = odsTime(open);
    const closeText = odsTime(close);
    if (!openText || !closeText) {
      continue;
    }
    slots.push(`${openText}–${closeText}`);
  }
  return slots;
}

function formatHorairesLines(horaires: string | null | undefined): string[] {
  if (typeof horaires !== "string" || horaires.length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(horaires);
  } catch {
    return [];
  }

  const root = asObject(parsed);
  if (!root) {
    return [];
  }

  const jour = root.jour;
  const days = Array.isArray(jour) ? jour : jour ? [jour] : [];
  const items: { name: string; detail: string }[] = [];

  for (const day of days) {
    const row = asObject(day);
    const name = typeof row?.["@nom"] === "string" ? row["@nom"].trim() : "";
    if (!row || !name) {
      continue;
    }
    if (row["@ferme"] === "1") {
      items.push({ name, detail: "fermé" });
      continue;
    }
    const slots = parseSlots(row.horaire);
    if (slots.length === 0) {
      continue;
    }
    items.push({ name, detail: slots.join(", ") });
  }

  const hasOpenHours = items.some((item) => item.detail !== "fermé");
  const usable = hasOpenHours
    ? items
    : items.filter((item) => item.detail !== "fermé");

  const groups: { start: string; end: string; detail: string }[] = [];
  for (const item of usable) {
    const last = groups[groups.length - 1];
    if (last && last.detail === item.detail) {
      last.end = item.name;
    } else {
      groups.push({ start: item.name, end: item.name, detail: item.detail });
    }
  }

  return groups.map((group) => {
    const start = DAY_SHORT[group.start] ?? group.start;
    const label =
      group.start === group.end
        ? start
        : `${start}–${DAY_SHORT[group.end] ?? group.end}`;
    return `${label} ${group.detail}`;
  });
}

/** Horaires ODS uniquement : automate « Oui » et créneaux réellement renseignés. */
export function hoursFromRaw(
  raw: Pick<RawStation, "horaires" | "horaires_automate_24_24">,
): HoursInfo | null {
  const automate24h = raw.horaires_automate_24_24 === "Oui";
  const lines = formatHorairesLines(raw.horaires);
  if (!automate24h && lines.length === 0) {
    return null;
  }
  return { automate24h, lines };
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

export function cheapestStations(
  stations: readonly VisibleStation[],
  n = TOP_CHEAPEST,
): VisibleStation[] {
  return [...stations]
    .sort((a, b) => a.priceEur - b.priceEur || a.id.localeCompare(b.id))
    .slice(0, n);
}
