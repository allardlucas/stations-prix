import { describe, expect, it } from "vitest";
import {
  FRESHNESS_OPACITY,
  FRESH_PRICE_AGE_MS,
  FUEL_FIELDS,
  MAX_PRICE_AGE_MS,
  TOP_CHEAPEST,
  brandName,
  cheapestStations,
  isHighwayPop,
  formatAge,
  freshnessBucket,
  hoursFromRaw,
  type RawStation,
  type VisibleStation,
  visibleStationFromRaw,
} from "./domain";

const now = new Date("2026-09-05T12:00:00.000Z");

const raw: RawStation = {
  id: 64100010,
  geom: { lat: 43.483, lon: -1.488 },
  adresse: "22 Chemin d'Arancette",
  ville: "Bayonne",
  gazole_prix: 1.749,
  gazole_maj: "2026-09-04T10:00:00.000Z",
  sp95_prix: 1.689,
  sp95_maj: "2026-09-05T08:00:00.000Z",
  sp98_prix: 1.829,
  sp98_maj: "2026-09-02T12:00:00.000Z",
  e85_prix: 0.824,
  e85_maj: "2026-08-20T17:50:00.000Z",
  e10_prix: 1.654,
  e10_maj: "2026-09-05T10:00:00.000Z",
};

describe("freshnessBucket", () => {
  it("is full at or under 24h", () => {
    expect(freshnessBucket(0)).toBe("full");
    expect(freshnessBucket(FRESH_PRICE_AGE_MS)).toBe("full");
    expect(FRESHNESS_OPACITY.full).toBe(1);
  });

  it("is mid after 24h through 72h", () => {
    expect(freshnessBucket(FRESH_PRICE_AGE_MS + 1)).toBe("mid");
    expect(freshnessBucket(MAX_PRICE_AGE_MS)).toBe("mid");
    expect(FRESHNESS_OPACITY.mid).toBe(0.62);
  });

  it("is faint after 72h", () => {
    expect(freshnessBucket(MAX_PRICE_AGE_MS + 1)).toBe("faint");
    expect(FRESHNESS_OPACITY.faint).toBe(0.34);
  });
});

describe("visibleStationFromRaw fuel mapping", () => {
  it("reads gazole fields", () => {
    const station = visibleStationFromRaw(raw, "gazole", now);
    expect(station?.priceEur).toBe(1.749);
    expect(station?.updatedAt.toISOString()).toBe("2026-09-04T10:00:00.000Z");
    expect(station?.freshness).toBe("mid");
    expect(FUEL_FIELDS.gazole).toEqual({
      price: "gazole_prix",
      updatedAt: "gazole_maj",
      label: "Gazole",
    });
  });

  it("reads sp95 fields", () => {
    const station = visibleStationFromRaw(raw, "sp95", now);
    expect(station?.priceEur).toBe(1.689);
    expect(station?.updatedAt.toISOString()).toBe("2026-09-05T08:00:00.000Z");
    expect(station?.freshness).toBe("full");
  });

  it("keeps sp98 at the 72h boundary as mid", () => {
    const station = visibleStationFromRaw(raw, "sp98", now);
    expect(station?.priceEur).toBe(1.829);
    expect(station?.freshness).toBe("mid");
  });

  it("shows stale e85 as faint instead of hiding it", () => {
    const station = visibleStationFromRaw(raw, "e85", now);
    expect(station?.priceEur).toBe(0.824);
    expect(station?.updatedAt.toISOString()).toBe("2026-08-20T17:50:00.000Z");
    expect(station?.freshness).toBe("faint");
  });

  it("reads e10 fields", () => {
    const station = visibleStationFromRaw(raw, "e10", now);
    expect(station?.priceEur).toBe(1.654);
    expect(station?.updatedAt.toISOString()).toBe("2026-09-05T10:00:00.000Z");
    expect(FUEL_FIELDS.e10).toEqual({
      price: "e10_prix",
      updatedAt: "e10_maj",
      label: "E10",
    });
  });

  it("shows stale e10 as faint instead of hiding it", () => {
    const station = visibleStationFromRaw(
      { ...raw, e10_maj: "2026-09-01T12:00:00.000Z" },
      "e10",
      now,
    );
    expect(station?.priceEur).toBe(1.654);
    expect(station?.freshness).toBe("faint");
  });

  it("hides a missing price for the selected fuel", () => {
    expect(
      visibleStationFromRaw({ ...raw, gazole_prix: null }, "gazole", now),
    ).toBeNull();
  });

  it("passes through enseigne/nom when ODS sends them, else empty", () => {
    const plain = visibleStationFromRaw(raw, "gazole", now);
    expect(plain?.brand).toBe("");
    expect(plain?.brandKey).toBe("Autre");
    expect(plain?.highway).toBe(false);
    const named = visibleStationFromRaw(
      { ...raw, enseigne: "TotalEnergies", nom: "Station Bayonne" },
      "gazole",
      now,
    );
    expect(named?.brand).toBe("TotalEnergies · Station Bayonne");
    expect(named?.brandKey).toBe("TotalEnergies");
  });

  it("marks pop A as highway and R as not", () => {
    expect(visibleStationFromRaw({ ...raw, pop: "A" }, "gazole", now)?.highway).toBe(
      true,
    );
    expect(visibleStationFromRaw({ ...raw, pop: "R" }, "gazole", now)?.highway).toBe(
      false,
    );
  });

  it("keeps hours only when ODS has automate or real slots", () => {
    expect(visibleStationFromRaw(raw, "gazole", now)?.hours).toBeNull();
    expect(
      visibleStationFromRaw(
        { ...raw, horaires_automate_24_24: "Oui" },
        "gazole",
        now,
      )?.hours,
    ).toEqual({ automate24h: true, lines: [] });
  });
});

