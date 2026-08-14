import { supabase } from "@/integrations/supabase/client";

export const MAX_SERVICE_AREAS = 8;
export const MAX_ADDITIONAL_AREAS = MAX_SERVICE_AREAS - 1;

export type ServiceArea = {
  id: string;
  name: string;
  launch_zone: string;
  region: string;
  sort_order: number;
};

/** All canonical, selectable (active) launch areas. Inactive areas are never returned. */
export async function fetchActiveServiceAreas(): Promise<ServiceArea[]> {
  const { data, error } = await supabase
    .from("service_areas")
    .select("id, name, launch_zone, region, sort_order")
    .eq("is_active", true)
    .order("launch_zone")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ServiceArea[];
}

export type WorkerCoverage = {
  primaryId: string | null;
  additionalIds: string[];
};

/** A professional's canonical coverage. Public, non-sensitive information. */
export async function fetchWorkerCoverage(workerId: string): Promise<WorkerCoverage> {
  const { data, error } = await supabase
    .from("worker_service_areas")
    .select("service_area_id, is_primary")
    .eq("worker_id", workerId);
  if (error) throw error;
  const rows = data ?? [];
  return {
    primaryId: rows.find((r) => r.is_primary)?.service_area_id ?? null,
    additionalIds: rows.filter((r) => !r.is_primary).map((r) => r.service_area_id),
  };
}

/**
 * Replace a professional's coverage with exactly one primary plus up to 7 extra areas.
 *
 * The database is the final authority (max 8 trigger + one-primary partial unique
 * index), so writes are ordered so that no intermediate state can violate either:
 * remove first, clear primary flags, insert as non-primary, then promote the primary.
 */
export async function saveWorkerServiceAreas(
  workerId: string,
  primaryId: string,
  additionalIds: string[],
): Promise<void> {
  if (!primaryId) throw new Error("Choose your primary service area");
  const extras = Array.from(new Set(additionalIds.filter((id) => id && id !== primaryId)));
  if (extras.length > MAX_ADDITIONAL_AREAS) {
    throw new Error(`You can add at most ${MAX_ADDITIONAL_AREAS} additional service areas`);
  }
  const keep = [primaryId, ...extras];

  const { data: existing, error: readErr } = await supabase
    .from("worker_service_areas")
    .select("service_area_id")
    .eq("worker_id", workerId);
  if (readErr) throw readErr;
  const existingIds = (existing ?? []).map((r) => r.service_area_id);

  const toRemove = existingIds.filter((id) => !keep.includes(id));
  if (toRemove.length) {
    const { error } = await supabase
      .from("worker_service_areas")
      .delete()
      .eq("worker_id", workerId)
      .in("service_area_id", toRemove);
    if (error) throw error;
  }

  const { error: clearErr } = await supabase
    .from("worker_service_areas")
    .update({ is_primary: false })
    .eq("worker_id", workerId)
    .eq("is_primary", true);
  if (clearErr) throw clearErr;

  const toAdd = keep.filter((id) => !existingIds.includes(id));
  if (toAdd.length) {
    const { error } = await supabase
      .from("worker_service_areas")
      .insert(toAdd.map((service_area_id) => ({ worker_id: workerId, service_area_id, is_primary: false })));
    if (error) throw error;
  }

  const { error: primaryErr } = await supabase
    .from("worker_service_areas")
    .update({ is_primary: true })
    .eq("worker_id", workerId)
    .eq("service_area_id", primaryId);
  if (primaryErr) throw primaryErr;
}

/**
 * Canonical PRIMARY service-area name per professional. Used for compact
 * marketplace cards, which show only the primary area.
 */
export async function fetchPrimaryAreaNames(workerIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!workerIds.length) return map;
  const { data } = await supabase
    .from("worker_service_areas")
    .select("worker_id, service_areas(name)")
    .in("worker_id", workerIds)
    .eq("is_primary", true);
  (data ?? []).forEach((r: any) => {
    if (r.service_areas?.name) map.set(r.worker_id, r.service_areas.name);
  });
  return map;
}
