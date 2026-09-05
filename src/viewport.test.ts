import { afterEach, describe, expect, it, vi } from "vitest";
import { ODS_RECORDS_URL, stationsQueryUrl } from "./api";
import {
  bboxToOdsWhere,
  boundsToBbox,
  debounce,
  isBboxTooWide,
  MAX_BBOX_SPAN_DEG,
  shouldRefetchOnVisible,
  VIEWPORT_LIMIT,
  VIEWPORT_STALE_MS,
} from "./viewport";

const bayonne: {
  west: number;
  south: number;
  east: number;
  north: number;
} = {
  west: -1.55,
  south: 43.45,
  east: -1.4,
  north: 43.52,
};

describe("bboxToOdsWhere", () => {
  it("uses ODS lat,lon,lat,lon order (SW then NE)", () => {
    expect(bboxToOdsWhere(bayonne)).toBe(
      "in_bbox(geom,43.45,-1.55,43.52,-1.4)",
    );
  });
});

describe("boundsToBbox", () => {
  it("reads Leaflet getBounds() west/south/east/north", () => {
    expect(
      boundsToBbox({
        getWest: () => bayonne.west,
        getSouth: () => bayonne.south,
        getEast: () => bayonne.east,
        getNorth: () => bayonne.north,
      }),
    ).toEqual(bayonne);
  });
});

describe("stationsQueryUrl", () => {
  it("maps a bbox to the ODS records query", () => {
    const url = stationsQueryUrl(bayonne);
    expect(url.origin + url.pathname).toBe(ODS_RECORDS_URL);
    expect(url.searchParams.get("limit")).toBe(String(VIEWPORT_LIMIT));
    expect(url.searchParams.get("where")).toBe(bboxToOdsWhere(bayonne));
  });
});

describe("isBboxTooWide", () => {
  it("allows a city-scale viewport", () => {
    expect(isBboxTooWide(bayonne)).toBe(false);
  });

  it("blocks a viewport wider than 1°", () => {
    expect(
      isBboxTooWide({
        west: -2,
        south: 43,
        east: 0.1,
        north: 44,
      }),
    ).toBe(true);
  });

  it("blocks an inverted or wrapped bbox", () => {
    expect(
      isBboxTooWide({ west: -1.4, south: 43.45, east: -1.55, north: 43.52 }),
    ).toBe(true);
  });

  it("uses the documented span threshold", () => {
    expect(MAX_BBOX_SPAN_DEG).toBe(1);
  });
});

describe("shouldRefetchOnVisible", () => {
  it("does not refetch when no fetch has succeeded", () => {
    expect(shouldRefetchOnVisible(undefined, 10_000)).toBe(false);
  });

  it("does not refetch at or under the stale window", () => {
    expect(shouldRefetchOnVisible(0, VIEWPORT_STALE_MS)).toBe(false);
    expect(shouldRefetchOnVisible(1_000, 1_000 + VIEWPORT_STALE_MS)).toBe(false);
  });

  it("refetches only after more than ~3 min", () => {
    expect(VIEWPORT_STALE_MS).toBe(3 * 60 * 1000);
    expect(shouldRefetchOnVisible(0, VIEWPORT_STALE_MS + 1)).toBe(true);
  });
});

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once after the wait, with the last arguments", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced("a");
    vi.advanceTimersByTime(399);
    debounced("b");
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("cancel prevents a pending call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 400);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
  });
});
