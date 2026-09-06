export const OTHER_BRAND = "Autre";

/** Enseignes FR courantes. Alias les plus longs d’abord (voir `BRAND_ALIASES`). */
export const BRAND_KEYS = [
  "TotalEnergies",
  "Intermarché",
  "E.Leclerc",
  "Carrefour",
  "Auchan",
  "Esso",
  "BP",
  "Shell",
  "Avia",
  "Eni",
  "Super U",
  "Casino",
  "Lidl",
  "Aldi",
  "Dyneff",
  "Elan",
  "Q8",
  "AS24",
  "Netto",
  "Cora",
] as const;

export type BrandKey = (typeof BRAND_KEYS)[number] | typeof OTHER_BRAND;

const ALIASES: { key: Exclude<BrandKey, typeof OTHER_BRAND>; tokens: string[] }[] =
  [
    {
      key: "TotalEnergies",
      tokens: [
        "totalenergies",
        "total energie",
        "total access",
        "total contact",
        "total",
      ],
    },
    {
      key: "Intermarché",
      tokens: [
        "intermarche contact",
        "intermarche super",
        "intermarche express",
        "intermarche",
        "roady",
      ],
    },
    {
      key: "E.Leclerc",
      tokens: ["e leclerc", "eleclerc", "leclerc"],
    },
    {
      key: "Carrefour",
      tokens: [
        "carrefour market",
        "carrefour contact",
        "carrefour express",
        "carrefour city",
        "carrefour",
      ],
    },
    { key: "Auchan", tokens: ["simply market", "myauchan", "simply", "auchan"] },
    { key: "Esso", tokens: ["esso express", "esso"] },
    { key: "BP", tokens: ["bp"] },
    { key: "Shell", tokens: ["shell"] },
    { key: "Avia", tokens: ["avia"] },
    { key: "Eni", tokens: ["eni", "agip"] },
    {
      key: "Super U",
      tokens: ["super u", "hyper u", "u express", "systeme u", "marche u"],
    },
    { key: "Casino", tokens: ["geant casino", "petit casino", "geant", "vival", "casino"] },
    { key: "Lidl", tokens: ["lidl"] },
    { key: "Aldi", tokens: ["aldi"] },
    { key: "Dyneff", tokens: ["dyneff"] },
    { key: "Elan", tokens: ["elan"] },
    { key: "Q8", tokens: ["q8"] },
    { key: "AS24", tokens: ["as 24", "as24"] },
    { key: "Netto", tokens: ["netto"] },
    { key: "Cora", tokens: ["cora"] },
  ];

export function foldBrandText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenList(value: string): string[] {
  return foldBrandText(value).split(" ").filter((token) => token.length > 0);
}

/** Alias = suite consécutive de tokens (évite `bp` ⊂ `bassin`). */
export function hayHasAlias(hay: string, alias: string): boolean {
  const source = tokenList(hay);
  const needle = tokenList(alias);
  if (source.length === 0 || needle.length === 0) {
    return false;
  }
  if (needle.length === 1) {
    const [only] = needle;
    // `bp` ⊂ `bassin` : les alias courts restent un token exact.
    if (only.length <= 2) {
      return source.some((token) => token === only);
    }
    return source.some((token) => token === only || token.startsWith(only));
  }
  outer: for (let i = 0; i <= source.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (source[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

function matchKey(
  text: string,
  minAliasChars = 1,
): Exclude<BrandKey, typeof OTHER_BRAND> | undefined {
  const folded = foldBrandText(text);
  if (!folded) {
    return undefined;
  }
  for (const row of ALIASES) {
    if (
      row.tokens.some(
        (alias) =>
          foldBrandText(alias).replace(/\s/g, "").length >= minAliasChars &&
          hayHasAlias(folded, alias),
      )
    ) {
      return row.key;
    }
  }
  return undefined;
}

export type BrandSources = {
  odsBrand?: string;
  address?: string;
  osmName?: string;
  osmBrand?: string;
};

export type InferredBrand = {
  key: BrandKey;
  /** Vide si `Autre` — la fiche n’affiche pas une enseigne inventée. */
  label: string;
};

/**
 * Priorité : champs ODS enseigne/marque/nom → nom/brand OSM → tokens dans l’adresse.
 * Pas de match → `Autre` (visible si filtre = toutes).
 */
export function inferBrand(sources: BrandSources): InferredBrand {
  const ods = sources.odsBrand?.trim() ?? "";
  const fromOds = ods ? matchKey(ods) : undefined;
  if (fromOds) {
    return { key: fromOds, label: ods };
  }

  const fromOsm =
    (sources.osmBrand ? matchKey(sources.osmBrand) : undefined) ??
    (sources.osmName ? matchKey(sources.osmName) : undefined);
  if (fromOsm) {
    return { key: fromOsm, label: fromOsm };
  }

  // Adresse seule : pas d’alias courts (`bp` ⊂ « B.A.B.BP 423 » / boîte postale).
  const fromAddress = sources.address ? matchKey(sources.address, 3) : undefined;
  if (fromAddress) {
    return { key: fromAddress, label: fromAddress };
  }

  return { key: OTHER_BRAND, label: ods };
}

export function applyBrandFromSnap(
  station: { brand: string; brandKey: string; address: string },
  snap?: { kind: string; name?: string; brand?: string },
): { brand: string; brandKey: string } {
  if (!snap || snap.kind !== "snap") {
    return { brand: station.brand, brandKey: station.brandKey };
  }
  const inferred = inferBrand({
    odsBrand: station.brand,
    address: station.address,
    osmName: snap.name,
    osmBrand: snap.brand,
  });
  return { brand: inferred.label, brandKey: inferred.key };
}

export function brandKeysInViewport(
  stations: readonly { brandKey: string }[],
): string[] {
  const keys = new Set(stations.map((station) => station.brandKey));
  return [...keys].sort((a, b) => {
    if (a === OTHER_BRAND) {
      return 1;
    }
    if (b === OTHER_BRAND) {
      return -1;
    }
    return a.localeCompare(b, "fr");
  });
}
