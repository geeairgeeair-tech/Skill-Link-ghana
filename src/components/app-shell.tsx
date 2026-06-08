import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Calendar, User, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = role === "worker"
    ? [
        { to: "/worker/dashboard", icon: LayoutDashboard, label: "Dashboard" },
        { to: "/worker/jobs", icon: Calendar, label: "Jobs" },
        { to: "/workers", icon: Search, label: "Browse" },
        { to: "/profile", icon: User, label: "Profile" },
      ]
    : role === "admin"
    ? [
        { to: "/admin", icon: LayoutDashboard, label: "Admin" },
        { to: "/workers", icon: Search, label: "Workers" },
        { to: "/", icon: Home, label: "Home" },
        { to: "/profile", icon: User, label: "Profile" },
      ]
    : [
        { to: "/", icon: Home, label: "Home" },
        { to: "/workers", icon: Search, label: "Browse" },
        { to: "/bookings", icon: Calendar, label: "Bookings" },
        { to: "/profile", icon: User, label: "Profile" },
      ];

  return (
    <div className="min-h-screen pb-20 bg-background">
      {children}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto max-w-md grid grid-cols-4">
          {nav.map((n) => {
            const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors",
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
