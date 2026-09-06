import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANELS,
  isPanelOpen,
  rankingVisible,
  togglePanel,
} from "./panels";

describe("DEFAULT_PANELS", () => {
  it("starts with both panels closed", () => {
    expect(DEFAULT_PANELS).toEqual({ params: false, ranking: false });
  });
});

describe("togglePanel", () => {
  it("opens a closed panel without touching the other", () => {
    const next = togglePanel(DEFAULT_PANELS, "params");
    expect(next).toEqual({ params: true, ranking: false });
    expect(DEFAULT_PANELS).toEqual({ params: false, ranking: false });
  });

  it("closes an open panel", () => {
    expect(togglePanel({ params: true, ranking: true }, "ranking")).toEqual({
      params: true,
      ranking: false,
    });
  });
});

describe("isPanelOpen", () => {
  it("reads the requested panel", () => {
    expect(isPanelOpen(DEFAULT_PANELS, "params")).toBe(false);
    expect(isPanelOpen({ params: true, ranking: false }, "params")).toBe(true);
  });
});

describe("rankingVisible", () => {
  it("is hidden while the panel is closed, even with items", () => {
    expect(rankingVisible(DEFAULT_PANELS, 5)).toBe(false);
  });

  it("is hidden when open but empty", () => {
    expect(rankingVisible({ params: false, ranking: true }, 0)).toBe(false);
  });

  it("is shown when open and the list has items", () => {
    expect(rankingVisible({ params: false, ranking: true }, 3)).toBe(true);
  });
});
