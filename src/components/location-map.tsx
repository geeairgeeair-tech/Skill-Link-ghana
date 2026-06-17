import { MapPin } from "lucide-react";

/**
 * Lightweight static map preview using OpenStreetMap (no API key required).
 * Centers on the given Ghana city / area string. Suitable for showing a worker's
 * service area or a job location at a glance.
 */
const GHANA_CITIES: Record<string, { lat: number; lng: number }> = {
  accra: { lat: 5.6037, lng: -0.187 },
  tema: { lat: 5.6698, lng: 0.0166 },
  kumasi: { lat: 6.6885, lng: -1.6244 },
  takoradi: { lat: 4.8845, lng: -1.7554 },
  "cape coast": { lat: 5.1054, lng: -1.2466 },
  tamale: { lat: 9.4008, lng: -0.8393 },
  ho: { lat: 6.6101, lng: 0.4708 },
  koforidua: { lat: 6.094, lng: -0.2591 },
  sunyani: { lat: 7.3349, lng: -2.3123 },
  "ashaiman": { lat: 5.7, lng: 0.05 },
  madina: { lat: 5.6837, lng: -0.1668 },
};

function resolveCenter(area?: string | null) {
  if (!area) return GHANA_CITIES.accra;
  const key = area.toLowerCase().trim();
  for (const [city, coord] of Object.entries(GHANA_CITIES)) {
    if (key.includes(city)) return coord;
  }
  return GHANA_CITIES.accra;
}

export function LocationMap({
  area,
  height = 180,
  className = "",
}: {
  area?: string | null;
  height?: number;
  className?: string;
}) {
  const { lat, lng } = resolveCenter(area);
  const delta = 0.04;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border bg-muted ${className}`}>
      <iframe
        title={`Map of ${area ?? "Ghana"}`}
        src={src}
        style={{ height, width: "100%", border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-card/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold shadow-card">
        <MapPin className="size-3 text-primary" />
        {area ?? "Ghana"}
      </div>
    </div>
  );
}
