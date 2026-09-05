import { describe, expect, it } from "vitest";
import {
  FUEL_FIELDS,
  formatAge,
  isFreshPrice,
  type RawStation,
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
};

describe("isFreshPrice", () => {
  it("keeps a price updated exactly 72h ago", () => {
    expect(isFreshPrice(new Date("2026-09-02T12:00:00.000Z"), now)).toBe(true);
  });

  it("hides a price older than 72h", () => {
    expect(isFreshPrice(new Date("2026-09-02T11:59:00.000Z"), now)).toBe(false);
  });

  it("keeps a price updated 24h ago", () => {
    expect(isFreshPrice(new Date("2026-09-04T12:00:00.000Z"), now)).toBe(true);
  });
});

describe("visibleStationFromRaw fuel mapping", () => {
  it("reads gazole fields", () => {
    const station = visibleStationFromRaw(raw, "gazole", now);
    expect(station?.priceEur).toBe(1.749);
    expect(station?.updatedAt.toISOString()).toBe("2026-09-04T10:00:00.000Z");
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
  });

  it("keeps sp98 at the 72h boundary", () => {
    const station = visibleStationFromRaw(raw, "sp98", now);
    expect(station?.priceEur).toBe(1.829);
  });

  it("hides stale e85 instead of showing it greyed", () => {
    expect(visibleStationFromRaw(raw, "e85", now)).toBeNull();
  });

  it("hides a missing price for the selected fuel", () => {
    expect(
      visibleStationFromRaw({ ...raw, gazole_prix: null }, "gazole", now),
    ).toBeNull();
  });
});

describe("formatAge", () => {
  it("formats minutes, hours, and days", () => {
    expect(formatAge(new Date("2026-09-05T11:40:00.000Z"), now)).toBe("20 min");
    expect(formatAge(new Date("2026-09-05T09:00:00.000Z"), now)).toBe("3 h");
    expect(formatAge(new Date("2026-09-03T12:00:00.000Z"), now)).toBe("2 j");
  });
});
