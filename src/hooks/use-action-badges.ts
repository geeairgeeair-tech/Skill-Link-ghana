import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppRole } from "@/hooks/use-app-role";

/** Booking statuses that still need the Professional to act. */
const PRO_ACTION_STATUSES = [
  "pending",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "worker_on_the_way",
  "work_started",
  "disputed",
];

/** Booking statuses that still need the Customer to act / are live. */
const CUSTOMER_ACTION_STATUSES = [
  "pending",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
  "worker_on_the_way",
  "work_started",
  "awaiting_customer_confirmation",
  "worker_marked_complete",
  "disputed",
];

function useRealtimeRefresh(userId: string | undefined, key: unknown[], column: "worker_id" | "customer_id") {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const refresh = () => qc.invalidateQueries({ queryKey: key });
    const ch = supabase
      .channel(`badge:${column}:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `${column}=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, qc, column]);
}

/**
 * Outstanding-action count for an approved Professional's "Jobs" tab.
 * Completed / cancelled records are never counted.
 */
export function useProfessionalActionCount() {
  const { user, isPro } = useAppRole();
  const enabled = !!user && isPro;
  const key = ["badge-pro-actions", user?.id];

  const { data } = useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const [{ data: bookings }, { data: returns }, { data: apps }] = await Promise.all([
        supabase.from("bookings").select("id, status").eq("worker_id", user!.id).in("status", PRO_ACTION_STATUSES as any),
        supabase.from("return_requests").select("id").eq("worker_id", user!.id).in("status", ["pending", "info_requested"]),
        supabase.from("job_applications").select("id").eq("worker_id", user!.id).eq("status", "pending"),
      ]);
      return (bookings?.length ?? 0) + (returns?.length ?? 0) + (apps?.length ?? 0);
    },
  });

  useRealtimeRefresh(enabled ? user?.id : undefined, key, "worker_id");
  return enabled ? data ?? 0 : 0;
}

/**
 * Outstanding-action count for the customer surfaces ("Hire", "My Bookings").
 * Counts live bookings (estimate approval / active work / completion
 * confirmation) plus completed bookings that still need a review.
 */
export function useCustomerActionCount() {
  const { user } = useAppRole();
  const key = ["badge-customer-actions", user?.id];

  const { data } = useQuery({
    queryKey: key,
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: bookings }, { data: returns }, { data: reviewable }] = await Promise.all([
        supabase.from("bookings").select("id, status").eq("customer_id", user!.id).in("status", CUSTOMER_ACTION_STATUSES as any),
        supabase.from("return_requests").select("id").eq("customer_id", user!.id).in("status", ["info_requested", "scheduled", "accepted"]),
        supabase
          .from("bookings")
          .select("id, reviews(id)")
          .eq("customer_id", user!.id)
          .in("status", ["completed", "closed", "customer_confirmed_complete"] as any),
      ]);
      const pendingReviews = (reviewable ?? []).filter((b: any) => (b.reviews ?? []).length === 0).length;
      return (bookings?.length ?? 0) + (returns?.length ?? 0) + pendingReviews;
    },
  });

  useRealtimeRefresh(user?.id, key, "customer_id");
  return user ? data ?? 0 : 0;
}