describe("isHighwayPop", () => {
  it("is true only for ODS pop A", () => {
    expect(isHighwayPop("A")).toBe(true);
    expect(isHighwayPop(" a ")).toBe(true);
    expect(isHighwayPop("R")).toBe(false);
    expect(isHighwayPop("r")).toBe(false);
    expect(isHighwayPop(null)).toBe(false);
    expect(isHighwayPop(undefined)).toBe(false);
    expect(isHighwayPop("")).toBe(false);
    expect(isHighwayPop("Autoroute")).toBe(false);
  });
});

describe("brandName", () => {
  it("returns empty when ODS has no enseigne/marque/nom", () => {
    expect(brandName({})).toBe("");
    expect(brandName({ enseigne: null, marque: "  ", nom: "" })).toBe("");
  });

  it("joins distinct enseigne then marque then nom", () => {
    expect(
      brandName({ enseigne: "Total", marque: "Total", nom: "Aire des Landes" }),
    ).toBe("Total · Aire des Landes");
  });
});

describe("hoursFromRaw", () => {
  it("returns null when automate is not Oui and horaires are empty", () => {
    expect(hoursFromRaw({})).toBeNull();
    expect(hoursFromRaw({ horaires_automate_24_24: "Non" })).toBeNull();
    expect(
      hoursFromRaw({
        horaires_automate_24_24: "Non",
        horaires:
          '{"@automate-24-24":"","jour":[{"@id":"1","@nom":"Lundi","@ferme":""}]}',
      }),
    ).toBeNull();
  });

  it("does not invent hours from invalid JSON", () => {
    expect(hoursFromRaw({ horaires: "{not-json" })).toBeNull();
  });

  it("shows automate 24h from horaires_automate_24_24 = Oui", () => {
    expect(hoursFromRaw({ horaires_automate_24_24: "Oui" })).toEqual({
      automate24h: true,
      lines: [],
    });
  });

  it("groups real ODS slots and marks an explicit closed day", () => {
    expect(
      hoursFromRaw({
        horaires_automate_24_24: "Oui",
        horaires: JSON.stringify({
          "@automate-24-24": "1",
          jour: [
            {
              "@id": "1",
              "@nom": "Lundi",
              "@ferme": "",
              horaire: { "@ouverture": "07.00", "@fermeture": "19.30" },
            },
            {
              "@id": "2",
              "@nom": "Mardi",
              "@ferme": "",
              horaire: { "@ouverture": "07.00", "@fermeture": "19.30" },
            },
            {
              "@id": "6",
              "@nom": "Samedi",
              "@ferme": "",
              horaire: [
                { "@ouverture": "08.30", "@fermeture": "13.30" },
                { "@ouverture": "00.00", "@fermeture": "00.00" },
              ],
            },
            { "@id": "7", "@nom": "Dimanche", "@ferme": "1" },
          ],
        }),
      }),
    ).toEqual({
      automate24h: true,
      lines: ["Lun–Mar 07h00–19h30", "Sam 08h30–13h30", "Dim fermé"],
    });
  });

  it("skips equal open/close placeholders such as 01.00–01.00", () => {
    expect(
      hoursFromRaw({
        horaires: JSON.stringify({
          jour: [
            {
              "@nom": "Lundi",
              "@ferme": "",
              horaire: { "@ouverture": "01.00", "@fermeture": "01.00" },
            },
          ],
        }),
      }),
    ).toBeNull();
  });

  it("does not print fermé for an automate-only station (ODS ferme+01.00 placeholders)", () => {
    expect(
      hoursFromRaw({
        horaires_automate_24_24: "Oui",
        horaires: JSON.stringify({
          jour: [
            {
              "@nom": "Lundi",
              "@ferme": "1",
              horaire: { "@ouverture": "01.00", "@fermeture": "01.00" },
            },
            {
              "@nom": "Dimanche",
              "@ferme": "1",
              horaire: { "@ouverture": "01.00", "@fermeture": "01.00" },
            },
          ],
        }),
      }),
    ).toEqual({ automate24h: true, lines: [] });
  });
});

