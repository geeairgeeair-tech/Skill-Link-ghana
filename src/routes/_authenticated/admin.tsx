import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { role, loading } = useAuth();

  if (!loading && role === "worker") return <Navigate to="/worker/dashboard" replace />;
  if (!loading && role === "customer") return <Navigate to="/" replace />;

  if (loading || !role) {
    return <AppShell><div className="p-8 text-center text-sm text-muted-foreground">Checking admin access…</div></AppShell>;
  }

  return <Outlet />;
}