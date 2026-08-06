import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { uniqueChannel } from "@/lib/realtime";
import { useAuth } from "@/hooks/use-auth";

export type ProStatus = "none" | "pending" | "approved" | "rejected" | "suspended";
export type EffectiveRole = "customer" | "worker" | "admin";

/**
 * Single shared role/status resolver.
 *
 * Source of truth for the Professional interface is the real
 * `worker_profiles.verification_status` — NOT the user_roles row — so an
 * approved customer is upgraded in-place on the same account.
 *
 * A realtime subscription on the user's own worker_profiles /
 * worker_professions rows invalidates every cached role, profile and
 * navigation query the moment an admin approves them, so no logout or
 * second account is ever required.
 */
export function useAppRole() {
  const { user, role, loading } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pro-status", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      // Verification status + internal notes come from a security-definer RPC:
      // those columns are not readable directly from the table.
      const { data: verif } = await (supabase.rpc as any)("get_my_worker_verification");
      const wp = (verif as any[])?.[0] ?? null;
      const { data: profs } = await supabase
        .from("worker_professions")
        .select("verification_status, is_primary, created_at, categories(name)")
        .eq("user_id", user!.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      return { wp: wp ?? null, professions: profs ?? [] };
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["pro-status", user.id] });
      qc.invalidateQueries({ queryKey: ["my-worker-profile"] });
      qc.invalidateQueries({ queryKey: ["my-professions"] });
      qc.invalidateQueries({ queryKey: ["worker-professions"] });
    };
    const ch = uniqueChannel(`pro-status:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worker_profiles", filter: `user_id=eq.${user.id}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worker_professions", filter: `user_id=eq.${user.id}` },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  const wp: any = data?.wp ?? null;
  const professions: any[] = data?.professions ?? [];
  const proStatus: ProStatus = !wp ? "none" : ((wp.verification_status as ProStatus) ?? "pending");

  const isAdmin = role === "admin";
  const isPro = proStatus === "approved";
  // The Professional interface stays permanently once a worker profile exists —
  // pending, approved, rejected and suspended all keep the Professional shell.
  const hasProProfile = proStatus !== "none";
  const effectiveRole: EffectiveRole = isAdmin ? "admin" : hasProProfile ? "worker" : "customer";
  const homeTo = isAdmin ? "/admin" : hasProProfile ? "/worker/dashboard" : "/";

  const primaryProfession =
    professions.find((p) => p.is_primary && p.verification_status === "approved") ??
    professions.find((p) => p.verification_status === "approved") ??
    null;

  return {
    user,
    role,
    effectiveRole,
    isAdmin,
    isPro,
    proStatus,
    hasApplication: proStatus !== "none",
    rejectionReason: wp?.rejection_reason ?? null,
    primaryProfessionName: primaryProfession?.categories?.name ?? null,
    professions,
    homeTo,
    loading: loading || isLoading,
  };
}
