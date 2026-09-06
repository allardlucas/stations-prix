import { describe, expect, it } from "vitest";
import { PIN_ICON_ANCHOR, PIN_ICON_SIZE } from "./pin";
import {
  PIN_LAYOUT_MAX_RING,
  PIN_SLOT_X,
  PIN_SLOT_Y,
  boxesOverlap,
  layoutPins,
  pinBox,
  spiralSlots,
  type PixelPin,
} from "./pinLayout";

function pin(id: string, x: number, y: number, rank = 0): PixelPin {
  return { id, x, y, rank };
}

function placedBox(p: PixelPin, dx: number, dy: number) {
  return pinBox(p.x, p.y, dx, dy);
}

describe("pinBox", () => {
  it("is 120×40 anchored at centre-bas", () => {
    const box = pinBox(200, 300);
    expect(PIN_ICON_SIZE).toEqual([120, 40]);
    expect(PIN_ICON_ANCHOR).toEqual([60, 40]);
    expect(box.left).toBe(140);
    expect(box.right).toBe(260);
    expect(box.top).toBe(260);
    expect(box.bottom).toBe(300);
    expect(box.right - box.left).toBe(120);
    expect(box.bottom - box.top).toBe(40);
  });

  it("shifts with dx/dy", () => {
    const box = pinBox(0, 0, 10, -20);
    expect(box.left).toBe(-50);
    expect(box.top).toBe(-60);
  });
});

describe("boxesOverlap", () => {
  it("detects stacked style-A pins at the same point", () => {
    const a = pinBox(100, 100);
    const b = pinBox(100, 100);
    expect(boxesOverlap(a, b)).toBe(true);
  });

  it("detects a near miss that still covers the chip", () => {
    const a = pinBox(0, 0);
    const b = pinBox(80, 10);
    expect(boxesOverlap(a, b)).toBe(true);
  });

  it("allows touching edges and far-apart pins", () => {
    const a = pinBox(0, 0);
    expect(boxesOverlap(a, pinBox(120, 0))).toBe(false);
    expect(boxesOverlap(a, pinBox(0, 40))).toBe(false);
    expect(boxesOverlap(a, pinBox(400, 400))).toBe(false);
  });
});

describe("spiralSlots", () => {
  it("starts at origin then prefers E / W / N", () => {
    const slots = spiralSlots(1);
    expect(slots[0]).toEqual({ dx: 0, dy: 0 });
    expect(slots[1]).toEqual({ dx: PIN_SLOT_X, dy: 0 });
    expect(slots[2]).toEqual({ dx: -PIN_SLOT_X, dy: 0 });
    expect(slots[3]).toEqual({ dx: 0, dy: -PIN_SLOT_Y });
  });
});

describe("layoutPins", () => {
  it("leaves isolated pins on their geographic point", () => {
    const pins = [pin("a", 0, 0, 0), pin("b", 400, 400, 1)];
    expect(layoutPins(pins)).toEqual([
      { id: "a", dx: 0, dy: 0, hidden: false },
      { id: "b", dx: 0, dy: 0, hidden: false },
    ]);
  });

  it("offsets a cheaper-losing pair so both 120×40 boxes stay readable", () => {
    const cheap = pin("cheap", 50, 80, 0);
    const dear = pin("dear", 50, 80, 1);
    const [a, b] = layoutPins([cheap, dear]);
    expect(a).toEqual({ id: "cheap", dx: 0, dy: 0, hidden: false });
    expect(b.hidden).toBe(false);
    expect(b.dx !== 0 || b.dy !== 0).toBe(true);
    expect(boxesOverlap(placedBox(cheap, a.dx, a.dy), placedBox(dear, b.dx, b.dy))).toBe(
      false,
    );
  });

  it("nudges a slightly overlapping neighbour instead of stacking", () => {
    const a = pin("west", 0, 0, 0);
    const b = pin("east", 70, 0, 1);
    const laid = layoutPins([a, b]);
    expect(laid[0]).toMatchObject({ id: "west", dx: 0, dy: 0, hidden: false });
    expect(laid[1].hidden).toBe(false);
    expect(
      boxesOverlap(placedBox(a, laid[0].dx, laid[0].dy), placedBox(b, laid[1].dx, laid[1].dy)),
    ).toBe(false);
  });

  it("keeps the focused pin (lowest rank) at the true point", () => {
    const laid = layoutPins([pin("other", 0, 0, 5), pin("focus", 0, 0, -1)]);
    const focus = laid.find((item) => item.id === "focus");
    expect(focus).toEqual({ id: "focus", dx: 0, dy: 0, hidden: false });
  });

  it("hides extras when the same-point pile exceeds the spiral", () => {
    const slots = spiralSlots(PIN_LAYOUT_MAX_RING);
    const pins = slots.map((_, i) => pin(`p${i}`, 0, 0, i));
    pins.push(pin("overflow", 0, 0, slots.length));
    const laid = layoutPins(pins);
    const hidden = laid.filter((item) => item.hidden);
    expect(hidden.map((item) => item.id)).toEqual(["overflow"]);
    const visible = laid.filter((item) => !item.hidden);
    expect(visible).toHaveLength(slots.length);
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const left = pins.find((p) => p.id === visible[i].id)!;
        const right = pins.find((p) => p.id === visible[j].id)!;
        expect(
          boxesOverlap(
            placedBox(left, visible[i].dx, visible[i].dy),
            placedBox(right, visible[j].dx, visible[j].dy),
          ),
        ).toBe(false);
      }
    }
  });

  it("preserves input order in the result", () => {
    const pins = [pin("z", 0, 0, 2), pin("a", 0, 0, 0), pin("m", 0, 0, 1)];
    expect(layoutPins(pins).map((item) => item.id)).toEqual(["z", "a", "m"]);
  });
});
