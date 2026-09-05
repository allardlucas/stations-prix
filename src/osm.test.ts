import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRawStation } from "./api";
import { visibleStationFromRaw, type RawStation } from "./domain";
import { haversineKm } from "./geo";
import { goLinks } from "./links";
import {
  applySnapToVisible,
  decideSnaps,
  expandBboxKm,
  hintFromRaw,
  NOMINATIM_URL,
  parseNominatimFuels,
  parseOverpassFuels,
  pickReliableSnap,
  refreshSnaps,
  scoreCandidate,
  SNAP_RADIUS_KM,
  stationSnapId,
  type OsmFuel,
  type SnapDecision,
  type SnapHint,
} from "./osm";

/** Fixture ODS Intermarché Itxassou — geom officiel faux d’~1,6 km. */
const itxassouOds: SnapHint = {
  id: "64250001",
  lat: 43.338,
  lon: -1.405,
  address: "ZA Errobi",
  city: "Itxassou",
  postcode: "64250",
};

const itxassouRaw: RawStation = {
  id: 64250001,
  geom: { lat: 43.338, lon: -1.405 },
  adresse: "ZA Errobi",
  ville: "Itxassou",
  cp: "64250",
  gazole_prix: 2.219,
  gazole_maj: "2026-09-04T10:24:46+00:00",
};

/** Pompe OSM réelle (node 25212773) — forme Nominatim live. */
const intermarcheOsm: OsmFuel = {
  lat: 43.3503789,
  lon: -1.4155828,
  name: "Intermarché",
  brand: "Intermarché",
  city: "Itxassou",
  postcode: "64250",
  refPrixId: "64250001",
};

/** Autre `amenity=fuel` dans le rayon 2 km, plus proche du geom ODS. Même ville/CP. */
const unnamedOsm: OsmFuel = {
  lat: 43.3278698,
  lon: -1.3949709,
  city: "Itxassou",
  postcode: "64250",
};

const itxassouPois = [intermarcheOsm, unnamedOsm];

const itxassouBbox = {
  west: -1.42,
  south: 43.33,
  east: -1.39,
  north: 43.36,
};

function expectNearPump(lat: number, lon: number): void {
  expect(lat).toBeCloseTo(43.3504, 3);
  expect(lon).toBeCloseTo(-1.4156, 3);
  expect(
    haversineKm({ lat, lon }, { lat: 43.3504, lon: -1.4156 }),
  ).toBeLessThan(0.05);
}

describe("Itxassou 64250001 fixture", () => {
  it("is ~1.6 km from the ODS geom — a 200–300 m snap would miss it", () => {
    const km = haversineKm(itxassouOds, intermarcheOsm);
    expect(km).toBeGreaterThan(1.5);
    expect(km).toBeLessThan(SNAP_RADIUS_KM);
    expect(km).toBeGreaterThan(0.3);
  });

  it("keeps the unnamed pump closer to the ODS geom than Intermarché", () => {
    expect(haversineKm(itxassouOds, unnamedOsm)).toBeLessThan(
      haversineKm(itxassouOds, intermarcheOsm),
    );
  });

  it("snaps pin + Y aller to the Intermarché pump, not the closer unnamed POI", () => {
    const decision = pickReliableSnap(itxassouOds, itxassouPois);
    expect(decision.kind).toBe("snap");
    if (decision.kind !== "snap") {
      return;
    }
    expectNearPump(decision.lat, decision.lon);

    const visible = visibleStationFromRaw(
      itxassouRaw,
      "gazole",
      new Date("2026-09-05T12:00:00.000Z"),
    );
    expect(visible).not.toBeNull();
    const snapped = applySnapToVisible(visible!, decision);
    expect(snapped.snapped).toBe(true);
    expectNearPump(snapped.lat, snapped.lon);
    for (const link of goLinks(
      snapped.lat,
      snapped.lon,
      snapped.address,
      snapped.city,
    )) {
      expect(link.href).toContain(String(snapped.lat));
      expect(link.href).toContain(String(snapped.lon));
      expect(link.href).not.toContain("43.338");
      expect(link.href).not.toContain("-1.405");
    }
  });
});

