import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CustomerMarketplaceSection } from "@/components/customer-marketplace";

export const Route = createFileRoute("/_authenticated/hire")({
  head: () => ({
    meta: [
      { title: "Hire Professionals — Skill Link" },
      { name: "description", content: "Browse services, hire verified professionals and manage your own bookings on Skill Link." },
      { property: "og:title", content: "Hire Professionals — Skill Link" },
      { property: "og:description", content: "Browse services, hire verified professionals and manage your own bookings." },
    ],
  }),
  component: HirePage,
});

function HirePage() {
  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-10 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">Hire</h1>
          <p className="text-sm opacity-80">Everything a customer can do, right here.</p>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-4 py-6">
        <CustomerMarketplaceSection />
      </main>
    </AppShell>
  );
}
