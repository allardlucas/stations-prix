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

const MONOGRAMS = ["TE", "IM", ">L<", ">C<", "Es", "Sh", "Av", "Ca", "Li", "Al", "Dy", "É", ">S<"];

describe("brandMark", () => {
  it("gives a logo (or pump fallback) for every known enseigne plus Autre", () => {
    for (const key of BRAND_KEYS) {
      const mark = brandMark(key);
      expect(mark.kind).toBe("logo");
      expect(mark.fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(brandMark(OTHER_BRAND).kind).toBe("pump");
    expect(brandMark("Inconnue").kind).toBe("pump");
    expect(brandMark("Inconnue").fill).toBe(brandMark(OTHER_BRAND).fill);
  });

  it("covers the whole FR dictionary", () => {
    expect(knownBrandMarks()).toEqual(expect.arrayContaining([...BRAND_KEYS, OTHER_BRAND]));
  });
});

describe("brandMarkSvg", () => {
  it("inlines a local logo SVG, not a monogram or a remote asset", () => {
    const svg = brandMarkSvg("TotalEnergies");
    expect(svg).toContain("<svg");
    expect(svg).toContain('class="pin-mark"');
    expect(svg).toContain("#E30613");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("TE");
    expect(svg).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/wikimedia|brandfetch|clearbit/i);
  });

  it("uses a generic pump for Autre / unknown, without random letters", () => {
    const svg = brandMarkSvg(OTHER_BRAND);
    expect(svg).toBe(brandMarkSvg("Inconnue"));
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain(">S<");
  });

  it("never falls back to letter pastilles for dictionary brands", () => {
    for (const key of BRAND_KEYS) {
      const svg = brandMarkSvg(key);
      expect(svg, key).toContain("<svg");
      expect(svg, key).not.toContain("<text");
      for (const letters of MONOGRAMS) {
        expect(svg, `${key} ${letters}`).not.toContain(letters);
      }
    }
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
    expect(html).toContain('class="pin"');
    expect(html).toContain('data-freshness="full"');
    expect(html).toContain('data-brand="Intermarché"');
    expect(html).toContain('class="pin-mark"');
    expect(html).toContain("#2E7D32");
    expect(html).not.toContain("IM");
    expect(html).not.toContain("<text");
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
    expect(html).not.toContain("<text");
  });

  it("escapes untrusted pin text", () => {
    const html = pinHtml({
      brandKey: OTHER_BRAND,
      fuel: "sp95",
      price: "<img src=x>",
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