describe("pickReliableSnap", () => {
  it("snaps when a single fuel POI is inside 2 km", () => {
    const decision = pickReliableSnap(itxassouOds, [intermarcheOsm]);
    expect(decision.kind).toBe("snap");
    if (decision.kind === "snap") {
      expectNearPump(decision.lat, decision.lon);
    }
  });

  it("keeps ODS when nothing is in range", () => {
    expect(pickReliableSnap(itxassouOds, [])).toEqual({ kind: "keep" });
    expect(
      pickReliableSnap(itxassouOds, [
        { lat: 43.49, lon: -1.47, name: "Bayonne" },
      ]),
    ).toEqual({ kind: "keep" });
  });

  it("keeps ODS when two pumps share city/CP and none has the ODS ref", () => {
    const decision = pickReliableSnap(
      { ...itxassouOds, id: undefined },
      [
        { ...intermarcheOsm, refPrixId: undefined },
        unnamedOsm,
      ],
    );
    expect(decision.kind).toBe("keep");
  });

  it("keeps ODS when two similar untagged pumps are ambiguous", () => {
    const decision = pickReliableSnap(
      { lat: 43.4, lon: -1.4 },
      [
        { lat: 43.405, lon: -1.4 },
        { lat: 43.407, lon: -1.4 },
      ],
    );
    expect(decision.kind).toBe("keep");
  });

  it("snaps to the candidate with a clear address match", () => {
    const hint: SnapHint = {
      lat: 43.4,
      lon: -1.4,
      address: "22 Chemin d'Arancette",
      city: "Bayonne",
    };
    const decision = pickReliableSnap(hint, [
      { lat: 43.401, lon: -1.401, address: "Route de Cambo" },
      {
        lat: 43.408,
        lon: -1.41,
        address: "22 Chemin d'Arancette",
        city: "Bayonne",
      },
    ]);
    expect(decision.kind).toBe("snap");
    if (decision.kind === "snap") {
      expect(decision.lat).toBeCloseTo(43.408, 5);
      expect(decision.lon).toBeCloseTo(-1.41, 5);
    }
  });

  it("snaps when one POI is clearly on the ODS geom and the other is far", () => {
    const decision = pickReliableSnap({ lat: 43.4, lon: -1.4 }, [
      { lat: 43.4005, lon: -1.4003 },
      { lat: 43.412, lon: -1.41 },
    ]);
    expect(decision.kind).toBe("snap");
    if (decision.kind === "snap") {
      expect(decision.lat).toBeCloseTo(43.4005, 5);
    }
  });
});

describe("scoreCandidate", () => {
  it("rewards postcode over a slightly closer untagged POI (Overpass-shaped)", () => {
    const inter = scoreCandidate(itxassouOds, {
      lat: intermarcheOsm.lat,
      lon: intermarcheOsm.lon,
      name: "Intermarché",
      postcode: "64250",
    });
    const other = scoreCandidate(itxassouOds, {
      lat: unnamedOsm.lat,
      lon: unnamedOsm.lon,
    });
    expect(inter.postcodeScore).toBe(1);
    expect(other.postcodeScore).toBe(0);
    expect(inter.score).toBeGreaterThan(other.score);
    expect(inter.score - other.score).toBeGreaterThanOrEqual(0.12);
  });
});

describe("parseOverpassFuels", () => {
  it("reads node lat/lon and way center + tags", () => {
    const pois = parseOverpassFuels({
      elements: [
        {
          type: "node",
          id: 25212773,
          lat: 43.3503789,
          lon: -1.4155828,
          tags: {
            amenity: "fuel",
            name: "Intermarché",
            brand: "Intermarché",
            "addr:postcode": "64250",
          },
        },
        {
          type: "way",
          id: 79563861,
          center: { lat: 43.3278698, lon: -1.3949709 },
          tags: { amenity: "fuel" },
        },
        { type: "node", id: 1, tags: { amenity: "fuel" } },
      ],
    });
    expect(pois).toHaveLength(2);
    expect(pois[0]).toMatchObject({
      lat: 43.3503789,
      lon: -1.4155828,
      name: "Intermarché",
      brand: "Intermarché",
      postcode: "64250",
    });
    expect(pois[1]).toMatchObject({ lat: 43.3278698, lon: -1.3949709 });
  });

  it("reads ref:FR:prix-carburants", () => {
    expect(
      parseOverpassFuels({
        elements: [
          {
            type: "node",
            lat: 43.35,
            lon: -1.41,
            tags: { "ref:FR:prix-carburants": "64250001" },
          },
        ],
      })[0]?.refPrixId,
    ).toBe("64250001");
  });
});

