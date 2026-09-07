import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { fetchStationsInBbox } from "./api";
import { OTHER_BRAND, applyBrandFromSnap, brandKeysInViewport } from "./brand";
import {
  detourGainEur,
  FILL_STORAGE_KEY,
  formatGainEur,
  gainVsLabel,
  parseFillPrefs,
  referencePrice,
  sanitizeFillPrefs,
  serializeFillPrefs,
  type FillPrefs,
} from "./detour";
import {
  FRESHNESS_OPACITY,
  FUEL_FIELDS,
  FUEL_MODE_LABELS,
  FUEL_MODES,
  cheapestStations,
  formatAge,
  formatPrice,
  petrolDeltaLabel,
  petrolDeltaShort,
  type FuelMode,
  type HoursInfo,
  type RawStation,
  type VisibleStation,
  visibleStationFromMode,
} from "./domain";
import {
  FAVORITES_STORAGE_KEY,
  addFavorite,
  favoriteChipLabel,
  favoriteFromStation,
  isFavorite,
  parseFavorites,
  removeFavorite,
  serializeFavorites,
  type Favorite,
} from "./favorites";
import { formatDistanceKm, haversineKm, type LatLon } from "./geo";
import { goLinks } from "./links";
import { applySnapToVisible, geocodePlace, refreshSnaps, type SnapDecision } from "./osm";
import {
  DEFAULT_PANELS,
  rankingVisible,
  togglePanel,
  type PanelsState,
} from "./panels";
import { PIN_DUAL_ICON_ANCHOR, PIN_DUAL_ICON_SIZE, PIN_ICON_ANCHOR, PIN_ICON_SIZE, pinHtml } from "./pin";
import { layoutPins } from "./pinLayout";
import {
  MAX_PROFILES,
  PROFILES_STORAGE_KEY,
  activeProfile,
  createProfile,
  deleteProfile,
  parseProfiles,
  profileFill,
  renameProfile,
  serializeProfiles,
  switchProfile,
  updateProfileFill,
  updateProfileFuel,
  type ProfilesState,
} from "./profiles";
import { registerServiceWorker } from "./pwa";
import { MAP_TILE_OPTIONS, USER_DOT } from "./tiles";
import {
  boundsToBbox,
  debounce,
  isBboxTooWide,
  shouldRefetchOnVisible,
  VIEWPORT_DEBOUNCE_MS,
  VIEWPORT_LIMIT,
} from "./viewport";

const DEFAULT_CENTER = { lat: 43.49, lon: -1.47 };

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing #${id}`);
  }
  return element;
}

function requireInput(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`missing input #${id}`);
  }
  return element;
}

const hud = requireElement("hud");
const chrome = requireElement("chrome");
const banner = requireElement("banner");
const fuelsNav = requireElement("fuels");
const profilesNav = requireElement("profiles");
const profileNameInput = requireInput("profile-name");
const profileRename = requireElement("profile-rename") as HTMLButtonElement;
const profileDelete = requireElement("profile-delete") as HTMLButtonElement;
const ranking = requireElement("ranking");
const favoritesNav = requireElement("favorites");
const placeForm = requireElement("place-search") as HTMLFormElement;
const placeInput = requireInput("place-q");
const brandSelect = requireElement("brand-filter") as HTMLSelectElement;
const highwayButton = requireElement("highway-filter") as HTMLButtonElement;
const fillSummary = requireElement("fill-summary");
const tankInput = requireInput("tank-l");
const consoInput = requireInput("conso-l100");
const toggleParams = requireElement("toggle-params") as HTMLButtonElement;
const toggleRanking = requireElement("toggle-ranking") as HTMLButtonElement;

let profiles: ProfilesState = parseProfiles(
  readStore(PROFILES_STORAGE_KEY),
  parseFillPrefs(readStore(FILL_STORAGE_KEY)),
);
let selectedFuelMode: FuelMode = activeProfile(profiles).fuelMode;
let fillPrefs: FillPrefs = profileFill(activeProfile(profiles));
let focusedId: string | undefined;
let rawStations: RawStation[] = [];
let positionLabel = "Bayonne (défaut)";
let locatedAt: LatLon | undefined;
let lastSuccessfulFetchAt: number | undefined;
let viewportMode: "ok" | "capped" | "zoom" = "ok";
let loadSeq = 0;
let inFlight: AbortController | undefined;
let map: L.Map | undefined;
let ignoreMoveLabel = false;
let brandFilter = "toutes";
let highwayOnly = false;
let favorites: Favorite[] = parseFavorites(readStore(FAVORITES_STORAGE_KEY));
let panels: PanelsState = { ...DEFAULT_PANELS };
const markers = L.layerGroup();
const markerById = new Map<string, L.Marker>();
const snapCache = new Map<string, SnapDecision>();

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function setBanner(text: string): void {
  banner.textContent = text;
}

