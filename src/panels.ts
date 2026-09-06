export type PanelId = "params" | "ranking";

export type PanelsState = Record<PanelId, boolean>;

export const DEFAULT_PANELS: PanelsState = {
  params: false,
  ranking: false,
};

export function togglePanel(state: PanelsState, id: PanelId): PanelsState {
  return { ...state, [id]: !state[id] };
}

export function isPanelOpen(state: PanelsState, id: PanelId): boolean {
  return state[id];
}

export function rankingVisible(
  state: PanelsState,
  itemCount: number,
): boolean {
  return state.ranking && itemCount > 0;
}