describe("formatAge", () => {
  it("formats minutes, hours, and days", () => {
    expect(formatAge(new Date("2026-09-05T11:40:00.000Z"), now)).toBe("20 min");
    expect(formatAge(new Date("2026-09-05T09:00:00.000Z"), now)).toBe("3 h");
    expect(formatAge(new Date("2026-09-03T12:00:00.000Z"), now)).toBe("2 j");
  });
});

function station(
  partial: Pick<VisibleStation, "id" | "priceEur"> &
    Partial<VisibleStation>,
): VisibleStation {
  return {
    lat: 43.5,
    lon: -1.47,
    address: "",
    city: "Bayonne",
    brand: "",
    brandKey: "Autre",
    highway: false,
    hours: null,
    fuel: "gazole",
    updatedAt: now,
    freshness: "full",
    ...partial,
  };
}

describe("cheapestStations", () => {
  it("caps at TOP_CHEAPEST = 5", () => {
    expect(TOP_CHEAPEST).toBe(5);
  });

  it("sorts VisibleStation[] by price and keeps only the top N", () => {
    const input = [
      station({ id: "a", priceEur: 1.9 }),
      station({ id: "b", priceEur: 1.5 }),
      station({ id: "c", priceEur: 1.7 }),
      station({ id: "d", priceEur: 1.4 }),
      station({ id: "e", priceEur: 1.8 }),
      station({ id: "f", priceEur: 1.6 }),
    ];
    const snapshot = input.map((row) => row.id);
    expect(cheapestStations(input).map((row) => row.id)).toEqual([
      "d",
      "b",
      "f",
      "c",
      "e",
    ]);
    expect(input.map((row) => row.id)).toEqual(snapshot);
  });

  it("returns fewer than N when the viewport has fewer stations", () => {
    expect(
      cheapestStations([
        station({ id: "a", priceEur: 2 }),
        station({ id: "b", priceEur: 1 }),
      ]).map((row) => row.id),
    ).toEqual(["b", "a"]);
  });

  it("includes a station older than 72h when it is the cheapest", () => {
    const stale = station({
      id: "old",
      priceEur: 1.2,
      updatedAt: new Date("2026-08-20T12:00:00.000Z"),
      freshness: "faint",
    });
    const top = cheapestStations([
      station({ id: "fresh-high", priceEur: 1.9 }),
      stale,
      station({ id: "fresh-mid", priceEur: 1.5 }),
    ]);
    expect(top[0]).toMatchObject({ id: "old", freshness: "faint" });
    expect(top.map((row) => row.id)).toEqual(["old", "fresh-mid", "fresh-high"]);
  });
});