function applyPanels(itemCount = 0): void {
  chrome.hidden = !panels.params;
  ranking.hidden = !rankingVisible(panels, itemCount);
  toggleParams.setAttribute("aria-expanded", String(panels.params));
  toggleRanking.setAttribute("aria-expanded", String(panels.ranking));
  syncMapTop();
}

function syncMapTop(): void {
  const height = Math.ceil(hud.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--chrome-h", `${height + 8}px`);
  map?.invalidateSize({ animate: false });
}

function persistProfiles(): void {
  writeStore(PROFILES_STORAGE_KEY, serializeProfiles(profiles));
  writeStore(FILL_STORAGE_KEY, serializeFillPrefs(fillPrefs));
}

function applyActiveProfile(): void {
  const current = activeProfile(profiles);
  selectedFuelMode = current.fuelMode;
  fillPrefs = profileFill(current);
}

function visibleStations(now = new Date()): VisibleStation[] {
  return rawStations.flatMap((raw) => {
    const station = visibleStationFromMode(raw, selectedFuelMode, now);
    if (!station) {
      return [];
    }
    const snap = snapCache.get(station.id);
    const snapped = applySnapToVisible(station, snap);
    const brand = applyBrandFromSnap(snapped, snap);
    return [{ ...snapped, ...brand }];
  });
}

function displayedStations(now = new Date()): VisibleStation[] {
  let stations = visibleStations(now);
  if (highwayOnly) {
    stations = stations.filter((station) => station.highway);
  }
  renderBrandOptions(brandKeysInViewport(stations));
  if (brandFilter !== "toutes") {
    stations = stations.filter((station) => station.brandKey === brandFilter);
  }
  return stations;
}

function renderBrandOptions(keys: string[]): void {
  const previous = brandFilter;
  brandSelect.replaceChildren();
  const all = document.createElement("option");
  all.value = "toutes";
  all.textContent = "Toutes";
  brandSelect.append(all);
  for (const key of keys) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key === OTHER_BRAND ? "Autre" : key;
    brandSelect.append(option);
  }
  const next =
    previous === "toutes" || keys.includes(previous) ? previous : "toutes";
  brandSelect.value = next;
  brandFilter = next;
}

function distanceOrigin(): LatLon {
  if (locatedAt) {
    return locatedAt;
  }
  if (map) {
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  }
  return DEFAULT_CENTER;
}

function goNav(
  station: Pick<VisibleStation, "lat" | "lon" | "address" | "city">,
): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "go";
  nav.setAttribute("aria-label", "Y aller");
  for (const link of goLinks(
    station.lat,
    station.lon,
    station.address,
    station.city,
  )) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    if (link.href.startsWith("http")) {
      a.target = "_blank";
      a.rel = "noreferrer";
    }
    a.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    nav.append(a);
  }
  return nav;
}

function hoursBlock(hours: HoursInfo): HTMLElement {
  const box = document.createElement("div");
  box.className = "hours";
  if (hours.automate24h) {
    const automate = document.createElement("div");
    automate.textContent = "Automate 24h";
    box.append(automate);
  }
  for (const line of hours.lines) {
    const row = document.createElement("div");
    row.textContent = line;
    box.append(row);
  }
  return box;
}

function gainLine(
  station: VisibleStation,
  peers: readonly VisibleStation[],
  origin: LatLon,
): HTMLElement | undefined {
  const ref = referencePrice(station.id, peers, origin);
  if (!ref) {
    return undefined;
  }
  const gain = detourGainEur({
    stationPrice: station.priceEur,
    referencePrice: ref.price,
    detourKm: haversineKm(origin, station),
    tankL: fillPrefs.tankL,
    consoL100: fillPrefs.consoL100,
  });
  const line = document.createElement("div");
  line.className = "gain";
  line.textContent = `approx. ${formatGainEur(gain)} ${gainVsLabel(ref.kind)}`;
  return line;
}

