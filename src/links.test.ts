import { describe, expect, it } from "vitest";
import {
  appleMapsUrl,
  geoUrl,
  goLinks,
  googleMapsUrl,
  placeQuery,
  wazeUrl,
} from "./links";

/** Station 64100010 — 22 Chemin d'Arancette, Bayonne (ODS geom). */
const lat = 43.483;
const lon = -1.488;
const address = "22 Chemin d'Arancette";
const city = "Bayonne";
const pin = `${lat},${lon}`;

function expectStationCoords(url: string): void {
  expect(url).toContain(String(lat));
  expect(url).toContain(String(lon));
  expect(url).toContain(pin);
}

function expectCityIsNotDestination(url: string): void {
  expect(url).not.toMatch(/[?&](q|destination|daddr)=Bayonne(?:&|$)/);
  expect(url).not.toMatch(/[?&](q|destination|daddr)=Bayonne%/);
}

describe("placeQuery", () => {
  it("joins adresse + ville and never returns a city alone", () => {
    expect(placeQuery(address, city)).toBe("22 Chemin d'Arancette, Bayonne");
    expect(placeQuery(address, "")).toBe(address);
    expect(placeQuery("", city)).toBe("");
    expect(placeQuery("  ", "Bayonne")).toBe("");
    expect(placeQuery("", "")).toBe("");
  });
});

describe("deep link builders", () => {
  it("builds a geo: URI", () => {
    expect(geoUrl(lat, lon)).toBe("geo:43.483,-1.488?q=43.483,-1.488");
  });

  it("builds Waze navigate-yes", () => {
    expect(wazeUrl(lat, lon)).toBe(
      "https://www.waze.com/ul?ll=43.483,-1.488&navigate=yes",
    );
  });

  it("builds Google Maps destination", () => {
    expect(googleMapsUrl(lat, lon)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=43.483,-1.488",
    );
  });

  it("builds Apple Plans daddr", () => {
    expect(appleMapsUrl(lat, lon)).toBe(
      "https://maps.apple.com/?daddr=43.483,-1.488&dirflg=d",
    );
  });

  it("lists Y aller + the three map apps", () => {
    expect(goLinks(lat, lon).map((link) => link.label)).toEqual([
      "Y aller",
      "Waze",
      "Google Maps",
      "Apple Plans",
    ]);
    expect(goLinks(lat, lon).map((link) => link.href)).toEqual([
      geoUrl(lat, lon),
      wazeUrl(lat, lon),
      googleMapsUrl(lat, lon),
      appleMapsUrl(lat, lon),
    ]);
  });

  it("puts station coords in every deep link", () => {
    for (const link of goLinks(lat, lon, address, city)) {
      expectStationCoords(link.href);
    }
    expectStationCoords(geoUrl(lat, lon, placeQuery(address, city)));
    expectStationCoords(wazeUrl(lat, lon, placeQuery(address, city)));
    expectStationCoords(googleMapsUrl(lat, lon));
    expectStationCoords(appleMapsUrl(lat, lon));
  });

  it("uses adresse + ville as query text, not the city alone", () => {
    const query = placeQuery(address, city);
    const geo = geoUrl(lat, lon, query);
    const waze = wazeUrl(lat, lon, query);

    expect(geo).toBe(
      "geo:43.483,-1.488?q=43.483,-1.488(22 Chemin d'Arancette, Bayonne)",
    );
    expect(waze).toBe(
      "https://www.waze.com/ul?ll=43.483,-1.488&navigate=yes&q=22%20Chemin%20d'Arancette%2C%20Bayonne",
    );

    const hrefs = goLinks(lat, lon, address, city).map((link) => link.href);
    expect(hrefs[0]).toBe(geo);
    expect(hrefs[1]).toBe(waze);
    expect(hrefs[2]).toBe(googleMapsUrl(lat, lon));
    expect(hrefs[3]).toBe(appleMapsUrl(lat, lon));
    expect(hrefs.some((href) => href.includes("Chemin"))).toBe(true);
    for (const href of hrefs) {
      expectCityIsNotDestination(href);
    }
  });

  it("does not use a city alone as the destination", () => {
    const cityOnly = goLinks(lat, lon, "", city);
    const coordsOnly = goLinks(lat, lon);
    expect(cityOnly.map((link) => link.href)).toEqual(
      coordsOnly.map((link) => link.href),
    );
    for (const link of cityOnly) {
      expectStationCoords(link.href);
      expectCityIsNotDestination(link.href);
      expect(link.href).not.toContain("Bayonne");
    }
  });
});
