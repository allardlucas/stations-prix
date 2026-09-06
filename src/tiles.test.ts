import { describe, expect, it } from "vitest";
import {
  MAP_STYLE_URL,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_OPTIONS,
  isForbiddenTileUrl,
} from "./tiles";

describe("MAP_STYLE_URL", () => {
  it("uses free OpenFreeMap Bright, not Carto, Mapbox, or OSM France raster", () => {
    expect(MAP_STYLE_URL).toBe("https://tiles.openfreemap.org/styles/bright");
    expect(isForbiddenTileUrl(MAP_STYLE_URL)).toBe(false);
    expect(MAP_STYLE_URL).not.toMatch(/carto|basemaps\.cartocdn/i);
    expect(MAP_STYLE_URL).not.toMatch(/mapbox/i);
    expect(MAP_STYLE_URL).not.toMatch(/satellite/i);
    expect(MAP_STYLE_URL).not.toMatch(/dark_all|dark_matter|styles\/dark|styles\/fiord/i);
    expect(MAP_STYLE_URL).not.toMatch(/tile\.openstreetmap\.fr\/osmfr/i);
  });

  it("credits OpenFreeMap, OpenMapTiles, and OSM", () => {
    expect(MAP_TILE_ATTRIBUTION).toMatch(/OpenStreetMap/);
    expect(MAP_TILE_ATTRIBUTION).toMatch(/OpenFreeMap/);
    expect(MAP_TILE_ATTRIBUTION).toMatch(/OpenMapTiles/);
    expect(MAP_TILE_ATTRIBUTION).not.toMatch(/CARTO/i);
    expect(MAP_TILE_ATTRIBUTION).not.toMatch(/Mapbox/i);
    expect(MAP_TILE_OPTIONS.style).toBe(MAP_STYLE_URL);
    expect(MAP_TILE_OPTIONS.attributionControl.customAttribution).toBe(
      MAP_TILE_ATTRIBUTION,
    );
  });
});

describe("isForbiddenTileUrl", () => {
  it("rejects paid Mapbox, satellite, dark, Carto, and OSM France raster", () => {
    expect(isForbiddenTileUrl("https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}")).toBe(
      true,
    );
    expect(isForbiddenTileUrl("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png")).toBe(
      true,
    );
    expect(isForbiddenTileUrl("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png")).toBe(
      true,
    );
    expect(isForbiddenTileUrl("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png")).toBe(
      true,
    );
    expect(isForbiddenTileUrl("https://tiles.openfreemap.org/styles/dark")).toBe(true);
    expect(isForbiddenTileUrl("https://tiles.openfreemap.org/styles/fiord")).toBe(true);
    expect(isForbiddenTileUrl("https://tiles.openfreemap.org/styles/bright")).toBe(false);
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
