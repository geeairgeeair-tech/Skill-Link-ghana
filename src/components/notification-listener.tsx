import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationTarget } from "@/lib/notification-target";

/**
 * App-wide realtime notification listener.
 * Shows an instant toast for every new notification row and keeps
 * notification queries in sync. Mounted once at the root.
 */
export function NotificationListener() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-live:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
          qc.invalidateQueries({ queryKey: ["notif-unread", user.id] });
          qc.invalidateQueries({ queryKey: ["my-bookings"] });
          qc.invalidateQueries({ queryKey: ["worker-jobs"] });
          qc.invalidateQueries({ queryKey: ["booking-detail"] });

          const target = notificationTarget(n);
          toast(n.title ?? "New notification", {
            description: n.body ?? undefined,
            action: target
              ? { label: "View", onClick: () => router.navigate(target as any) }
              : undefined,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc, router]);

  return null;
}
