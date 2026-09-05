export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/** ODS Explore v2.1 refuse limit > 100. */
export const VIEWPORT_LIMIT = 100;

export const VIEWPORT_DEBOUNCE_MS = 400;

/** ~111 km en latitude, ~80 km en longitude à 43° N. */
export const MAX_BBOX_SPAN_DEG = 1;

export function boundsToBbox(bounds: {
  getWest: () => number;
  getSouth: () => number;
  getEast: () => number;
  getNorth: () => number;
}): BBox {
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

/** ODS v2.1 : in_bbox(geom, lat1, lon1, lat2, lon2) — SW puis NE. */
export function bboxToOdsWhere(bbox: BBox): string {
  return `in_bbox(geom,${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
}

export function isBboxTooWide(
  bbox: BBox,
  maxSpanDeg = MAX_BBOX_SPAN_DEG,
): boolean {
  const latSpan = bbox.north - bbox.south;
  const lonSpan = bbox.east - bbox.west;
  return latSpan <= 0 || lonSpan <= 0 || latSpan > maxSpanDeg || lonSpan > maxSpanDeg;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Args) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return wrapped;
}
