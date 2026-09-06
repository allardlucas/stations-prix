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
  FUELS,
  cheapestStations,
  formatAge,
  formatPrice,
  type Fuel,
  type HoursInfo,
  type RawStation,
  type VisibleStation,
  visibleStationFromRaw,
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
import { PIN_ICON_ANCHOR, PIN_ICON_SIZE, pinHtml } from "./pin";
import { layoutPins } from "./pinLayout";
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

let selectedFuel: Fuel = "gazole";
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
let fillPrefs: FillPrefs = parseFillPrefs(readStore(FILL_STORAGE_KEY));
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

function visibleStations(now = new Date()): VisibleStation[] {
  return rawStations.flatMap((raw) => {
    const station = visibleStationFromRaw(raw, selectedFuel, now);
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
  const meta = document.createElement("div");
  meta.textContent = `${price} · maj ${age} · ${km}`;
  body.append(place, meta);
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
    eur.textContent = formatPrice(station.priceEur);
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
      return {
        id: station.id,
        x: point.x,
        y: point.y,
        rank: station.id === focusedId ? -1 : station.priceEur,
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
    const icon = L.divIcon({
      className: "",
      iconSize: [...PIN_ICON_SIZE],
      iconAnchor: [...PIN_ICON_ANCHOR],
      html: pinHtml({
        brandKey: station.brandKey,
        fuel: station.fuel,
        price,
        age,
        freshness: station.freshness,
        selected: on,
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
  const fuel = FUEL_FIELDS[selectedFuel].label;

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
  for (const fuel of FUELS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = FUEL_FIELDS[fuel].label;
    button.setAttribute("aria-pressed", String(fuel === selectedFuel));
    button.addEventListener("click", () => {
      selectedFuel = fuel;
      focusedId = undefined;
      renderFuelButtons();
      renderView();
    });
    fuelsNav.append(button);
  }
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
    writeStore(FILL_STORAGE_KEY, serializeFillPrefs(fillPrefs));
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
}

async function start(): Promise<void> {
  renderFuelButtons();
  renderFillSummary();
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

void start();
