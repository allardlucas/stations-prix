import { OTHER_BRAND, type BrandKey } from "./brand";
import { FRESHNESS_OPACITY, FUEL_FIELDS, type Fuel, type FreshnessBucket } from "./domain";

export type BrandMark = {
  letters: string;
  fill: string;
  ink: string;
};

/** Pastilles / monogrammes SVG maison — pas de logos officiels scrapés. */
const MARKS: Record<string, BrandMark> = {
  TotalEnergies: { letters: "TE", fill: "#c2410c", ink: "#fff7ed" },
  Intermarché: { letters: "IM", fill: "#be123c", ink: "#fff1f2" },
  "E.Leclerc": { letters: "L", fill: "#1d4ed8", ink: "#eff6ff" },
  Carrefour: { letters: "C", fill: "#0369a1", ink: "#f0f9ff" },
  Auchan: { letters: "A", fill: "#dc2626", ink: "#fef2f2" },
  Esso: { letters: "Es", fill: "#b45309", ink: "#fffbeb" },
  BP: { letters: "BP", fill: "#15803d", ink: "#f0fdf4" },
  Shell: { letters: "Sh", fill: "#ca8a04", ink: "#1c1917" },
  Avia: { letters: "Av", fill: "#7c3aed", ink: "#f5f3ff" },
  Eni: { letters: "En", fill: "#eab308", ink: "#1c1917" },
  "Super U": { letters: "U", fill: "#be185d", ink: "#fdf2f8" },
  Casino: { letters: "Ca", fill: "#b91c1c", ink: "#fef2f2" },
  Lidl: { letters: "Li", fill: "#0369a1", ink: "#f0f9ff" },
  Aldi: { letters: "Al", fill: "#0369a1", ink: "#fefce8" },
  Dyneff: { letters: "Dy", fill: "#ea580c", ink: "#fff7ed" },
  Elan: { letters: "É", fill: "#0f766e", ink: "#f0fdfa" },
  Q8: { letters: "Q8", fill: "#b91c1c", ink: "#fff7ed" },
  AS24: { letters: "24", fill: "#334155", ink: "#f8fafc" },
  Netto: { letters: "N", fill: "#ca8a04", ink: "#1c1917" },
  Cora: { letters: "Co", fill: "#1d4ed8", ink: "#eff6ff" },
  [OTHER_BRAND]: { letters: "S", fill: "#475569", ink: "#f8fafc" },
};

export const PIN_ICON_SIZE = [120, 40] as const;
export const PIN_ICON_ANCHOR = [60, 40] as const;

export function brandMark(brandKey: string): BrandMark {
  return MARKS[brandKey] ?? MARKS[OTHER_BRAND];
}

export function knownBrandMarks(): readonly BrandKey[] {
  return Object.keys(MARKS) as BrandKey[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function brandMarkSvg(brandKey: string): string {
  const mark = brandMark(brandKey);
  const size = mark.letters.length > 1 ? "9.5" : "12";
  return `<svg class="pin-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="${mark.fill}"/><text x="12" y="16.2" text-anchor="middle" fill="${mark.ink}" font-size="${size}" font-weight="700" font-family="system-ui,sans-serif">${escapeHtml(mark.letters)}</text></svg>`;
}

export type PinModel = {
  brandKey: string;
  fuel: Fuel;
  price: string;
  age: string;
  freshness: FreshnessBucket;
  selected?: boolean;
};

export function pinHtml(model: PinModel): string {
  const on = model.selected ? " is-on" : "";
  const opacity = FRESHNESS_OPACITY[model.freshness];
  const fuel = escapeHtml(FUEL_FIELDS[model.fuel].label);
  const price = escapeHtml(model.price);
  const age = escapeHtml(model.age);
  const brand = escapeHtml(model.brandKey);
  return `<div class="pin${on}" data-freshness="${model.freshness}" data-brand="${brand}" style="opacity:${opacity}">${brandMarkSvg(model.brandKey)}<span class="pin-body"><strong>${price}</strong><span class="pin-meta"><span class="pin-fuel">${fuel}</span><span class="pin-age">${age}</span></span></span></div>`;
}