function toggleFavorite(station: VisibleStation): void {
  if (isFavorite(favorites, station.id)) {
    favorites = removeFavorite(favorites, station.id);
  } else {
    favorites = addFavorite(favorites, favoriteFromStation(station));
  }
  writeStore(FAVORITES_STORAGE_KEY, serializeFavorites(favorites));
  renderView();
}

function sheetMeta(
  station: VisibleStation,
  age: string,
  km: string,
): HTMLElement {
  const meta = document.createElement("div");
  const lines: string[] = [];
  for (const quote of station.quotes) {
    const fuel = FUEL_FIELDS[quote.fuel].label;
    const price = formatPrice(quote.priceEur);
    if (quote.fuel === station.fuel) {
      lines.push(`${fuel} ${price} · maj ${age} · ${km}`);
    } else {
      lines.push(`${fuel} ${price}`);
    }
  }
  if (lines.length === 0) {
    lines.push(`${formatPrice(station.priceEur)} · maj ${age} · ${km}`);
  }
  meta.append(
    ...lines.map((text) => {
      const row = document.createElement("div");
      row.textContent = text;
      return row;
    }),
  );
  const delta = petrolDeltaLabel(station.quotes);
  if (delta) {
    const gap = document.createElement("div");
    gap.className = "delta";
    gap.textContent = delta;
    meta.append(gap);
  }
  return meta;
}

function sheetContent(
  station: VisibleStation,
  price: string,
  age: string,
  origin: LatLon,
  peers: readonly VisibleStation[],
): HTMLElement {
  const body = document.createElement("div");
  if (station.brand) {
    const brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = station.brand;
    body.append(brand);
  }
  const place = document.createElement("div");
  place.textContent = [station.address, station.city].filter(Boolean).join(" · ");
  const km = formatDistanceKm(haversineKm(origin, station));
  body.append(place, sheetMeta(station, age, km));
  if (station.highway) {
    const tag = document.createElement("div");
    tag.className = "highway";
    tag.textContent = "Autoroute";
    body.append(tag);
  }
  if (station.snapped) {
    const hint = document.createElement("div");
    hint.className = "snap-hint";
    hint.textContent = "position OSM";
    body.append(hint);
  }
  const gain = gainLine(station, peers, origin);
  if (gain) {
    body.append(gain);
  }
  if (station.hours) {
    body.append(hoursBlock(station.hours));
  }
  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "fav-toggle";
  fav.textContent = isFavorite(favorites, station.id)
    ? "Retirer des favoris"
    : "Ajouter aux favoris";
  fav.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(station);
  });
  body.append(goNav(station), fav);
  return body;
}

function renderFavorites(): void {
  favoritesNav.replaceChildren();
  favoritesNav.hidden = favorites.length === 0;
  for (const fav of favorites) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = favoriteChipLabel(fav);
    if (fav.id === focusedId) {
      button.setAttribute("aria-current", "true");
    }
    button.addEventListener("click", () => {
      focusedId = fav.id;
      centerMap(fav.lat, fav.lon, 14, favoriteChipLabel(fav));
      renderView();
    });
    favoritesNav.append(button);
  }
}

function renderRanking(
  stations: VisibleStation[],
  now: Date,
  origin: LatLon,
): number {
  const top = cheapestStations(stations);
  ranking.replaceChildren();

  top.forEach((station, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    if (station.id === focusedId) {
      button.setAttribute("aria-current", "true");
    }

    const n = document.createElement("span");
    n.className = "n";
    n.textContent = String(index + 1);
    const eur = document.createElement("span");
    eur.className = "eur";
    eur.textContent =
      station.quotes.length > 1
        ? `${FUEL_FIELDS[station.fuel].label} ${formatPrice(station.priceEur)}`
        : formatPrice(station.priceEur);
    const place = document.createElement("span");
    place.className = "place";
    const label = station.brand || station.city || station.address || station.id;
    const km = formatDistanceKm(haversineKm(origin, station));
    place.textContent = `${label} · ${km}`;
    const age = document.createElement("span");
    age.className = "age";
    age.textContent = formatAge(station.updatedAt, now);

    button.dataset.freshness = station.freshness;
    button.style.opacity = String(FRESHNESS_OPACITY[station.freshness]);
    button.append(n, eur, place, age);
    button.addEventListener("click", () => {
      focusedId = station.id;
      map?.setView([station.lat, station.lon]);
      renderView();
      markerById.get(station.id)?.openPopup();
    });
    item.append(button);
    const companion = station.quotes.find((quote) => quote.fuel !== station.fuel);
    const delta = petrolDeltaLabel(station.quotes);
    if (companion || delta) {
      const gap = document.createElement("div");
      gap.className = "delta";
      const bits = [];
      if (companion) {
        bits.push(
          `${FUEL_FIELDS[companion.fuel].label} ${formatPrice(companion.priceEur)}`,
        );
      }
      if (delta) {
        bits.push(delta);
      }
      gap.textContent = bits.join(" · ");
      item.append(gap);
    }
    const gain = gainLine(station, stations, origin);
    if (gain) {
      item.append(gain);
    }
    item.append(goNav(station));
    ranking.append(item);
  });
  return top.length;
}

