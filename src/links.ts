export function geoUrl(lat: number, lon: number): string {
  return `geo:${lat},${lon}?q=${lat},${lon}`;
}

export function wazeUrl(lat: number, lon: number): string {
  return `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes`;
}

export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

export function appleMapsUrl(lat: number, lon: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
}

export type GoLink = {
  href: string;
  label: string;
};

export function goLinks(lat: number, lon: number): GoLink[] {
  return [
    { href: geoUrl(lat, lon), label: "Y aller" },
    { href: wazeUrl(lat, lon), label: "Waze" },
    { href: googleMapsUrl(lat, lon), label: "Google Maps" },
    { href: appleMapsUrl(lat, lon), label: "Apple Plans" },
  ];
}
