import { Link } from "@tanstack/react-router";
import { Lock, LogIn, UserPlus } from "lucide-react";

/**
 * Signed-out overlay shown instead of professional profiles / browse results.
 * Guests keep the marketing homepage but cannot browse or book professionals.
 */
export function GuestGate({
  title = "Login or Sign Up to browse and book verified professionals.",
  description = "Create a free Skill Link account to view professional profiles, compare ratings and make a booking.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 shadow-elevated text-center">
        <div className="mx-auto size-14 rounded-2xl bg-primary-soft grid place-items-center text-primary">
          <Lock className="size-6" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold leading-snug">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 grid gap-2">
          <Link
            to="/auth"
            search={{ mode: "login", role: "customer" }}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2"
          >
            <LogIn className="size-4" /> Login
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup", role: "customer" }}
            className="h-12 rounded-xl border border-input bg-card font-semibold inline-flex items-center justify-center gap-2"
          >
            <UserPlus className="size-4" /> Sign Up
          </Link>
          <Link to="/" className="mt-1 text-sm font-semibold text-muted-foreground">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Compact inline version used on the marketing homepage. */
export function GuestGateCard() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card text-center">
      <div className="mx-auto size-11 rounded-xl bg-primary-soft grid place-items-center text-primary">
        <Lock className="size-5" />
      </div>
      <p className="mt-3 font-display font-bold leading-snug">
        Login or Sign Up to browse and book verified professionals.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to="/auth"
          search={{ mode: "login", role: "customer" }}
          className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <LogIn className="size-4" /> Login
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signup", role: "customer" }}
          className="h-11 rounded-xl border border-input bg-card text-sm font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <UserPlus className="size-4" /> Sign Up
        </Link>
      </div>
    </section>
  );
}
