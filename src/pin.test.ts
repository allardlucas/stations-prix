import { describe, expect, it } from "vitest";
import { BRAND_KEYS, OTHER_BRAND } from "./brand";
import { FRESHNESS_OPACITY } from "./domain";
import {
  PIN_ICON_ANCHOR,
  PIN_ICON_SIZE,
  brandMark,
  brandMarkSvg,
  knownBrandMarks,
  pinHtml,
} from "./pin";

describe("brandMark", () => {
  it("gives a monogram pastille for every known enseigne plus Autre", () => {
    for (const key of BRAND_KEYS) {
      const mark = brandMark(key);
      expect(mark.letters.length).toBeGreaterThan(0);
      expect(mark.letters.length).toBeLessThanOrEqual(2);
      expect(mark.fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(brandMark(OTHER_BRAND).letters).toBe("S");
    expect(brandMark("Inconnue").letters).toBe(brandMark(OTHER_BRAND).letters);
  });

  it("covers the whole FR dictionary", () => {
    expect(knownBrandMarks()).toEqual(expect.arrayContaining([...BRAND_KEYS, OTHER_BRAND]));
  });
});

describe("brandMarkSvg", () => {
  it("is an inline SVG pastille, not a scraped official logo", () => {
    const svg = brandMarkSvg("TotalEnergies");
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
    expect(svg).toContain("TE");
    expect(svg).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/wikimedia|brandfetch|clearbit|\.png|\.svg/i);
  });
});

describe("pinHtml", () => {
  it("shows logo + fuel + price + age with freshness opacity", () => {
    const html = pinHtml({
      brandKey: "Intermarché",
      fuel: "gazole",
      price: "1,749 €",
      age: "12 min",
      freshness: "full",
    });
    expect(html).toContain("class=\"pin\"");
    expect(html).toContain("data-freshness=\"full\"");
    expect(html).toContain("data-brand=\"Intermarché\"");
    expect(html).toContain("IM");
    expect(html).toContain("Gazole");
    expect(html).toContain("1,749 €");
    expect(html).toContain("12 min");
    expect(html).toContain(`opacity:${FRESHNESS_OPACITY.full}`);
    expect(html).not.toContain("is-on");
  });

  it("marks the focused pin and pales stale prices", () => {
    const html = pinHtml({
      brandKey: OTHER_BRAND,
      fuel: "e10",
      price: "1,654 €",
      age: "4 j",
      freshness: "faint",
      selected: true,
    });
    expect(html).toContain("pin is-on");
    expect(html).toContain("E10");
    expect(html).toContain(`opacity:${FRESHNESS_OPACITY.faint}`);
  });

  it("escapes untrusted pin text", () => {
    const html = pinHtml({
      brandKey: OTHER_BRAND,
      fuel: "sp95",
      price: '<img src=x>',
      age: '1" onclick=alert(1)',
      freshness: "mid",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).toContain("1&quot; onclick=alert(1)");
    expect(html).not.toContain('age">1"');
  });

  it("sizes the Leaflet icon for the style A chip", () => {
    expect(PIN_ICON_SIZE).toEqual([120, 40]);
    expect(PIN_ICON_ANCHOR).toEqual([60, 40]);
  });
});
