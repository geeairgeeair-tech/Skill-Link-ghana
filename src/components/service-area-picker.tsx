import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MapPin, Search, X } from "lucide-react";
import {
  fetchActiveServiceAreas,
  MAX_ADDITIONAL_AREAS,
  type ServiceArea,
  type WorkerCoverage,
} from "@/lib/service-areas";

/**
 * Canonical service-area selector: exactly one primary area plus up to 7
 * additional areas. Free-text areas are impossible by design — every option
 * comes from the active `service_areas` catalogue.
 */
export function ServiceAreaPicker({
  value,
  onChange,
}: {
  value: WorkerCoverage;
  onChange: (next: WorkerCoverage) => void;
}) {
  const [q, setQ] = useState("");

  const { data: areas, isLoading } = useQuery({
    queryKey: ["service-areas-active"],
    staleTime: 10 * 60_000,
    queryFn: fetchActiveServiceAreas,
  });

  const byId = useMemo(() => {
    const m = new Map<string, ServiceArea>();
    (areas ?? []).forEach((a) => m.set(a.id, a));
    return m;
  }, [areas]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = new Map<string, ServiceArea[]>();
    (areas ?? []).forEach((a) => {
      if (needle && !a.name.toLowerCase().includes(needle) && !a.launch_zone.toLowerCase().includes(needle)) return;
      const list = out.get(a.launch_zone) ?? [];
      list.push(a);
      out.set(a.launch_zone, list);
    });
    return Array.from(out.entries());
  }, [areas, q]);

  const extras = value.additionalIds;
  const remaining = MAX_ADDITIONAL_AREAS - extras.length;

  const pick = (id: string) => {
    if (value.primaryId === id) return;
    if (!value.primaryId) return onChange({ primaryId: id, additionalIds: extras.filter((x) => x !== id) });
    if (extras.includes(id)) return onChange({ ...value, additionalIds: extras.filter((x) => x !== id) });
    if (remaining <= 0) return;
    onChange({ ...value, additionalIds: [...extras, id] });
  };

  const setPrimary = (id: string) =>
    onChange({
      primaryId: id,
      additionalIds: [
        ...extras.filter((x) => x !== id),
        ...(value.primaryId && value.primaryId !== id && extras.length < MAX_ADDITIONAL_AREAS ? [value.primaryId] : []),
      ],
    });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Where are you mainly based?</p>
        <p className="text-xs text-muted-foreground">Choose one primary service area.</p>
        {value.primaryId ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3">
            <MapPin className="size-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">{byId.get(value.primaryId)?.name ?? "Selected area"}</span>
            <button
              type="button"
              onClick={() => onChange({ primaryId: null, additionalIds: extras })}
              className="ml-auto text-xs font-semibold text-muted-foreground"
            >
              Change
            </button>
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            Tap an area below to set it as your primary service area.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Where else can you work?</p>
          <p className="text-[11px] font-semibold text-muted-foreground">
            {extras.length} of {MAX_ADDITIONAL_AREAS} additional areas selected
          </p>
        </div>
        {extras.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extras.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ ...value, additionalIds: extras.filter((x) => x !== id) })}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold"
              >
                {byId.get(id)?.name ?? "Area"} <X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search areas (e.g. Adenta, Tema, Kasoa)"
          className="w-full rounded-xl border border-input bg-card py-3 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {isLoading && <p className="p-3 text-xs text-muted-foreground">Loading service areas…</p>}
        {!isLoading && groups.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">No matching service area.</p>
        )}
        {groups.map(([zone, list]) => (
          <div key={zone}>
            <p className="sticky top-0 bg-muted/80 backdrop-blur px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {zone}
            </p>
            {list.map((a) => {
              const isPrimary = value.primaryId === a.id;
              const isExtra = extras.includes(a.id);
              const disabled = !isPrimary && !isExtra && !!value.primaryId && remaining <= 0;
              return (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(a.id)}
                    className={`flex flex-1 items-center gap-2 text-left text-sm ${disabled ? "opacity-40" : ""}`}
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-md border ${
                        isPrimary || isExtra ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {(isPrimary || isExtra) && <Check className="size-3.5" />}
                    </span>
                    <span className="truncate">{a.name}</span>
                  </button>
                  {isPrimary ? (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      Primary
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimary(a.id)}
                      className="shrink-0 text-[11px] font-semibold text-muted-foreground"
                    >
                      Set primary
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Maximum 8 areas in total (1 primary + {MAX_ADDITIONAL_AREAS} additional). This is general coverage only — your
        exact job addresses are never shown here.
      </p>
    </div>
  );
}
