import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationTarget } from "@/lib/notification-target";

/**
 * App-wide realtime notification listener.
 * Mounted once in __root so popups appear on every authenticated page
 * (worker dashboard, My Work, booking detail, profile, jobs, earnings,
 * reviews and every customer page).
 *
 * Notification rows are only inserted for the *recipient*, so the sender
 * never sees their own message popup.
 */
export function NotificationListener() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  // Guards against duplicate popups if the same INSERT is delivered twice.
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-live:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          if (!n?.id || seen.current.has(n.id)) return;
          seen.current.add(n.id);

          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
          qc.invalidateQueries({ queryKey: ["notif-unread", user.id] });
          qc.invalidateQueries({ queryKey: ["unread-notifications"] });
          qc.invalidateQueries({ queryKey: ["my-bookings"] });
          qc.invalidateQueries({ queryKey: ["worker-jobs"] });
          qc.invalidateQueries({ queryKey: ["booking-detail"] });

          const bookingId: string | undefined = n.data?.booking_id;
          const profession: string | undefined = n.data?.profession;

          if (n.type === "chat_message") {
            // Already reading this exact thread → no popup needed.
            if (bookingId && pathRef.current === `/chat/${bookingId}`) return;
            qc.invalidateQueries({ queryKey: ["chat-messages", bookingId] });
            toast(n.title ?? "New message", {
              description: [profession ? `Profession: ${profession}` : null, n.body]
                .filter(Boolean)
                .join(" · "),
              action: bookingId
                ? {
                    label: "Open chat",
                    onClick: () => router.navigate({ to: "/chat/$bookingId", params: { bookingId } }),
                  }
                : undefined,
            });
            return;
          }

          const target = notificationTarget(n);
          toast(n.title ?? "New notification", {
            description: [profession ? `Profession: ${profession}` : null, n.body]
              .filter(Boolean)
              .join(" · ") || undefined,
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
