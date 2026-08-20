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
  const { user } = useAuth();
  // NOTE: do NOT gate on the `user_roles` role here. Some professionals were
  // never granted the `worker` role row (legacy onboarding), yet they have a
  // fully approved worker_profiles / worker_professions record. Presence of a
  // professional record is the real source of truth.
  const enabled = !!user;

  const { data, isLoading } = useQuery({
    queryKey: ["worker-eligibility", user?.id],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: wp }, { data: profs }, { data: status }, { data: areas }] = await Promise.all([
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
        supabase
          .from("worker_service_areas")
          .select("service_area_id")
          .eq("worker_id", user!.id),
      ]);
      return {
        wp: wp ?? null,
        profs: profs ?? [],
        publicStatus: (status as any as string) ?? null,
        areaIds: (areas ?? []).map((a) => a.service_area_id),
      };
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

  /** Canonical service areas the pro covers (primary + additional count equally). */
  const areaIds = new Set<string>(data?.areaIds ?? []);
  /** Legacy jobs (NULL canonical area) are never blocked by area matching. */
  const coversArea = (jobAreaId: string | null | undefined) => !jobAreaId || areaIds.has(jobAreaId);

  /** Returns null when the pro may apply, otherwise a human reason. */
  const blockedReason = (
    jobStatus: string,
    jobCategoryId: string | null,
    jobCategoryName?: string,
    jobAreaId?: string | null,
    jobAreaName?: string | null,
  ) => {
    if (!isVerified) return `Only verified professionals can apply. Your account is ${wp?.verification_status ?? "not verified"}.`;
    if (jobStatus !== "open") return "This job is no longer open.";
    if (jobCategoryId && !categoryIds.has(jobCategoryId))
      return `This job is in the ${jobCategoryName ?? "selected"} category. You can only apply to jobs in your verified professions${categoryNames.length ? ` (${categoryNames.join(", ")})` : ""}.`;
    if (!coversArea(jobAreaId))
      return `This job is in ${jobAreaName ?? "an area"} which is outside your service areas. Update your service areas to cover it.`;
    if (isUnavailable) return "You're marked Unavailable. Switch to Available to apply for jobs.";
    if (isBusy) return "You already have an accepted booking. Complete or resolve it before applying for another job.";
    return null;
  };

  const matchesCategory = (jobCategoryId: string | null) =>
    isVerified && !!jobCategoryId && categoryIds.has(jobCategoryId);

  /** Full match: profession + canonical service area. */
  const matchesJob = (jobCategoryId: string | null, jobAreaId?: string | null) =>
    matchesCategory(jobCategoryId) && coversArea(jobAreaId);

  return {
    loading: enabled && isLoading,
    isWorker: !!wp || profs.length > 0,
    isVerified,
    verificationStatus: wp?.verification_status ?? null,
    isBusy,
    isUnavailable,
    categoryIds,
    categoryNames,
    areaIds,
    coversArea,
    matchesCategory,
    matchesJob,
    blockedReason,
  };

}
