import { type RawStation } from "./domain";

export const ODS_RECORDS_URL =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

export const SEARCH_RADIUS = "20km";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }
  return typeof value === "string" ? value : undefined;
}

export function parseRawStation(value: unknown): RawStation | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }

  const geomRow = asRecord(row.geom);
  const geom = geomRow
    ? { lat: asFiniteNumber(geomRow.lat), lon: asFiniteNumber(geomRow.lon) }
    : null;

  const id =
    typeof row.id === "string" || typeof row.id === "number"
      ? row.id
      : undefined;

  return {
    id,
    geom,
    adresse: asOptionalString(row.adresse),
    ville: asOptionalString(row.ville),
    gazole_prix: asFiniteNumber(row.gazole_prix) ?? null,
    gazole_maj: asOptionalString(row.gazole_maj) ?? null,
    sp95_prix: asFiniteNumber(row.sp95_prix) ?? null,
    sp95_maj: asOptionalString(row.sp95_maj) ?? null,
    sp98_prix: asFiniteNumber(row.sp98_prix) ?? null,
    sp98_maj: asOptionalString(row.sp98_maj) ?? null,
    e85_prix: asFiniteNumber(row.e85_prix) ?? null,
    e85_maj: asOptionalString(row.e85_maj) ?? null,
  };
}

export async function fetchNearbyStations(
  lat: number,
  lon: number,
): Promise<RawStation[]> {
  const url = new URL(ODS_RECORDS_URL);
  url.searchParams.set("limit", "100");
  url.searchParams.set(
    "where",
    `within_distance(geom,GEOM'POINT(${lon} ${lat})',${SEARCH_RADIUS})`,
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ODS HTTP ${response.status}`);
  }

  const body: unknown = await response.json();
  const results = asRecord(body)?.results;
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((row) => {
    const station = parseRawStation(row);
    return station ? [station] : [];
  });
}
