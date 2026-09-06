import { OTHER_BRAND, type BrandKey } from "./brand";
import { FRESHNESS_OPACITY, FUEL_FIELDS, type Fuel, type FreshnessBucket } from "./domain";
import aldiSvg from "./assets/brands/aldi.svg?raw";
import as24Svg from "./assets/brands/as24.svg?raw";
import auchanSvg from "./assets/brands/auchan.svg?raw";
import autreSvg from "./assets/brands/autre.svg?raw";
import aviaSvg from "./assets/brands/avia.svg?raw";
import bpSvg from "./assets/brands/bp.svg?raw";
import carrefourSvg from "./assets/brands/carrefour.svg?raw";
import casinoSvg from "./assets/brands/casino.svg?raw";
import coraSvg from "./assets/brands/cora.svg?raw";
import dyneffSvg from "./assets/brands/dyneff.svg?raw";
import eleclercSvg from "./assets/brands/eleclerc.svg?raw";
import elanSvg from "./assets/brands/elan.svg?raw";
import eniSvg from "./assets/brands/eni.svg?raw";
import essoSvg from "./assets/brands/esso.svg?raw";
import intermarcheSvg from "./assets/brands/intermarche.svg?raw";
import lidlSvg from "./assets/brands/lidl.svg?raw";
import nettoSvg from "./assets/brands/netto.svg?raw";
import q8Svg from "./assets/brands/q8.svg?raw";
import shellSvg from "./assets/brands/shell.svg?raw";
import superuSvg from "./assets/brands/superu.svg?raw";
import totalenergiesSvg from "./assets/brands/totalenergies.svg?raw";

export type BrandMark = {
  fill: string;
  kind: "logo" | "pump";
};

/** Disques couleur — le dessin est le SVG bundlé, pas un monogramme. */
const MARKS: Record<string, BrandMark> = {
  TotalEnergies: { fill: "#e30613", kind: "logo" },
  Intermarché: { fill: "#e30613", kind: "logo" },
  "E.Leclerc": { fill: "#0055a4", kind: "logo" },
  Carrefour: { fill: "#003087", kind: "logo" },
  Auchan: { fill: "#e30613", kind: "logo" },
  Esso: { fill: "#e30613", kind: "logo" },
  BP: { fill: "#00965e", kind: "logo" },
  Shell: { fill: "#fbce07", kind: "logo" },
  Avia: { fill: "#003399", kind: "logo" },
  Eni: { fill: "#ffd100", kind: "logo" },
  "Super U": { fill: "#e2007a", kind: "logo" },
  Casino: { fill: "#c8102e", kind: "logo" },
  Lidl: { fill: "#0050aa", kind: "logo" },
  Aldi: { fill: "#ff6a00", kind: "logo" },
  Dyneff: { fill: "#f15a22", kind: "logo" },
  Elan: { fill: "#0d7377", kind: "logo" },
  Q8: { fill: "#e30613", kind: "logo" },
  AS24: { fill: "#1b365d", kind: "logo" },
  Netto: { fill: "#ffd200", kind: "logo" },
  Cora: { fill: "#003399", kind: "logo" },
  [OTHER_BRAND]: { fill: "#475569", kind: "pump" },
};

const LOGOS: Record<string, string> = {
  TotalEnergies: totalenergiesSvg,
  Intermarché: intermarcheSvg,
  "E.Leclerc": eleclercSvg,
  Carrefour: carrefourSvg,
  Auchan: auchanSvg,
  Esso: essoSvg,
  BP: bpSvg,
  Shell: shellSvg,
  Avia: aviaSvg,
  Eni: eniSvg,
  "Super U": superuSvg,
  Casino: casinoSvg,
  Lidl: lidlSvg,
  Aldi: aldiSvg,
  Dyneff: dyneffSvg,
  Elan: elanSvg,
  Q8: q8Svg,
  AS24: as24Svg,
  Netto: nettoSvg,
  Cora: coraSvg,
  [OTHER_BRAND]: autreSvg,
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

function compactSvg(svg: string): string {
  return svg.replace(/>\s+</g, "><").trim();
}

export function brandMarkSvg(brandKey: string): string {
  return compactSvg(LOGOS[brandKey] ?? LOGOS[OTHER_BRAND]);
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
