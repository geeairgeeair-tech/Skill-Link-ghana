import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MapPin, Search } from "lucide-react";
import { fetchActiveServiceAreas, type ServiceArea } from "@/lib/service-areas";

/**
 * Canonical single-area selector for Customers (booking + job posting).
 *
 * Typing only filters the catalogue — the stored value is always a real
 * `service_areas.id`. `allowedIds` restricts the list to a professional's
 * coverage when booking someone directly.
 */
export function ServiceAreaSelect({
  value,
  onChange,
  allowedIds,
  invalid,
  emptyMessage = "No matching service area.",
  notServedMessage,
}: {
  value: string | null;
  onChange: (id: string | null, area: ServiceArea | null) => void;
  allowedIds?: string[] | null;
  invalid?: boolean;
  emptyMessage?: string;
  notServedMessage?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: areas, isLoading } = useQuery({
    queryKey: ["service-areas-active"],
    staleTime: 10 * 60_000,
    queryFn: fetchActiveServiceAreas,
  });

  const available = useMemo(() => {
    const all = areas ?? [];
    if (!allowedIds) return all;
    const set = new Set(allowedIds);
    return all.filter((a) => set.has(a.id));
  }, [areas, allowedIds]);

  const selected = available.find((a) => a.id === value) ?? null;

  /**
   * True autocomplete ranking: exact match first, then name prefix, then
   * word-prefix, then substring, then zone matches. Lower score = better.
   */
  const rankArea = (a: ServiceArea, needle: string): number => {
    const name = a.name.toLowerCase();
    const zone = a.launch_zone.toLowerCase();
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.split(/\s+/).some((w) => w.startsWith(needle))) return 2;
    if (name.includes(needle)) return 3;
    if (zone.startsWith(needle)) return 4;
    if (zone.includes(needle)) return 5;
    return -1;
  };

  /** Ranked flat results while the customer is typing. */
  const ranked = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    return available
      .map((a) => ({ a, score: rankArea(a, needle) }))
      .filter((r) => r.score >= 0)
      .sort((x, y) => x.score - y.score || x.a.name.localeCompare(y.a.name))
      .slice(0, 20)
      .map((r) => r.a);
  }, [available, q]);

  const groups = useMemo(() => {
    if (ranked) return [];
    const out = new Map<string, ServiceArea[]>();
    available.forEach((a) => {
      const list = out.get(a.launch_zone) ?? [];
      list.push(a);
      out.set(a.launch_zone, list);
    });
    return Array.from(out.entries());
  }, [available, ranked]);

  const showList = open || !selected;

  return (
    <div className="space-y-2">
      {selected && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3">
          <MapPin className="size-4 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">{selected.name}</span>
          <span className="text-[11px] text-muted-foreground truncate">{selected.launch_zone}</span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="ml-auto shrink-0 text-xs font-semibold text-muted-foreground"
          >
            {open ? "Done" : "Change"}
          </button>
        </div>
      )}

      {showList && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search areas (e.g. Adenta, Tema, Kasoa)"
              className={`w-full rounded-xl border bg-card py-3 pl-9 pr-3 text-sm ${invalid ? "border-destructive" : "border-input"}`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {isLoading && <p className="p-3 text-xs text-muted-foreground">Loading service areas…</p>}
            {!isLoading && !ranked?.length && groups.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">
                {q.trim() && notServedMessage ? notServedMessage : emptyMessage}
              </p>
            )}
            {ranked?.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id, a);
                  setOpen(false);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-md border ${
                    value === a.id ? "border-primary bg-primary text-primary-foreground" : "border-input"
                  }`}
                >
                  {value === a.id && <Check className="size-3.5" />}
                </span>
                <span className="truncate font-medium">{a.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{a.launch_zone}</span>
              </button>
            ))}
            {groups.map(([zone, list]) => (
              <div key={zone}>
                <p className="sticky top-0 bg-muted/80 backdrop-blur px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {zone}
                </p>
                {list.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onChange(a.id, a);
                      setOpen(false);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-md border ${
                        value === a.id ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {value === a.id && <Check className="size-3.5" />}
                    </span>
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tap an area from the list — typing alone does not select an area.
          </p>
        </>
      )}
    </div>
  );
}
