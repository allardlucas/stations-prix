import { describe, expect, it } from "vitest";
import {
  OTHER_BRAND,
  applyBrandFromSnap,
  brandKeysInViewport,
  hayHasAlias,
  inferBrand,
} from "./brand";

describe("hayHasAlias", () => {
  it("matches a brand token, including total → totalenergies", () => {
    expect(hayHasAlias("Station TotalEnergies Access", "total")).toBe(true);
    expect(hayHasAlias("intermarche itxassou", "intermarche")).toBe(true);
    expect(hayHasAlias("Super U Anglet", "super u")).toBe(true);
  });

  it("does not treat bp as a prefix of bassin", () => {
    expect(hayHasAlias("BP", "bp")).toBe(true);
    expect(hayHasAlias("bassin de l Adour", "bp")).toBe(false);
  });

  it("does not match a lone u as Super U", () => {
    expect(hayHasAlias("U", "super u")).toBe(false);
    expect(hayHasAlias("systeme u", "systeme u")).toBe(true);
  });
});

describe("inferBrand", () => {
  it("uses ODS enseigne/marque/nom when a known token is present", () => {
    expect(inferBrand({ odsBrand: "TotalEnergies · Station Bayonne" })).toEqual({
      key: "TotalEnergies",
      label: "TotalEnergies · Station Bayonne",
    });
  });

  it("uses OSM name / brand at snap time when ODS is empty", () => {
    expect(
      inferBrand({ osmName: "Intermarché", osmBrand: "Intermarché" }),
    ).toEqual({ key: "Intermarché", label: "Intermarché" });
    expect(inferBrand({ osmName: "Station Leclerc" })).toEqual({
      key: "E.Leclerc",
      label: "E.Leclerc",
    });
  });

  it("matches the FR enseigne dictionary on typical OSM name/brand strings", () => {
    const cases: { text: string; key: string }[] = [
      { text: "Total Access", key: "TotalEnergies" },
      { text: "Total Contact", key: "TotalEnergies" },
      { text: "TotalEnergies", key: "TotalEnergies" },
      { text: "Station Service E.Leclerc", key: "E.Leclerc" },
      { text: "E. Leclerc", key: "E.Leclerc" },
      { text: "Carrefour Market", key: "Carrefour" },
      { text: "Carrefour City", key: "Carrefour" },
      { text: "Intermarché Contact", key: "Intermarché" },
      { text: "Roady", key: "Intermarché" },
      { text: "Super U", key: "Super U" },
      { text: "Hyper U Cambo", key: "Super U" },
      { text: "Système U", key: "Super U" },
      { text: "Agip", key: "Eni" },
      { text: "Station-service AVIA", key: "Avia" },
      { text: "Station Service Dyneff", key: "Dyneff" },
      { text: "AS24", key: "AS24" },
      { text: "AS 24", key: "AS24" },
      { text: "Netto", key: "Netto" },
      { text: "Cora", key: "Cora" },
      { text: "MyAuchan", key: "Auchan" },
    ];
    for (const row of cases) {
      expect(inferBrand({ osmName: row.text }), row.text).toEqual({
        key: row.key,
        label: row.key,
      });
      expect(inferBrand({ osmBrand: row.text }), row.text).toEqual({
        key: row.key,
        label: row.key,
      });
    }
  });

  it("uses OSM brand when the name is a generic Relais without a token", () => {
    expect(
      inferBrand({
        osmName: "Relais Bayonne Sainte-Croix",
        osmBrand: "TotalEnergies",
      }),
    ).toEqual({ key: "TotalEnergies", label: "TotalEnergies" });
    expect(inferBrand({ osmName: "Relais Bayonne Sainte-Croix" })).toEqual({
      key: OTHER_BRAND,
      label: "",
    });
  });

  it("falls back to known tokens in the address", () => {
    expect(inferBrand({ address: "Parking Carrefour Market" })).toEqual({
      key: "Carrefour",
      label: "Carrefour",
    });
  });

  it("does not treat a postal BP in the address as the BP brand", () => {
    expect(inferBrand({ address: "Boulevard du B.A.B.BP 423" })).toEqual({
      key: OTHER_BRAND,
      label: "",
    });
    expect(inferBrand({ osmName: "BP" })).toEqual({ key: "BP", label: "BP" });
  });

  it("tags unknown text as Autre and keeps an ODS name if any", () => {
    expect(inferBrand({ address: "22 Chemin d'Arancette" })).toEqual({
      key: OTHER_BRAND,
      label: "",
    });
    expect(inferBrand({ odsBrand: "Aire des Landes" })).toEqual({
      key: OTHER_BRAND,
      label: "Aire des Landes",
    });
  });
});

describe("applyBrandFromSnap", () => {
  it("fills Intermarché from the OSM snap when ODS has no marque", () => {
    expect(
      applyBrandFromSnap(
        { brand: "", brandKey: OTHER_BRAND, address: "ZA Errobi" },
        { kind: "snap", name: "Intermarché", brand: "Intermarché" },
      ),
    ).toEqual({ brand: "Intermarché", brandKey: "Intermarché" });
  });

  it("tags a Relais from OSM brand at snap, not from the generic name", () => {
    expect(
      applyBrandFromSnap(
        { brand: "", brandKey: OTHER_BRAND, address: "20 AVENUE MARECHAL JUIN" },
        {
          kind: "snap",
          name: "Relais Bayonne Sainte-Croix",
          brand: "TotalEnergies",
        },
      ),
    ).toEqual({ brand: "TotalEnergies", brandKey: "TotalEnergies" });
  });

  it("keeps Autre when the snap has no brand token", () => {
    expect(
      applyBrandFromSnap(
        { brand: "", brandKey: OTHER_BRAND, address: "ZA Errobi" },
        { kind: "snap", name: "Station-service" },
      ),
    ).toEqual({ brand: "", brandKey: OTHER_BRAND });
  });
});

describe("brandKeysInViewport", () => {
  it("sorts known brands and keeps Autre last", () => {
    expect(
      brandKeysInViewport([
        { brandKey: OTHER_BRAND },
        { brandKey: "TotalEnergies" },
        { brandKey: "Intermarché" },
        { brandKey: "TotalEnergies" },
      ]),
    ).toEqual(["Intermarché", "TotalEnergies", OTHER_BRAND]);
  });
});
