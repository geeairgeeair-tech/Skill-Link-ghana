import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type ApplicantCounts = { total: number; pending: number };

/**
 * Applicant counts for a set of job posts.
 *
 * Source of truth is the live `job_applications` rows themselves — `pending`
 * counts rows with status = 'pending'. It is deliberately NOT derived from
 * notification read/unread state, so marking notifications read never clears
 * the "awaiting review" badge; only accepting/declining an applicant does.
 */
export function useJobApplicantCounts(jobIds: string[]) {
  const key = [...jobIds].sort().join(",");
  return useQuery({
    queryKey: ["job-applicant-counts", key],
    enabled: jobIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("job_id, status")
        .in("job_id", jobIds);
      if (error) throw error;
      const map: Record<string, ApplicantCounts> = {};
      (data ?? []).forEach((r: any) => {
        const c = (map[r.job_id] ??= { total: 0, pending: 0 });
        c.total += 1;
        if (r.status === "pending") c.pending += 1;
      });
      return map;
    },
  });
}

/**
 * Summary for home/dashboard shortcuts: how many jobs the signed-in user has
 * posted, and how many applicants are still awaiting their review.
 */
export function useMyJobPostsSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-job-posts-summary", user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: jobs, error } = await supabase
        .from("job_requests")
        .select("id, status")
        .eq("customer_id", user!.id);
      if (error) throw error;
      const list = jobs ?? [];
      const openIds = list
        .filter((j: any) => j.status === "open" || j.status === "assigned")
        .map((j: any) => j.id);
      let pending = 0;
      if (openIds.length > 0) {
        const { data: apps } = await supabase
          .from("job_applications")
          .select("id")
          .eq("status", "pending")
          .in("job_id", openIds);
        pending = apps?.length ?? 0;
      }
      return { jobCount: list.length, pending };
    },
  });
}