function pinScreenPoint(station: Pick<VisibleStation, "lat" | "lon">): {
  x: number;
  y: number;
} {
  if (!map) {
    return { x: 0, y: 0 };
  }
  return map.latLngToLayerPoint([station.lat, station.lon]);
}

function pinDisplayLatLng(
  station: Pick<VisibleStation, "lat" | "lon">,
  dx: number,
  dy: number,
): L.LatLngExpression {
  if (!map || (dx === 0 && dy === 0)) {
    return [station.lat, station.lon];
  }
  const origin = map.latLngToLayerPoint([station.lat, station.lon]);
  return map.layerPointToLatLng(L.point(origin.x + dx, origin.y + dy));
}

function renderPins(
  stations: VisibleStation[],
  now: Date,
  origin: LatLon,
): void {
  markers.clearLayers();
  markerById.clear();

  const placements = layoutPins(
    stations.map((station) => {
      const point = pinScreenPoint(station);
      const dual = station.quotes.length > 1;
      return {
        id: station.id,
        x: point.x,
        y: point.y,
        rank: station.id === focusedId ? -1 : station.priceEur,
        width: dual ? PIN_DUAL_ICON_SIZE[0] : PIN_ICON_SIZE[0],
        height: dual ? PIN_DUAL_ICON_SIZE[1] : PIN_ICON_SIZE[1],
      };
    }),
  );
  const placeById = new Map(placements.map((place) => [place.id, place]));

  for (const station of stations) {
    const place = placeById.get(station.id);
    if (!place || place.hidden) {
      continue;
    }
    const age = formatAge(station.updatedAt, now);
    const price = formatPrice(station.priceEur);
    const on = station.id === focusedId;
    const dual = station.quotes.length > 1;
    const companion = station.quotes.find((quote) => quote.fuel !== station.fuel);
    const icon = L.divIcon({
      className: "",
      iconSize: dual ? [...PIN_DUAL_ICON_SIZE] : [...PIN_ICON_SIZE],
      iconAnchor: dual ? [...PIN_DUAL_ICON_ANCHOR] : [...PIN_ICON_ANCHOR],
      html: pinHtml({
        brandKey: station.brandKey,
        fuel: station.fuel,
        price,
        age,
        freshness: station.freshness,
        selected: on,
        alt: companion
          ? { fuel: companion.fuel, price: formatPrice(companion.priceEur) }
          : undefined,
        delta: petrolDeltaShort(station.quotes),
      }),
    });
    const marker = L.marker(pinDisplayLatLng(station, place.dx, place.dy), {
      icon,
      zIndexOffset: on ? 2000 : Math.round(1000 - station.priceEur * 100),
    })
      .bindPopup(sheetContent(station, price, age, origin, stations), {
        className: "sheet",
        closeButton: false,
      })
      .on("click", () => {
        focusedId = station.id;
        renderRanking(stations, now, origin);
        renderFavorites();
      });
    marker.addTo(markers);
    markerById.set(station.id, marker);
  }
}

function renderFillSummary(): void {
  const conso = String(fillPrefs.consoL100).replace(".", ",");
  fillSummary.textContent = `Plein ${fillPrefs.tankL} L · ${conso} L/100`;
  tankInput.value = String(fillPrefs.tankL);
  consoInput.value = String(fillPrefs.consoL100);
}

