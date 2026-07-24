import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Calendar, User, LayoutDashboard, Briefcase, PlusSquare, Users, Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { role, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const effectiveRole = pathname.startsWith("/admin") ? "admin" : role;
  const unread = useUnreadNotifications();

  const nav = effectiveRole === "worker"
    ? [
        { to: "/worker/dashboard", icon: LayoutDashboard, label: "Dashboard" },
        { to: "/jobs", icon: Briefcase, label: "Jobs" },
        { to: "/jobs/new", icon: PlusSquare, label: "Post job" },
        { to: "/worker/jobs", icon: Calendar, label: "My work" },
        { to: "/profile", icon: User, label: "Profile" },
      ]
    : effectiveRole === "admin"
    ? [
        { to: "/admin", icon: LayoutDashboard, label: "Admin" },
        { to: "/admin/workers", icon: Search, label: "Workers" },
        { to: "/admin/users", icon: Users, label: "Users" },
        { to: "/admin/jobs", icon: Briefcase, label: "Jobs" },
        { to: "/admin/bookings", icon: Calendar, label: "Bookings" },
        { to: "/profile", icon: User, label: "Profile" },
      ]
    : [
        { to: "/", icon: Home, label: "Home" },
        { to: "/workers", icon: Search, label: "Browse" },
        { to: "/jobs/new", icon: PlusSquare, label: "Post job" },
        { to: "/bookings", icon: Calendar, label: "Bookings" },
        { to: "/profile", icon: User, label: "Profile" },
      ];

  return (
    <div className="min-h-screen pb-20 bg-background">
      {children}
      {user && !pathname.startsWith("/chat/") && (
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="fixed top-3 right-3 z-40 size-10 rounded-full bg-card/95 backdrop-blur shadow-elevated border border-border grid place-items-center"
        >
          <Bell className="size-5"/>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      )}
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pointer-events-auto">
        <div className="mx-auto max-w-md grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map((n) => {
            const active = n.to === "/"
              ? pathname === "/"
              : n.to === "/admin"
              ? pathname === "/admin"
              : pathname === n.to || pathname.startsWith(`${n.to}/`);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors pointer-events-auto",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
