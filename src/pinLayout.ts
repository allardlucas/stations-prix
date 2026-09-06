import { PIN_ICON_ANCHOR, PIN_ICON_SIZE } from "./pin";

export type PixelPin = {
  id: string;
  /** Pixel x of the geographic point (icon anchor = centre-bas). */
  x: number;
  /** Pixel y of the geographic point (icon anchor = centre-bas). */
  y: number;
  /** Plus petit = plus prioritaire (reste au plus près du point vrai). */
  rank: number;
};

export type PinPlacement = {
  id: string;
  dx: number;
  dy: number;
  hidden: boolean;
};

export type PinBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Marge entre deux pastilles style A après offset. */
export const PIN_LAYOUT_GAP = 4;

export const PIN_SLOT_X = PIN_ICON_SIZE[0] + PIN_LAYOUT_GAP;
export const PIN_SLOT_Y = PIN_ICON_SIZE[1] + PIN_LAYOUT_GAP;

/** (0,0) + 2 anneaux : assez pour un tas ville, trop loin = hide. */
export const PIN_LAYOUT_MAX_RING = 2;

export function pinBox(x: number, y: number, dx = 0, dy = 0): PinBox {
  const ax = x + dx;
  const ay = y + dy;
  return {
    left: ax - PIN_ICON_ANCHOR[0],
    top: ay - PIN_ICON_ANCHOR[1],
    right: ax + (PIN_ICON_SIZE[0] - PIN_ICON_ANCHOR[0]),
    bottom: ay + (PIN_ICON_SIZE[1] - PIN_ICON_ANCHOR[1]),
  };
}

export function boxesOverlap(a: PinBox, b: PinBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function ringPriority(ix: number, iy: number): number {
  if (iy === 0 && ix > 0) {
    return 0;
  }
  if (iy === 0 && ix < 0) {
    return 1;
  }
  if (ix === 0 && iy < 0) {
    return 2;
  }
  if (iy < 0) {
    return 3;
  }
  if (ix === 0 && iy > 0) {
    return 4;
  }
  return 5;
}

/** Slots en spirale compacte : E, W, N d'abord (au-dessus du point). */
export function spiralSlots(maxRing = PIN_LAYOUT_MAX_RING): { dx: number; dy: number }[] {
  const slots = [{ dx: 0, dy: 0 }];
  for (let ring = 1; ring <= maxRing; ring++) {
    const cells: { ix: number; iy: number; pri: number }[] = [];
    for (let ix = -ring; ix <= ring; ix++) {
      for (let iy = -ring; iy <= ring; iy++) {
        if (Math.max(Math.abs(ix), Math.abs(iy)) !== ring) {
          continue;
        }
        cells.push({ ix, iy, pri: ringPriority(ix, iy) });
      }
    }
    cells.sort((a, b) => a.pri - b.pri || a.iy - b.iy || a.ix - b.ix);
    for (const cell of cells) {
      slots.push({ dx: cell.ix * PIN_SLOT_X, dy: cell.iy * PIN_SLOT_Y });
    }
  }
  return slots;
}

/**
 * Décale les pins dont les bbox 120×40 se chevauchent.
 * Rang bas (prix / focus) garde (0,0) si possible.
 * Plus de slot dans 2 anneaux → hidden (tas trop dense).
 */
export function layoutPins(pins: readonly PixelPin[]): PinPlacement[] {
  const ordered = [...pins].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const slots = spiralSlots();
  const placed: { pin: PixelPin; dx: number; dy: number }[] = [];
  const byId = new Map<string, PinPlacement>();

  for (const pin of ordered) {
    let chosen: { dx: number; dy: number } | undefined;
    for (const slot of slots) {
      const box = pinBox(pin.x, pin.y, slot.dx, slot.dy);
      const hits = placed.some((other) =>
        boxesOverlap(box, pinBox(other.pin.x, other.pin.y, other.dx, other.dy)),
      );
      if (!hits) {
        chosen = slot;
        break;
      }
    }
    if (chosen) {
      placed.push({ pin, dx: chosen.dx, dy: chosen.dy });
      byId.set(pin.id, {
        id: pin.id,
        dx: chosen.dx,
        dy: chosen.dy,
        hidden: false,
      });
    } else {
      byId.set(pin.id, { id: pin.id, dx: 0, dy: 0, hidden: true });
    }
  }

  return pins.map((pin) => byId.get(pin.id)!);
}
