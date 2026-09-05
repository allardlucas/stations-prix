import { type RawStation } from "./domain";
import {
  bboxToOdsWhere,
  type BBox,
  VIEWPORT_LIMIT,
} from "./viewport";

export const ODS_RECORDS_URL =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

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
    marque: asOptionalString(row.marque),
    nom: asOptionalString(row.nom),
    enseigne: asOptionalString(row.enseigne),
    horaires: asOptionalString(row.horaires),
    horaires_automate_24_24: asOptionalString(row.horaires_automate_24_24),
    gazole_prix: asFiniteNumber(row.gazole_prix) ?? null,
    gazole_maj: asOptionalString(row.gazole_maj) ?? null,
    sp95_prix: asFiniteNumber(row.sp95_prix) ?? null,
    sp95_maj: asOptionalString(row.sp95_maj) ?? null,
    sp98_prix: asFiniteNumber(row.sp98_prix) ?? null,
    sp98_maj: asOptionalString(row.sp98_maj) ?? null,
    e85_prix: asFiniteNumber(row.e85_prix) ?? null,
    e85_maj: asOptionalString(row.e85_maj) ?? null,
    e10_prix: asFiniteNumber(row.e10_prix) ?? null,
    e10_maj: asOptionalString(row.e10_maj) ?? null,
  };
}

export function stationsQueryUrl(
  bbox: BBox,
  limit = VIEWPORT_LIMIT,
): URL {
  const url = new URL(ODS_RECORDS_URL);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("where", bboxToOdsWhere(bbox));
  return url;
}

export async function fetchStationsInBbox(
  bbox: BBox,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<RawStation[]> {
  const url = stationsQueryUrl(bbox, options.limit ?? VIEWPORT_LIMIT);

  const response = await fetch(url, { signal: options.signal });
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