function renderView(): void {
  const fuel = FUEL_MODE_LABELS[selectedFuelMode];

  if (viewportMode === "zoom") {
    focusedId = undefined;
    markers.clearLayers();
    markerById.clear();
    ranking.replaceChildren();
    renderBrandOptions([]);
    renderFavorites();
    setBanner(`Zoomez pour afficher les stations · ${fuel}`);
    applyPanels(0);
    return;
  }

  const now = new Date();
  const stations = displayedStations(now);
  if (focusedId && !stations.some((station) => station.id === focusedId)) {
    focusedId = undefined;
  }

  const origin = distanceOrigin();
  renderPins(stations, now, origin);
  const topCount = renderRanking(stations, now, origin);
  renderFavorites();

  const cap =
    viewportMode === "capped"
      ? ` · max ${VIEWPORT_LIMIT}, zoomez pour affiner`
      : "";
  const highway = highwayOnly ? " · Autoroute" : "";
  const brand =
    brandFilter !== "toutes"
      ? ` · ${brandFilter === OTHER_BRAND ? "Autre" : brandFilter}`
      : "";
  setBanner(
    `${stations.length} station${stations.length === 1 ? "" : "s"} · ${fuel} · ${positionLabel}${highway}${brand}${cap}`,
  );
  if (focusedId) {
    markerById.get(focusedId)?.openPopup();
  }
  applyPanels(topCount);
}

function renderFuelButtons(): void {
  fuelsNav.replaceChildren();
  for (const mode of FUEL_MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = FUEL_MODE_LABELS[mode];
    button.setAttribute("aria-pressed", String(mode === selectedFuelMode));
    button.addEventListener("click", () => {
      selectedFuelMode = mode;
      profiles = updateProfileFuel(profiles, activeProfile(profiles).id, mode);
      persistProfiles();
      focusedId = undefined;
      renderFuelButtons();
      renderView();
    });
    fuelsNav.append(button);
  }
}

function renderProfiles(): void {
  const current = activeProfile(profiles);
  profilesNav.replaceChildren();
  for (const profile of profiles.profiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = profile.name;
    button.setAttribute("aria-pressed", String(profile.id === current.id));
    button.addEventListener("click", () => {
      if (profile.id === current.id) {
        return;
      }
      profiles = switchProfile(profiles, profile.id);
      applyActiveProfile();
      persistProfiles();
      focusedId = undefined;
      renderProfiles();
      renderFuelButtons();
      renderFillSummary();
      renderView();
    });
    profilesNav.append(button);
  }
  if (profiles.profiles.length < MAX_PROFILES) {
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "＋";
    add.setAttribute("aria-label", "Créer un profil");
    add.addEventListener("click", () => {
      profiles = createProfile(profiles);
      applyActiveProfile();
      persistProfiles();
      focusedId = undefined;
      renderProfiles();
      renderFuelButtons();
      renderFillSummary();
      renderView();
    });
    profilesNav.append(add);
  }
  profileNameInput.value = current.name;
  profileDelete.disabled = profiles.profiles.length <= 1;
}

function centerMap(lat: number, lon: number, zoom: number, label: string): void {
  if (!map) {
    return;
  }
  ignoreMoveLabel = true;
  positionLabel = label;
  const center = map.getCenter();
  const same =
    Math.abs(center.lat - lat) < 1e-5 &&
    Math.abs(center.lng - lon) < 1e-5 &&
    map.getZoom() === zoom;
  map.setView([lat, lon], zoom);
  if (same) {
    ignoreMoveLabel = false;
    void loadViewport(false);
  }
}

