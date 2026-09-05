import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_KM, formatDistanceKm, haversineKm } from "./geo";

describe("haversineKm", () => {
  it("is 0 for the same point", () => {
    expect(haversineKm({ lat: 43.49, lon: -1.47 }, { lat: 43.49, lon: -1.47 })).toBe(
      0,
    );
  });

  it("is about 111.2 km for 1° of latitude at the equator", () => {
    const km = haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(km).toBeCloseTo((EARTH_RADIUS_KM * Math.PI) / 180, 5);
  });

  it("is symmetric", () => {
    const a = { lat: 43.483, lon: -1.488 };
    const b = { lat: 43.49, lon: -1.47 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("matches a known Bayonne–Biarritz distance (~7.5 km)", () => {
    const km = haversineKm(
      { lat: 43.492, lon: -1.475 },
      { lat: 43.483, lon: -1.559 },
    );
    expect(km).toBeGreaterThan(6.5);
    expect(km).toBeLessThan(8.5);
  });
});

describe("formatDistanceKm", () => {
  it("uses one decimal and a French comma", () => {
    expect(formatDistanceKm(0)).toBe("0,0 km");
    expect(formatDistanceKm(1.24)).toBe("1,2 km");
    expect(formatDistanceKm(1.25)).toBe("1,3 km");
    expect(formatDistanceKm(14)).toBe("14,0 km");
  });
});
