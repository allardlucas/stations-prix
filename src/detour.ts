import { haversineKm, type LatLon } from "./geo";

export const FILL_STORAGE_KEY = "stations-prix:fill";
export const DEFAULT_TANK_L = 50;
export const DEFAULT_CONSO_L100 = 6.5;
export const NEAR_CHEAPEST_KM = 8;

export type FillPrefs = {
  tankL: number;
  consoL100: number;
};

export const DEFAULT_FILL_PREFS: FillPrefs = {
  tankL: DEFAULT_TANK_L,
  consoL100: DEFAULT_CONSO_L100,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeFillPrefs(value: Partial<FillPrefs> | null | undefined): FillPrefs {
  const tank = typeof value?.tankL === "number" && Number.isFinite(value.tankL)
    ? value.tankL
    : DEFAULT_TANK_L;
  const conso =
    typeof value?.consoL100 === "number" && Number.isFinite(value.consoL100)
      ? value.consoL100
      : DEFAULT_CONSO_L100;
  return {
    tankL: clamp(tank, 1, 200),
    consoL100: clamp(conso, 1, 30),
  };
}

export function parseFillPrefs(raw: string | null | undefined): FillPrefs {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ...DEFAULT_FILL_PREFS };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return { ...DEFAULT_FILL_PREFS };
    }
    return sanitizeFillPrefs(parsed as Partial<FillPrefs>);
  } catch {
    return { ...DEFAULT_FILL_PREFS };
  }
}

export function serializeFillPrefs(prefs: FillPrefs): string {
  const clean = sanitizeFillPrefs(prefs);
  return JSON.stringify({ tankL: clean.tankL, consoL100: clean.consoL100 });
}

/**
 * Gain net approx (€) : litres × Δprix − (km × conso/100 × prix station).
 * Δprix = prix de référence − prix station (positif = station moins chère).
 */
export function detourGainEur(input: {
  stationPrice: number;
  referencePrice: number;
  detourKm: number;
  tankL: number;
  consoL100: number;
}): number {
  const prefs = sanitizeFillPrefs({
    tankL: input.tankL,
    consoL100: input.consoL100,
  });
  const km = Number.isFinite(input.detourKm) ? Math.max(0, input.detourKm) : 0;
  const delta = input.referencePrice - input.stationPrice;
  const burn = km * (prefs.consoL100 / 100) * input.stationPrice;
  return prefs.tankL * delta - burn;
}

export function formatGainEur(gain: number): string {
  const rounded = Math.round(gain * 100) / 100;
  const abs = Math.abs(rounded).toFixed(2).replace(".", ",");
  if (rounded > 0) {
    return `+${abs} €`;
  }
  if (rounded < 0) {
    return `−${abs} €`;
  }
  return `0,00 €`;
}

export type PricePeer = LatLon & {
  id: string;
  priceEur: number;
};

export type ReferencePrice = {
  price: number;
  kind: "near" | "mean";
};

/** Moins chère autre station ≤ `nearKm` de l’origine, sinon moyenne viewport. */
export function referencePrice(
  stationId: string,
  peers: readonly PricePeer[],
  origin: LatLon,
  nearKm = NEAR_CHEAPEST_KM,
): ReferencePrice | null {
  const nearOthers = peers.filter(
    (peer) =>
      peer.id !== stationId &&
      Number.isFinite(peer.priceEur) &&
      haversineKm(origin, peer) <= nearKm,
  );
  const self = peers.find((peer) => peer.id === stationId);
  if (nearOthers.length > 0) {
    let cheapest = nearOthers[0];
    for (const peer of nearOthers) {
      if (
        peer.priceEur < cheapest.priceEur ||
        (peer.priceEur === cheapest.priceEur && peer.id.localeCompare(cheapest.id) < 0)
      ) {
        cheapest = peer;
      }
    }
    if (!self || self.priceEur > cheapest.priceEur) {
      return { price: cheapest.priceEur, kind: "near" };
    }
  }

  const others = peers.filter(
    (peer) => peer.id !== stationId && Number.isFinite(peer.priceEur),
  );
  if (others.length === 0) {
    return null;
  }
  const sum = others.reduce((acc, peer) => acc + peer.priceEur, 0);
  return { price: sum / others.length, kind: "mean" };
}

export function gainVsLabel(kind: ReferencePrice["kind"]): string {
  return kind === "near" ? "vs moins chère proche" : "vs moyenne";
}
