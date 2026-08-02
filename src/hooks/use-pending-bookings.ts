import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uniqueChannel } from "@/lib/realtime";
import { useAuth } from "@/hooks/use-auth";

/**
 * Count of direct booking requests awaiting this worker's accept/decline.
 * Realtime: refreshes the instant a booking row for this worker changes.
 */
export function usePendingBookings() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user && role === "worker";

  const { data } = useQuery({
    queryKey: ["worker-pending-count", user?.id],
    enabled,
    queryFn: async () => {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("worker_id", user!.id)
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const ch = uniqueChannel(`worker-pending:${user!.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${user!.id}` },
        () => qc.invalidateQueries({ queryKey: ["worker-pending-count", user!.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, user?.id, qc]);

  return enabled ? (data ?? 0) : 0;
}
