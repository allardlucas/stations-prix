import { describe, expect, it } from "vitest";
import {
  MAX_FAVORITES,
  addFavorite,
  favoriteChipLabel,
  favoriteFromStation,
  isFavorite,
  parseFavorites,
  removeFavorite,
  serializeFavorites,
  type Favorite,
} from "./favorites";

const bidart: Favorite = {
  id: "64210005",
  lat: 43.42214,
  lon: -1.5976,
  address: "AUTOROUTE A63 - AIRE DE BIDART EST",
  city: "Bidart",
  brand: "",
};

const arancette: Favorite = {
  id: "64100010",
  lat: 43.483,
  lon: -1.488,
  address: "22 Chemin d'Arancette",
  city: "Bayonne",
  brand: "",
};

describe("parseFavorites / serializeFavorites", () => {
  it("round-trips a valid list", () => {
    const json = serializeFavorites([bidart, arancette]);
    expect(parseFavorites(json)).toEqual([bidart, arancette]);
  });

  it("returns [] for empty, invalid, or non-array JSON", () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites("")).toEqual([]);
    expect(parseFavorites("{not-json")).toEqual([]);
    expect(parseFavorites("{}")).toEqual([]);
    expect(parseFavorites("null")).toEqual([]);
  });

  it("drops rows without id or finite coords, and duplicates", () => {
    expect(
      parseFavorites(
        JSON.stringify([
          { id: "", lat: 1, lon: 2 },
          { id: "x", lat: "43", lon: -1 },
          bidart,
          { ...bidart, city: "Other" },
          arancette,
        ]),
      ),
    ).toEqual([bidart, arancette]);
  });

  it("caps at MAX_FAVORITES = 8", () => {
    expect(MAX_FAVORITES).toBe(8);
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...bidart,
      id: String(i),
    }));
    expect(parseFavorites(serializeFavorites(many))).toHaveLength(8);
    expect(parseFavorites(JSON.stringify(many))).toHaveLength(8);
  });
});

describe("addFavorite / removeFavorite", () => {
  it("adds in front and moves an existing id back to front", () => {
    const once = addFavorite([arancette], bidart);
    expect(once.map((row) => row.id)).toEqual(["64210005", "64100010"]);
    expect(addFavorite(once, arancette).map((row) => row.id)).toEqual([
      "64100010",
      "64210005",
    ]);
  });

  it("drops the oldest when over the max", () => {
    const full = Array.from({ length: 8 }, (_, i) => ({
      ...arancette,
      id: `old-${i}`,
    }));
    const next = addFavorite(full, bidart);
    expect(next).toHaveLength(8);
    expect(next[0]).toEqual(bidart);
    expect(next.some((row) => row.id === "old-7")).toBe(false);
  });

  it("ignores an incomplete favorite", () => {
    expect(addFavorite([arancette], { ...bidart, id: "" })).toEqual([arancette]);
  });

  it("removes by id", () => {
    expect(removeFavorite([bidart, arancette], "64210005")).toEqual([arancette]);
    expect(removeFavorite([arancette], "missing")).toEqual([arancette]);
  });

  it("reports membership", () => {
    expect(isFavorite([bidart], "64210005")).toBe(true);
    expect(isFavorite([bidart], "64100010")).toBe(false);
  });
});

describe("favoriteFromStation / chip label", () => {
  it("copies the station fields used in storage", () => {
    expect(favoriteFromStation(bidart)).toEqual(bidart);
  });

  it("prefers brand, then city, then address", () => {
    expect(favoriteChipLabel({ ...bidart, brand: "TotalEnergies" })).toBe(
      "TotalEnergies",
    );
    expect(favoriteChipLabel(bidart)).toBe("Bidart");
    expect(favoriteChipLabel({ ...bidart, city: "" })).toBe(
      "AUTOROUTE A63 - AIRE DE BIDART EST",
    );
  });
});
