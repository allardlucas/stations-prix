import { describe, expect, it } from "vitest";
import { DEFAULT_FILL_PREFS } from "./detour";
import {
  DEFAULT_FUEL_MODE,
  MAX_PROFILES,
  activeProfile,
  createProfile,
  deleteProfile,
  parseProfiles,
  renameProfile,
  seedProfiles,
  serializeProfiles,
  suggestedProfileName,
  switchProfile,
  updateProfileFill,
  updateProfileFuel,
} from "./profiles";

describe("seedProfiles", () => {
  it("starts with one unnamed-by-user profile on SP95/E10", () => {
    const state = seedProfiles();
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]?.name).toBe("Profil 1");
    expect(state.profiles[0]?.fuelMode).toBe(DEFAULT_FUEL_MODE);
    expect(DEFAULT_FUEL_MODE).toBe("sp95_e10");
    expect(state.activeId).toBe(state.profiles[0]?.id);
    expect(JSON.stringify(state).toLowerCase()).not.toContain("lucas");
    expect(JSON.stringify(state).toLowerCase()).not.toContain("copine");
  });

  it("reuses existing plein / conso from localStorage fill prefs", () => {
    const state = seedProfiles({ tankL: 42, consoL100: 5.5 });
    expect(state.profiles[0]).toMatchObject({ tankL: 42, consoL100: 5.5 });
  });
});

describe("suggestedProfileName", () => {
  it("increments Profil N without hardcoded people names", () => {
    expect(suggestedProfileName([])).toBe("Profil 1");
    expect(suggestedProfileName(["Profil 1", "Profil 2"])).toBe("Profil 3");
    expect(suggestedProfileName(["Voiture", "Profil 1"])).toBe("Profil 2");
  });
});

describe("parseProfiles / serializeProfiles", () => {
  it("round-trips active id, names, fuel, and fill", () => {
    let state = seedProfiles();
    state = createProfile(state);
    state = renameProfile(state, state.activeId, "Week-end");
    state = updateProfileFuel(state, state.activeId, "gazole");
    state = updateProfileFill(state, state.activeId, { tankL: 40, consoL100: 8 });
    const json = serializeProfiles(state);
    expect(parseProfiles(json)).toEqual(state);
  });

  it("seeds from fill prefs when storage is empty or invalid", () => {
    const fill = { tankL: 55, consoL100: 6 };
    expect(parseProfiles(null, fill)).toEqual(seedProfiles(fill));
    expect(parseProfiles("{nope", fill)).toEqual(seedProfiles(fill));
    expect(parseProfiles("[]", fill)).toEqual(seedProfiles(fill));
  });

  it("caps at MAX_PROFILES = 5 and restores last used id", () => {
    expect(MAX_PROFILES).toBe(5);
    const profiles = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      name: `Profil ${i + 1}`,
      fuelMode: "gazole",
      tankL: 50,
      consoL100: 6.5,
    }));
    const parsed = parseProfiles(
      JSON.stringify({ activeId: "p2", profiles }),
    );
    expect(parsed.profiles).toHaveLength(5);
    expect(parsed.activeId).toBe("p2");
  });

  it("falls back to the first profile if last used id is unknown", () => {
    const parsed = parseProfiles(
      JSON.stringify({
        activeId: "missing",
        profiles: [
          { id: "a", name: "A", fuelMode: "e85", tankL: 50, consoL100: 6.5 },
        ],
      }),
    );
    expect(parsed.activeId).toBe("a");
    expect(parsed.profiles[0]?.fuelMode).toBe("e85");
  });
});

describe("switch / create / rename / delete", () => {
  it("switches active id in one step", () => {
    let state = seedProfiles();
    state = createProfile(state);
    const second = state.activeId;
    state = switchProfile(state, state.profiles[0].id);
    expect(activeProfile(state).id).toBe(state.profiles[0].id);
    state = switchProfile(state, second);
    expect(activeProfile(state).id).toBe(second);
  });

  it("creates up to 5 then ignores extra", () => {
    let state = seedProfiles();
    for (let i = 0; i < 8; i++) {
      state = createProfile(state);
    }
    expect(state.profiles).toHaveLength(MAX_PROFILES);
    expect(state.profiles.map((row) => row.name)).toEqual([
      "Profil 1",
      "Profil 2",
      "Profil 3",
      "Profil 4",
      "Profil 5",
    ]);
  });

  it("renames with trim and a 24-char cap", () => {
    const state = renameProfile(seedProfiles(), "p-default", "  Voiture perso  ");
    expect(activeProfile(state).name).toBe("Voiture perso");
    const long = renameProfile(
      state,
      "p-default",
      "abcdefghijklmnopqrstuvwxyz",
    );
    expect(activeProfile(long).name).toHaveLength(24);
  });

  it("keeps the last profile and switches away when deleting the active one", () => {
    let state = seedProfiles();
    const first = state.activeId;
    state = createProfile(state);
    const second = state.activeId;
    expect(deleteProfile(state, second).activeId).toBe(first);
    expect(deleteProfile(seedProfiles(), first).profiles).toHaveLength(1);
  });

  it("stores fuel and fill per profile", () => {
    let state = seedProfiles();
    const first = state.activeId;
    state = updateProfileFuel(state, first, "sp98");
    state = updateProfileFill(state, first, { tankL: 30, consoL100: 4 });
    state = createProfile(state);
    expect(activeProfile(state).fuelMode).toBe("sp95_e10");
    expect(activeProfile(state)).toMatchObject(DEFAULT_FILL_PREFS);
    state = switchProfile(state, first);
    expect(activeProfile(state)).toMatchObject({
      fuelMode: "sp98",
      tankL: 30,
      consoL100: 4,
    });
  });
});
