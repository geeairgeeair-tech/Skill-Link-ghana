import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Accepted estimate = a real approved row in `booking_estimates`.
 * Never derive it from bookings.estimated_cost / estimated_amount / budget or
 * any professional pricing field.
 */
export function useAcceptedEstimates(bookingIds: string[]) {
  const ids = Array.from(new Set(bookingIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["accepted-estimates", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_estimates")
        .select("booking_id, total, version")
        .in("booking_id", ids)
        .eq("status", "approved")
        .order("version", { ascending: true });
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[(row as any).booking_id] = Number((row as any).total);
      return map;
    },
  });
}

export function useAcceptedEstimate(bookingId: string | undefined) {
  const { data } = useAcceptedEstimates(bookingId ? [bookingId] : []);
  return bookingId ? (data?.[bookingId] ?? null) : null;
}
