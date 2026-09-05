import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { fetchStationsInBbox } from "./api";
import {
  FUEL_FIELDS,
  FUELS,
  cheapestStations,
  formatAge,
  formatPrice,
  type Fuel,
  type RawStation,
  type VisibleStation,
  visibleStationFromRaw,
} from "./domain";
import {
  boundsToBbox,
  debounce,
  isBboxTooWide,
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

function sheetContent(station: VisibleStation, price: string, age: string): HTMLElement {
  const body = document.createElement("div");
  const place = document.createElement("div");
  place.textContent = [station.address, station.city].filter(Boolean).join(" · ");
  const meta = document.createElement("div");
  meta.textContent = `${price} · maj ${age}`;
  body.append(place, meta);
  return body;
}

function renderRanking(stations: VisibleStation[], now: Date): void {
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
    place.textContent = station.city || station.address || station.id;
    const age = document.createElement("span");
    age.className = "age";
    age.textContent = formatAge(station.updatedAt, now);

    button.append(n, eur, place, age);
    button.addEventListener("click", () => {
      focusedId = station.id;
      map?.setView([station.lat, station.lon]);
      renderView();
      markerById.get(station.id)?.openPopup();
    });
    item.append(button);
    ranking.append(item);
  });
}

function renderPins(stations: VisibleStation[], now: Date): void {
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
      html: `<div class="pin${on ? " is-on" : ""}"><strong>${price}</strong><span>${age}</span></div>`,
    });
    const marker = L.marker([station.lat, station.lon], { icon })
      .bindPopup(sheetContent(station, price, age), {
        className: "sheet",
        closeButton: false,
      })
      .on("click", () => {
        focusedId = station.id;
        renderRanking(stations, now);
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

  renderPins(stations, now);
  renderRanking(stations, now);

  const cap =
    viewportMode === "capped"
      ? ` · max ${VIEWPORT_LIMIT}, zoomez pour affiner`
      : "";
  setBanner(
    `${stations.length} station${stations.length === 1 ? "" : "s"} · ${fuel} · ${positionLabel} · pins = prix ≤72h${cap}`,
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
        positionLabel = "votre position";
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
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
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
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
}

void start();
