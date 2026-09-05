import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { fetchStationsInBbox } from "./api";
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
import { formatDistanceKm, haversineKm, type LatLon } from "./geo";
import { goLinks } from "./links";
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

const banner = requireElement("banner");
const fuelsNav = requireElement("fuels");
const ranking = requireElement("ranking");

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
const markers = L.layerGroup();
const markerById = new Map<string, L.Marker>();

function setBanner(text: string): void {
  banner.textContent = text;
}

function visibleStations(now = new Date()): VisibleStation[] {
  return rawStations.flatMap((raw) => {
    const station = visibleStationFromRaw(raw, selectedFuel, now);
    return station ? [station] : [];
  });
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

function goNav(lat: number, lon: number): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "go";
  nav.setAttribute("aria-label", "Y aller");
  for (const link of goLinks(lat, lon)) {
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

function sheetContent(
  station: VisibleStation,
  price: string,
  age: string,
  origin: LatLon,
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
  if (station.hours) {
    body.append(hoursBlock(station.hours));
  }
  body.append(goNav(station.lat, station.lon));
  return body;
}

function renderRanking(
  stations: VisibleStation[],
  now: Date,
  origin: LatLon,
): void {
  const top = cheapestStations(stations);
  ranking.replaceChildren();
  ranking.hidden = top.length === 0;

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
    item.append(button, goNav(station.lat, station.lon));
    ranking.append(item);
  });
}

function renderPins(
  stations: VisibleStation[],
  now: Date,
  origin: LatLon,
): void {
  markers.clearLayers();
  markerById.clear();

  for (const station of stations) {
    const age = formatAge(station.updatedAt, now);
    const price = formatPrice(station.priceEur);
    const on = station.id === focusedId;
    const icon = L.divIcon({
      className: "",
      iconSize: [86, 22],
      iconAnchor: [43, 22],
      html: `<div class="pin${on ? " is-on" : ""}" data-freshness="${station.freshness}" style="opacity:${FRESHNESS_OPACITY[station.freshness]}"><strong>${price}</strong><span>${age}</span></div>`,
    });
    const marker = L.marker([station.lat, station.lon], { icon })
      .bindPopup(sheetContent(station, price, age, origin), {
        className: "sheet",
        closeButton: false,
      })
      .on("click", () => {
        focusedId = station.id;
        renderRanking(stations, now, origin);
      });
    marker.addTo(markers);
    markerById.set(station.id, marker);
  }
}

function renderView(): void {
  const fuel = FUEL_FIELDS[selectedFuel].label;

  if (viewportMode === "zoom") {
    focusedId = undefined;
    markers.clearLayers();
    markerById.clear();
    ranking.replaceChildren();
    ranking.hidden = true;
    setBanner(`Zoomez pour afficher les stations · ${fuel}`);
    return;
  }

  const now = new Date();
  const stations = visibleStations(now);
  if (focusedId && !stations.some((station) => station.id === focusedId)) {
    focusedId = undefined;
  }

  const origin = distanceOrigin();
  renderPins(stations, now, origin);
  renderRanking(stations, now, origin);

  const cap =
    viewportMode === "capped"
      ? ` · max ${VIEWPORT_LIMIT}, zoomez pour affiner`
      : "";
  setBanner(
    `${stations.length} station${stations.length === 1 ? "" : "s"} · ${fuel} · ${positionLabel}${cap}`,
  );
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
  } catch (error) {
    if (ac.signal.aborted || seq !== loadSeq) {
      return;
    }
    const message = error instanceof Error ? error.message : "erreur réseau";
    setBanner(`Impossible de charger les prix (${message}).`);
  }
}

async function start(): Promise<void> {
  renderFuelButtons();
  const center = await locate();
  map = L.map("map", { zoomControl: true }).setView(
    [center.lat, center.lon],
    13,
  );
  map.zoomControl.setPosition("topright");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  L.circleMarker([center.lat, center.lon], {
    radius: 6,
    color: "#d7dde8",
    fillOpacity: 0.9,
  }).addTo(map);
  markers.addTo(map);

  await loadViewport(true);

  const onMoveEnd = debounce(() => {
    positionLabel = "zone visible";
    void loadViewport(false);
  }, VIEWPORT_DEBOUNCE_MS);
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
