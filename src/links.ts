/** Street, or street + city. Never city alone — too vague for navigation. */
export function placeQuery(address = "", city = ""): string {
  const street = address.trim();
  if (!street) {
    return "";
  }
  const town = city.trim();
  return town ? `${street}, ${town}` : street;
}

export function geoUrl(lat: number, lon: number, query = ""): string {
  const pin = `${lat},${lon}`;
  const text = query.trim();
  const q = text ? `${pin}(${text})` : pin;
  return `geo:${pin}?q=${q}`;
}

export function wazeUrl(lat: number, lon: number, query = ""): string {
  const text = query.trim();
  const q = text ? `&q=${encodeURIComponent(text)}` : "";
  return `https://www.waze.com/ul?ll=${lat},${lon}&navigate=yes${q}`;
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

export function goLinks(
  lat: number,
  lon: number,
  address = "",
  city = "",
): GoLink[] {
  const query = placeQuery(address, city);
  return [
    { href: geoUrl(lat, lon, query), label: "Y aller" },
    { href: wazeUrl(lat, lon, query), label: "Waze" },
    { href: googleMapsUrl(lat, lon), label: "Google Maps" },
    { href: appleMapsUrl(lat, lon), label: "Apple Plans" },
  ];
}
