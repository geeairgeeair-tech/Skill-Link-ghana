import { AppShell } from "@/components/app-shell";

/**
 * Neutral Skill Link loading skeleton.
 *
 * Rendered while role / verification data is still resolving so an approved
 * professional never sees customer or "complete your profile" content flash.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <AppShell>
      <div className="fg-gradient-hero px-5 pt-6 pb-10 rounded-b-3xl">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-primary-foreground/20 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-2/3 rounded bg-primary-foreground/20 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-primary-foreground/15 animate-pulse" />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-md px-5 -mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
        ))}
      </main>
    </AppShell>
  );
}