async function locate(): Promise<{ lat: number; lon: number }> {
  if (!navigator.geolocation) {
    return DEFAULT_CENTER;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        locatedAt = here;
        positionLabel = "votre position";
        resolve(here);
      },
      () => resolve(DEFAULT_CENTER),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

async function loadViewport(isFirstLoad: boolean): Promise<void> {
  if (!map) {
    return;
  }

  const seq = ++loadSeq;
  inFlight?.abort();
  const ac = new AbortController();
  inFlight = ac;

  const bbox = boundsToBbox(map.getBounds());
  if (isBboxTooWide(bbox)) {
    if (seq !== loadSeq) {
      return;
    }
    rawStations = [];
    viewportMode = "zoom";
    renderView();
    return;
  }

  if (isFirstLoad) {
    setBanner(`Chargement des prix autour de ${positionLabel}…`);
  }

  try {
    const stations = await fetchStationsInBbox(bbox, { signal: ac.signal });
    if (seq !== loadSeq) {
      return;
    }
    rawStations = stations;
    viewportMode = stations.length >= VIEWPORT_LIMIT ? "capped" : "ok";
    lastSuccessfulFetchAt = Date.now();
    renderView();
    const snapped = await refreshSnaps(stations, bbox, snapCache, {
      signal: ac.signal,
    });
    if (seq !== loadSeq) {
      return;
    }
    if (snapped) {
      renderView();
    }
  } catch (error) {
    if (ac.signal.aborted || seq !== loadSeq) {
      return;
    }
    const message = error instanceof Error ? error.message : "erreur réseau";
    setBanner(`Impossible de charger les prix (${message}).`);
  }
}

function bindChrome(): void {
  placeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = placeInput.value.trim();
    if (!query) {
      return;
    }
    const submit = placeForm.querySelector("button[type='submit']");
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = true;
    }
    void geocodePlace(query)
      .then((hit) => {
        if (!hit) {
          setBanner("Lieu introuvable.");
          return;
        }
        centerMap(hit.lat, hit.lon, 13, hit.label);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "erreur réseau";
        setBanner(`Recherche impossible (${message}).`);
      })
      .finally(() => {
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = false;
        }
      });
  });

  brandSelect.addEventListener("change", () => {
    brandFilter = brandSelect.value || "toutes";
    focusedId = undefined;
    renderView();
  });

  highwayButton.addEventListener("click", () => {
    highwayOnly = !highwayOnly;
    highwayButton.setAttribute("aria-pressed", String(highwayOnly));
    focusedId = undefined;
    renderView();
  });

  const onFillChange = () => {
    fillPrefs = sanitizeFillPrefs({
      tankL: tankInput.valueAsNumber,
      consoL100: consoInput.valueAsNumber,
    });
    profiles = updateProfileFill(profiles, activeProfile(profiles).id, fillPrefs);
    persistProfiles();
    renderFillSummary();
    renderView();
  };
  tankInput.addEventListener("change", onFillChange);
  consoInput.addEventListener("change", onFillChange);

  toggleParams.addEventListener("click", () => {
    panels = togglePanel(panels, "params");
    applyPanels(ranking.childElementCount);
  });
  toggleRanking.addEventListener("click", () => {
    panels = togglePanel(panels, "ranking");
    applyPanels(ranking.childElementCount);
  });

  const onRename = () => {
    profiles = renameProfile(
      profiles,
      activeProfile(profiles).id,
      profileNameInput.value,
    );
    persistProfiles();
    renderProfiles();
  };
  profileRename.addEventListener("click", onRename);
  profileNameInput.addEventListener("change", onRename);
  profileNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onRename();
    }
  });
  profileDelete.addEventListener("click", () => {
    profiles = deleteProfile(profiles, activeProfile(profiles).id);
    applyActiveProfile();
    persistProfiles();
    focusedId = undefined;
    renderProfiles();
    renderFuelButtons();
    renderFillSummary();
    renderView();
  });
}

async function start(): Promise<void> {
  renderFuelButtons();
  renderProfiles();
  renderFillSummary();
  persistProfiles();
  bindChrome();
  renderFavorites();
  applyPanels(0);
  const center = await locate();
  map = L.map("map", { zoomControl: true }).setView(
    [center.lat, center.lon],
    13,
  );
  map.zoomControl.setPosition("topright");
  maplibreGL(MAP_TILE_OPTIONS).addTo(map);
  L.circleMarker([center.lat, center.lon], USER_DOT).addTo(map);
  markers.addTo(map);
  syncMapTop();

  await loadViewport(true);

  const onMoveEnd = debounce(() => {
    if (ignoreMoveLabel) {
      ignoreMoveLabel = false;
    } else {
      positionLabel = "zone visible";
    }
    void loadViewport(false);
  }, VIEWPORT_DEBOUNCE_MS);
  map.on("zoomend", () => {
    if (viewportMode === "zoom") {
      return;
    }
    renderView();
  });
  map.on("moveend", onMoveEnd);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (!shouldRefetchOnVisible(lastSuccessfulFetchAt, Date.now())) {
      return;
    }
    void loadViewport(false);
  });
}

registerServiceWorker();
void start();
