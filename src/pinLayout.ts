import { PIN_ICON_ANCHOR, PIN_ICON_SIZE } from "./pin";

export type PixelPin = {
  id: string;
  /** Pixel x of the geographic point (icon anchor = centre-bas). */
  x: number;
  /** Pixel y of the geographic point (icon anchor = centre-bas). */
  y: number;
  /** Plus petit = plus prioritaire (reste au plus près du point vrai). */
  rank: number;
  /** Largeur Leaflet ; défaut = pin solo 120. */
  width?: number;
  /** Hauteur Leaflet ; défaut = pin solo 40. */
  height?: number;
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

export type PinSize = {
  width: number;
  height: number;
};

/** Marge entre deux pastilles style A après offset. */
export const PIN_LAYOUT_GAP = 4;

export const PIN_SLOT_X = PIN_ICON_SIZE[0] + PIN_LAYOUT_GAP;
export const PIN_SLOT_Y = PIN_ICON_SIZE[1] + PIN_LAYOUT_GAP;

/** Au-delà de 2 largeurs de pin, on masque plutôt que d’envoyer le pin hors carte. */
export const PIN_LAYOUT_MAX_SHIFT = PIN_SLOT_X * 2;

export function pinSizeOf(pin: Pick<PixelPin, "width" | "height">): PinSize {
  return {
    width: pin.width ?? PIN_ICON_SIZE[0],
    height: pin.height ?? PIN_ICON_SIZE[1],
  };
}

export function pinBox(
  x: number,
  y: number,
  dx = 0,
  dy = 0,
  size?: PinSize,
): PinBox {
  const width = size?.width ?? PIN_ICON_SIZE[0];
  const height = size?.height ?? PIN_ICON_SIZE[1];
  const anchorX = size ? width / 2 : PIN_ICON_ANCHOR[0];
  const anchorY = size ? height : PIN_ICON_ANCHOR[1];
  const ax = x + dx;
  const ay = y + dy;
  return {
    left: ax - anchorX,
    top: ay - anchorY,
    right: ax + (width - anchorX),
    bottom: ay + (height - anchorY),
  };
}

function boxFor(pin: PixelPin, dx = 0, dy = 0): PinBox {
  return pinBox(pin.x, pin.y, dx, dy, pinSizeOf(pin));
}

function maxShift2(pin: PixelPin): number {
  const max = (pinSizeOf(pin).width + PIN_LAYOUT_GAP) * 2;
  return max * max;
}

export function boxesOverlap(a: PinBox, b: PinBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function shiftLen2(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

/** Plus petit décalage cardinal pour que `mover` ne recouvre plus `blocker`. */
export function minSeparation(mover: PinBox, blocker: PinBox): { dx: number; dy: number } {
  const options = [
    { dx: 0, dy: -(mover.bottom - blocker.top + PIN_LAYOUT_GAP) },
    { dx: blocker.right - mover.left + PIN_LAYOUT_GAP, dy: 0 },
    { dx: -(mover.right - blocker.left + PIN_LAYOUT_GAP), dy: 0 },
    { dx: 0, dy: blocker.bottom - mover.top + PIN_LAYOUT_GAP },
  ];
  options.sort((a, b) => shiftLen2(a.dx, a.dy) - shiftLen2(b.dx, b.dy));
  return options[0];
}

/**
 * Décale les pins dont les bbox se chevauchent (120×40 solo, 152×56 dual).
 * Rang bas (prix / focus) garde (0,0) si possible.
 * Offset = plus petite séparation cardinale (spiderfy léger).
 * Décalage trop grand → hidden (tas trop dense).
 */
export function layoutPins(pins: readonly PixelPin[]): PinPlacement[] {
  const ordered = [...pins].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const placed: { pin: PixelPin; dx: number; dy: number }[] = [];
  const byId = new Map<string, PinPlacement>();

  for (const pin of ordered) {
    let dx = 0;
    let dy = 0;
    let hidden = false;
    const cap2 = maxShift2(pin);

    for (let step = 0; step < 12; step++) {
      const box = boxFor(pin, dx, dy);
      const hit = placed.find((other) =>
        boxesOverlap(box, boxFor(other.pin, other.dx, other.dy)),
      );
      if (!hit) {
        break;
      }
      const nudge = minSeparation(box, boxFor(hit.pin, hit.dx, hit.dy));
      dx += nudge.dx;
      dy += nudge.dy;
      if (shiftLen2(dx, dy) > cap2) {
        hidden = true;
        dx = 0;
        dy = 0;
        break;
      }
    }

    if (
      !hidden &&
      placed.some((other) =>
        boxesOverlap(boxFor(pin, dx, dy), boxFor(other.pin, other.dx, other.dy)),
      )
    ) {
      hidden = true;
      dx = 0;
      dy = 0;
    }

    if (!hidden) {
      placed.push({ pin, dx, dy });
    }
    byId.set(pin.id, { id: pin.id, dx, dy, hidden });
  }

  return pins.map((pin) => byId.get(pin.id)!);
}
