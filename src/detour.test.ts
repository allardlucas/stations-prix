import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSO_L100,
  DEFAULT_TANK_L,
  detourGainEur,
  formatGainEur,
  parseFillPrefs,
  referencePrice,
  sanitizeFillPrefs,
  serializeFillPrefs,
} from "./detour";

describe("detourGainEur", () => {
  it("is tank × Δprix when there is no extra distance", () => {
    expect(
      detourGainEur({
        stationPrice: 1.6,
        referencePrice: 1.7,
        detourKm: 0,
        tankL: 50,
        consoL100: 6.5,
      }),
    ).toBeCloseTo(5, 10);
  });

  it("subtracts fuel burned on the detour", () => {
    // 50 × 0.10 − (20 × 6.5/100 × 1.50) = 5 − 1.95
    expect(
      detourGainEur({
        stationPrice: 1.5,
        referencePrice: 1.6,
        detourKm: 20,
        tankL: 50,
        consoL100: 6.5,
      }),
    ).toBeCloseTo(3.05, 8);
  });

  it("is negative when the station is more expensive", () => {
    expect(
      detourGainEur({
        stationPrice: 1.8,
        referencePrice: 1.6,
        detourKm: 5,
        tankL: 50,
        consoL100: 6.5,
      }),
    ).toBeLessThan(0);
  });
});

describe("formatGainEur", () => {
  it("uses a French sign and comma", () => {
    expect(formatGainEur(3.05)).toBe("+3,05 €");
    expect(formatGainEur(-1.2)).toBe("−1,20 €");
    expect(formatGainEur(0)).toBe("0,00 €");
  });
});

describe("parseFillPrefs / serializeFillPrefs", () => {
  it("round-trips sanitized defaults", () => {
    expect(DEFAULT_TANK_L).toBe(50);
    expect(DEFAULT_CONSO_L100).toBe(6.5);
    const json = serializeFillPrefs({ tankL: 45, consoL100: 7 });
    expect(parseFillPrefs(json)).toEqual({ tankL: 45, consoL100: 7 });
  });

  it("falls back to defaults on empty or invalid JSON", () => {
    expect(parseFillPrefs(null)).toEqual({ tankL: 50, consoL100: 6.5 });
    expect(parseFillPrefs("{nope")).toEqual({ tankL: 50, consoL100: 6.5 });
    expect(parseFillPrefs("[]")).toEqual({ tankL: 50, consoL100: 6.5 });
  });

  it("clamps tank and consumption", () => {
    expect(sanitizeFillPrefs({ tankL: 0, consoL100: 0 })).toEqual({
      tankL: 1,
      consoL100: 1,
    });
    expect(sanitizeFillPrefs({ tankL: 999, consoL100: 80 })).toEqual({
      tankL: 200,
      consoL100: 30,
    });
  });
});

describe("referencePrice", () => {
  const origin = { lat: 43.49, lon: -1.47 };
  const nearCheap = {
    id: "near",
    lat: 43.491,
    lon: -1.471,
    priceEur: 1.55,
  };
  const nearHigh = {
    id: "near-high",
    lat: 43.492,
    lon: -1.472,
    priceEur: 1.8,
  };
  const farCheap = {
    id: "far",
    lat: 43.35,
    lon: -1.41,
    priceEur: 1.4,
  };

  it("picks the cheapest other station within 8 km", () => {
    expect(
      referencePrice("here", [nearHigh, nearCheap, farCheap], origin, 8),
    ).toEqual({ price: 1.55, kind: "near" });
  });

  it("uses the viewport mean when this station is already the cheapest nearby", () => {
    const self = { id: "self", lat: 43.49, lon: -1.47, priceEur: 1.4 };
    const ref = referencePrice(
      "self",
      [self, nearCheap, nearHigh, farCheap],
      origin,
      8,
    );
    expect(ref?.kind).toBe("mean");
    expect(ref?.price).toBeCloseTo((1.55 + 1.8 + 1.4) / 3, 10);
  });

  it("falls back to the viewport mean when nothing is near", () => {
    const ref = referencePrice("far", [farCheap, nearCheap, nearHigh], origin, 0.01);
    expect(ref?.kind).toBe("mean");
    expect(ref?.price).toBeCloseTo((1.55 + 1.8) / 2, 10);
  });

  it("returns null when the station is alone", () => {
    expect(referencePrice("far", [farCheap], origin)).toBeNull();
  });
});
