import {
  DEFAULT_FILL_PREFS,
  sanitizeFillPrefs,
  type FillPrefs,
} from "./detour";
import { isFuelMode, type FuelMode } from "./domain";

export const PROFILES_STORAGE_KEY = "stations-prix:profiles";
export const MAX_PROFILES = 5;
export const MAX_PROFILE_NAME = 24;
export const DEFAULT_FUEL_MODE: FuelMode = "sp95_e10";

export type Profile = {
  id: string;
  name: string;
  fuelMode: FuelMode;
  tankL: number;
  consoL100: number;
};

export type ProfilesState = {
  activeId: string;
  profiles: Profile[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

export function suggestedProfileName(existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  for (let n = 1; n <= MAX_PROFILES + 8; n++) {
    const name = `Profil ${n}`;
    if (!taken.has(name.toLowerCase())) {
      return name;
    }
  }
  return "Profil";
}

export function sanitizeProfileName(
  value: unknown,
  fallback: string,
): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (text.length === 0) {
    return fallback;
  }
  return text.slice(0, MAX_PROFILE_NAME);
}

function newProfileId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function profileFill(profile: Pick<Profile, "tankL" | "consoL100">): FillPrefs {
  return sanitizeFillPrefs({
    tankL: profile.tankL,
    consoL100: profile.consoL100,
  });
}

function sanitizeProfile(
  value: unknown,
  fallbackName: string,
  fill: FillPrefs,
): Profile | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) {
    return null;
  }
  const prefs = sanitizeFillPrefs({
    tankL: typeof row.tankL === "number" ? row.tankL : fill.tankL,
    consoL100: typeof row.consoL100 === "number" ? row.consoL100 : fill.consoL100,
  });
  return {
    id,
    name: sanitizeProfileName(row.name, fallbackName),
    fuelMode: isFuelMode(row.fuelMode) ? row.fuelMode : DEFAULT_FUEL_MODE,
    tankL: prefs.tankL,
    consoL100: prefs.consoL100,
  };
}

export function seedProfiles(fill: FillPrefs = DEFAULT_FILL_PREFS): ProfilesState {
  const prefs = sanitizeFillPrefs(fill);
  const profile: Profile = {
    id: "p-default",
    name: suggestedProfileName([]),
    fuelMode: DEFAULT_FUEL_MODE,
    tankL: prefs.tankL,
    consoL100: prefs.consoL100,
  };
  return { activeId: profile.id, profiles: [profile] };
}

function capProfiles(items: Profile[]): Profile[] {
  return items.slice(0, MAX_PROFILES);
}

export function parseProfiles(
  raw: string | null | undefined,
  fill: FillPrefs = DEFAULT_FILL_PREFS,
): ProfilesState {
  const seeded = seedProfiles(fill);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return seeded;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return seeded;
  }
  const root = asRecord(parsed);
  if (!root || !Array.isArray(root.profiles)) {
    return seeded;
  }
  const seen = new Set<string>();
  const profiles: Profile[] = [];
  const names: string[] = [];
  for (const row of root.profiles) {
    const item = sanitizeProfile(
      row,
      suggestedProfileName(names),
      fill,
    );
    if (!item || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    names.push(item.name);
    profiles.push(item);
    if (profiles.length >= MAX_PROFILES) {
      break;
    }
  }
  if (profiles.length === 0) {
    return seeded;
  }
  const activeId =
    typeof root.activeId === "string" && seen.has(root.activeId)
      ? root.activeId
      : profiles[0].id;
  return { activeId, profiles: capProfiles(profiles) };
}

export function serializeProfiles(state: ProfilesState): string {
  const profiles = capProfiles(state.profiles).map((item) => ({
    id: item.id,
    name: item.name,
    fuelMode: item.fuelMode,
    tankL: item.tankL,
    consoL100: item.consoL100,
  }));
  const activeId = profiles.some((item) => item.id === state.activeId)
    ? state.activeId
    : profiles[0]?.id ?? "";
  return JSON.stringify({ activeId, profiles });
}

export function activeProfile(state: ProfilesState): Profile {
  return (
    state.profiles.find((item) => item.id === state.activeId) ??
    state.profiles[0] ??
    seedProfiles().profiles[0]
  );
}

export function switchProfile(state: ProfilesState, id: string): ProfilesState {
  if (!state.profiles.some((item) => item.id === id)) {
    return state;
  }
  return { ...state, activeId: id };
}

export function createProfile(state: ProfilesState): ProfilesState {
  if (state.profiles.length >= MAX_PROFILES) {
    return state;
  }
  const prefs = DEFAULT_FILL_PREFS;
  const profile: Profile = {
    id: newProfileId(),
    name: suggestedProfileName(state.profiles.map((item) => item.name)),
    fuelMode: DEFAULT_FUEL_MODE,
    tankL: prefs.tankL,
    consoL100: prefs.consoL100,
  };
  return {
    activeId: profile.id,
    profiles: [...state.profiles, profile],
  };
}

export function renameProfile(
  state: ProfilesState,
  id: string,
  name: string,
): ProfilesState {
  const current = state.profiles.find((item) => item.id === id);
  if (!current) {
    return state;
  }
  const nextName = sanitizeProfileName(name, current.name);
  return {
    ...state,
    profiles: state.profiles.map((item) =>
      item.id === id ? { ...item, name: nextName } : item,
    ),
  };
}

export function deleteProfile(state: ProfilesState, id: string): ProfilesState {
  if (state.profiles.length <= 1) {
    return state;
  }
  const profiles = state.profiles.filter((item) => item.id !== id);
  if (profiles.length === state.profiles.length) {
    return state;
  }
  const activeId =
    state.activeId === id
      ? profiles[0].id
      : profiles.some((item) => item.id === state.activeId)
        ? state.activeId
        : profiles[0].id;
  return { activeId, profiles };
}

export function updateProfileFuel(
  state: ProfilesState,
  id: string,
  fuelMode: FuelMode,
): ProfilesState {
  if (!isFuelMode(fuelMode)) {
    return state;
  }
  return {
    ...state,
    profiles: state.profiles.map((item) =>
      item.id === id ? { ...item, fuelMode } : item,
    ),
  };
}

export function updateProfileFill(
  state: ProfilesState,
  id: string,
  fill: FillPrefs,
): ProfilesState {
  const prefs = sanitizeFillPrefs(fill);
  return {
    ...state,
    profiles: state.profiles.map((item) =>
      item.id === id
        ? { ...item, tankL: prefs.tankL, consoL100: prefs.consoL100 }
        : item,
    ),
  };
}
