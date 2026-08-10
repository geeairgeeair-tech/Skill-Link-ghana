import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Category-agnostic job application eligibility for the signed-in professional.
 *
 * Matching is based on EVERY approved profession in `worker_professions`
 * (plus the legacy `worker_profiles.category_id`), so any current or future
 * category works automatically — not just the pro's original/primary one.
 */
export function useWorkerEligibility() {
  const { user, role } = useAuth();
  const enabled = !!user && role === "worker";

  const { data, isLoading } = useQuery({
    queryKey: ["worker-eligibility", user?.id],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: wp }, { data: profs }, { data: status }] = await Promise.all([
        supabase
          .from("worker_profiles")
          .select("verification_status, is_available, category_id, categories(name)")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("worker_professions")
          .select("category_id, verification_status, is_primary, categories(name)")
          .eq("user_id", user!.id),
        supabase.rpc("get_worker_public_status", { _worker_id: user!.id }),
      ]);
      return { wp: wp ?? null, profs: profs ?? [], publicStatus: (status as any as string) ?? null };
    },
  });

  const wp: any = data?.wp ?? null;
  const profs: any[] = data?.profs ?? [];
  const approved = profs.filter((p) => p.verification_status === "approved");

  const categoryIds = new Set<string>(approved.map((p) => p.category_id).filter(Boolean));
  if (wp?.category_id && wp?.verification_status === "approved") categoryIds.add(wp.category_id);

  const categoryNames = approved
    .map((p) => p.categories?.name)
    .filter(Boolean) as string[];
  if (!categoryNames.length && wp?.categories?.name) categoryNames.push(wp.categories.name);

  const isVerified = wp?.verification_status === "approved";
  const publicStatus = data?.publicStatus ?? null;
  const isBusy = publicStatus === "busy";
  const isUnavailable = publicStatus === "unavailable" || wp?.is_available === false;

  /** Returns null when the pro may apply, otherwise a human reason. */
  const blockedReason = (jobStatus: string, jobCategoryId: string | null, jobCategoryName?: string) => {
    if (!isVerified) return `Only verified professionals can apply. Your account is ${wp?.verification_status ?? "not verified"}.`;
    if (jobStatus !== "open") return "This job is no longer open.";
    if (jobCategoryId && !categoryIds.has(jobCategoryId))
      return `This job is in the ${jobCategoryName ?? "selected"} category. You can only apply to jobs in your verified professions${categoryNames.length ? ` (${categoryNames.join(", ")})` : ""}.`;
    if (isUnavailable) return "You're marked Unavailable. Switch to Available to apply for jobs.";
    if (isBusy) return "You have an active booking. Finish it before applying to new jobs.";
    return null;
  };

  const matchesCategory = (jobCategoryId: string | null) =>
    isVerified && !!jobCategoryId && categoryIds.has(jobCategoryId);

  return {
    loading: enabled && isLoading,
    isWorker: role === "worker",
    isVerified,
    verificationStatus: wp?.verification_status ?? null,
    isBusy,
    isUnavailable,
    categoryIds,
    categoryNames,
    matchesCategory,
    blockedReason,
  };
}
