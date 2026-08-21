import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { AvailabilityState, WorkerCardData } from "@/components/worker-card";

/**
 * Single source of truth for "is this professional currently committed?".
 * Backed by the `list_busy_workers()` RPC, which is derived from
 * `commitment_statuses()` — the same definition the commitment lock uses.
 * Never re-derive availability from `is_available` alone.
 */
export function useBusyWorkerIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["busy-workers"],
    refetchInterval: 30000,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_busy_workers");
      if (error) throw error;
      return new Set<string>(((data ?? []) as any[]).map((r) => r.worker_id));
    },
  });
}

/**
 * Resolve the display state for one professional.
 * `busyIds` undefined (still loading, or signed-out where the RPC is not
 * callable) yields "unknown" so we never claim "Active" for a pro who may be
 * committed.
 */
export function availabilityStateFor(
  userId: string,
  isAvailable: boolean | null | undefined,
  busyIds: Set<string> | undefined,
): AvailabilityState {
  if ((isAvailable ?? true) === false) return "unavailable";
  if (!busyIds) return "unknown";
  return busyIds.has(userId) ? "busy" : "available";
}

/** Attach the unified `availability_state` to a list of worker cards. */
export function withAvailabilityState<T extends WorkerCardData>(
  workers: T[] | undefined,
  busyIds: Set<string> | undefined,
): (T & { availability_state: AvailabilityState })[] {
  return (workers ?? []).map((w) => ({
    ...w,
    availability_state: availabilityStateFor(w.user_id, w.is_available, busyIds),
  }));
}
