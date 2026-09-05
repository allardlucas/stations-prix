import { describe, expect, it } from "vitest";
import {
  appleMapsUrl,
  geoUrl,
  goLinks,
  googleMapsUrl,
  wazeUrl,
} from "./links";

const lat = 43.483;
const lon = -1.488;

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
});
