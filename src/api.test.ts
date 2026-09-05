import { describe, expect, it } from "vitest";
import { parseRawStation } from "./api";

const liveRow = {
  id: 64100016,
  geom: { lat: 43.493, lon: -1.474 },
  adresse: "123 avenue henri de navarre",
  ville: "Bayonne",
  horaires_automate_24_24: "Oui",
  horaires:
    '{"@automate-24-24":"1","jour":[{"@nom":"Lundi","@ferme":"","horaire":{"@ouverture":"07.00","@fermeture":"19.30"}}]}',
  gazole_prix: 1.7,
  gazole_maj: "2026-09-05T10:00:00+00:00",
};

describe("parseRawStation", () => {
  it("reads horaires fields present on the live ODS v2 schema", () => {
    const station = parseRawStation(liveRow);
    expect(station?.horaires_automate_24_24).toBe("Oui");
    expect(station?.horaires).toContain("@ouverture");
    expect(station?.enseigne).toBeUndefined();
    expect(station?.marque).toBeUndefined();
    expect(station?.nom).toBeUndefined();
  });

  it("keeps enseigne/marque/nom only when they are strings", () => {
    expect(
      parseRawStation({
        ...liveRow,
        enseigne: "TotalEnergies",
        marque: "Total",
        nom: "Bayonne Navarre",
      }),
    ).toMatchObject({
      enseigne: "TotalEnergies",
      marque: "Total",
      nom: "Bayonne Navarre",
    });
    expect(parseRawStation({ ...liveRow, enseigne: 1 })?.enseigne).toBeUndefined();
  });
});
