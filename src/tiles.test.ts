import { describe, expect, it } from "vitest";
import {
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_OPTIONS,
  MAP_TILE_URL,
  isForbiddenTileUrl,
} from "./tiles";

describe("MAP_TILE_URL", () => {
  it("uses free Carto Positron light tiles, not Mapbox", () => {
    expect(MAP_TILE_URL).toContain("basemaps.cartocdn.com");
    expect(MAP_TILE_URL).toContain("light_all");
    expect(isForbiddenTileUrl(MAP_TILE_URL)).toBe(false);
    expect(MAP_TILE_URL).not.toMatch(/mapbox/i);
    expect(MAP_TILE_URL).not.toMatch(/satellite/i);
    expect(MAP_TILE_URL).not.toMatch(/dark_all|dark_matter/i);
  });

  it("credits OSM and CARTO", () => {
    expect(MAP_TILE_ATTRIBUTION).toMatch(/OpenStreetMap/);
    expect(MAP_TILE_ATTRIBUTION).toMatch(/CARTO/);
    expect(MAP_TILE_OPTIONS.subdomains).toBe("abcd");
    expect(MAP_TILE_OPTIONS.maxZoom).toBe(20);
  });
});

describe("isForbiddenTileUrl", () => {
  it("rejects paid Mapbox, satellite, and dark basemaps", () => {
    expect(isForbiddenTileUrl("https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}")).toBe(
      true,
    );
    expect(isForbiddenTileUrl("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png")).toBe(
      true,
    );
    expect(isForbiddenTileUrl("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}")).toBe(
      false,
    );
    expect(
      isForbiddenTileUrl(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?layer=satellite",
      ),
    ).toBe(true);
  });
});