describe("parseNominatimFuels", () => {
  it("reads lat/lon strings, village, postcode and ODS ref", () => {
    const pois = parseNominatimFuels([
      {
        lat: "43.3503789",
        lon: "-1.4155828",
        category: "amenity",
        type: "fuel",
        name: "Intermarché",
        address: { village: "Itxassou", postcode: "64250", road: "Inbidiako bidea" },
        extratags: { "ref:FR:prix-carburants": "64250001", brand: "Intermarché" },
      },
      {
        lat: "43.49",
        lon: "-1.47",
        category: "highway",
        type: "bus_stop",
        name: "not a pump",
      },
    ]);
    expect(pois).toHaveLength(1);
    expect(pois[0]).toMatchObject({
      lat: 43.3503789,
      lon: -1.4155828,
      name: "Intermarché",
      brand: "Intermarché",
      city: "Itxassou",
      postcode: "64250",
      address: "Inbidiako bidea",
      refPrixId: "64250001",
    });
  });
});

describe("expandBboxKm / hint / cache", () => {
  it("expands a bbox by about 2 km", () => {
    const expanded = expandBboxKm(itxassouBbox, 2);
    expect(expanded.south).toBeLessThan(itxassouBbox.south);
    expect(expanded.north).toBeGreaterThan(itxassouBbox.north);
    expect(expanded.west).toBeLessThan(itxassouBbox.west);
    expect(expanded.east).toBeGreaterThan(itxassouBbox.east);
    expect(itxassouBbox.north - itxassouBbox.south + 4 / 111).toBeCloseTo(
      expanded.north - expanded.south,
      1,
    );
  });

  it("builds a snap hint from ODS fields including cp", () => {
    expect(stationSnapId(itxassouRaw)).toBe("64250001");
    expect(hintFromRaw(itxassouRaw)).toEqual(itxassouOds);
    expect(hintFromRaw({ id: 1 })).toBeNull();
  });

  it("does not overwrite a cached decision", () => {
    const cache = new Map<string, SnapDecision>([
      ["64250001", { kind: "keep" }],
    ]);
    decideSnaps([itxassouRaw], itxassouPois, cache);
    expect(cache.get("64250001")).toEqual({ kind: "keep" });
  });
});

describe("refreshSnaps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips Overpass when every station id is already cached", async () => {
    const fetchFn = vi.fn();
    const cache = new Map<string, SnapDecision>([
      ["64250001", { kind: "keep" }],
    ]);
    const changed = await refreshSnaps([itxassouRaw], itxassouBbox, cache, {
      fetchFn,
    });
    expect(changed).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fills the cache from one Nominatim viewbox query", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: String(intermarcheOsm.lat),
          lon: String(intermarcheOsm.lon),
          category: "amenity",
          type: "fuel",
          name: "Intermarché",
          address: { village: "Itxassou", postcode: "64250" },
          extratags: { "ref:FR:prix-carburants": "64250001" },
        },
        {
          lat: String(unnamedOsm.lat),
          lon: String(unnamedOsm.lon),
          category: "amenity",
          type: "fuel",
          address: { village: "Itxassou", postcode: "64250" },
        },
      ],
    });
    const cache = new Map<string, SnapDecision>();
    const changed = await refreshSnaps([itxassouRaw], itxassouBbox, cache, {
      fetchFn,
    });
    expect(changed).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = String(fetchFn.mock.calls[0]?.[0]);
    expect(url).toContain(NOMINATIM_URL);
    const decision = cache.get("64250001");
    expect(decision?.kind).toBe("snap");
    if (decision?.kind === "snap") {
      expectNearPump(decision.lat, decision.lon);
    }
  });

  it("falls back to ODS silently when Overpass fails (no cache write)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network"));
    const cache = new Map<string, SnapDecision>();
    const changed = await refreshSnaps([itxassouRaw], itxassouBbox, cache, {
      fetchFn,
    });
    expect(changed).toBe(false);
    expect(cache.size).toBe(0);
    const visible = visibleStationFromRaw(
      itxassouRaw,
      "gazole",
      new Date("2026-09-05T12:00:00.000Z"),
    );
    expect(applySnapToVisible(visible!, cache.get("64250001"))).toMatchObject({
      lat: 43.338,
      lon: -1.405,
    });
    expect(applySnapToVisible(visible!, cache.get("64250001")).snapped).toBeUndefined();
  });
});

describe("parseRawStation cp for snap hints", () => {
  it("feeds ODS cp into the Itxassou hint", () => {
    const raw = parseRawStation({
      id: 64250001,
      geom: { lat: 43.338, lon: -1.405 },
      adresse: "ZA Errobi",
      ville: "Itxassou",
      cp: "64250",
      gazole_prix: 2.219,
      gazole_maj: "2026-09-04T10:24:46+00:00",
    });
    expect(hintFromRaw(raw!)).toMatchObject({
      postcode: "64250",
      city: "Itxassou",
      address: "ZA Errobi",
    });
  });
});
