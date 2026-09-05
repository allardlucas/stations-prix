import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { fetchStationsInBbox } from "./api";
import {
  FUEL_FIELDS,
  FUELS,
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

let selectedFuel: Fuel = "gazole";
let rawStations: RawStation[] = [];
let positionLabel = "Bayonne (défaut)";
let viewportMode: "ok" | "capped" | "zoom" = "ok";
let loadSeq = 0;
let inFlight: AbortController | undefined;
const markers = L.layerGroup();

function setBanner(text: string): void {
  banner.textContent = text;
}

function visibleStations(now = new Date()): VisibleStation[] {
  return rawStations.flatMap((raw) => {
    const station = visibleStationFromRaw(raw, selectedFuel, now);
    return station ? [station] : [];
  });
}

function renderPins(): void {
  const fuel = FUEL_FIELDS[selectedFuel].label;

  if (viewportMode === "zoom") {
    markers.clearLayers();
    setBanner(`Zoomez pour afficher les stations · ${fuel}`);
    return;
  }

  const now = new Date();
  const stations = visibleStations(now);
  markers.clearLayers();

  for (const station of stations) {
    const age = formatAge(station.updatedAt, now);
    const price = formatPrice(station.priceEur);
    const icon = L.divIcon({
      className: "",
      iconSize: [72, 36],
      iconAnchor: [36, 36],
      html: `<div class="pin"><strong>${price}</strong><span>${age}</span></div>`,
    });
    L.marker([station.lat, station.lon], { icon })
      .bindPopup(
        `${station.address}<br>${station.city}<br>${price}<br>Maj ${age}`,
      )
      .addTo(markers);
  }

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
      renderFuelButtons();
      renderPins();
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

async function loadViewport(map: L.Map, isFirstLoad: boolean): Promise<void> {
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
    renderPins();
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
    renderPins();
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
  const map = L.map("map", { zoomControl: true }).setView(
    [center.lat, center.lon],
    13,
  );
  map.zoomControl.setPosition("bottomright");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  L.circleMarker([center.lat, center.lon], {
    radius: 6,
    color: "#0a58ca",
    fillOpacity: 0.9,
  }).addTo(map);
  markers.addTo(map);

  await loadViewport(map, true);

  const onMoveEnd = debounce(() => {
    positionLabel = "zone visible";
    void loadViewport(map, false);
  }, VIEWPORT_DEBOUNCE_MS);
  map.on("moveend", onMoveEnd);
}

void start();
