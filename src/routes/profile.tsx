import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { AvatarUpload } from "@/components/avatar-upload";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, BadgeCheck, Wrench, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.full_name ?? ""); setAvatarUrl(data.avatar_url ?? null); }
    });
    supabase.rpc("get_profile_contact", { _id: user.id }).then(({ data }) => {
      const c = (data as any)?.[0];
      if (c) { setPhone(c.phone ?? ""); setAddress(c.address ?? ""); }
    });
  }, [user?.id]);

  if (loading) return <AppShell><div className="p-8 text-center text-muted-foreground">Loading…</div></AppShell>;
  if (!user) {
    return <AppShell>
      <div className="p-8 text-center">
        <p className="mb-3">Sign in to view your profile.</p>
        <Link to="/auth" className="rounded-xl bg-primary text-primary-foreground px-4 py-2 font-semibold">Sign in</Link>
      </div>
    </AppShell>;
  }

  const save = async () => {
    const { error } = await supabase.from("profiles").update({ full_name, phone, address }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-10 rounded-b-3xl">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-2xl font-bold">Profile</h1>
          <p className="text-sm opacity-80 capitalize">{role}</p>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-6 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
          <p className="text-[11px] font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Profile photo</p>
          <AvatarUpload
            userId={user.id}
            currentUrl={avatarUrl}
            fallbackText={full_name || user.email || "?"}
            onChange={setAvatarUrl}
          />
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-3 shadow-card">
          <Field label="Full name"><input value={full_name} onChange={e=>setName(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>
          <Field label="Phone"><input value={phone} onChange={e=>setPhone(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>
          <Field label="Address"><input value={address} onChange={e=>setAddress(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>
          <button onClick={save} className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold">Save changes</button>
        </div>

        {role === "customer" && (
          <Link to="/jobs/mine" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <ClipboardList className="size-5 text-primary"/>
              <div><p className="font-semibold">My Job Posts</p><p className="text-xs text-muted-foreground">Track jobs you've posted.</p></div>
            </div>
          </Link>
        )}

        {role === "customer" && (
          <Link to="/worker/onboarding" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Wrench className="size-5 text-primary"/>
              <div><p className="font-semibold">Become a worker</p><p className="text-xs text-muted-foreground">List your skills and earn.</p></div>
            </div>
          </Link>
        )}
        {role === "worker" && (
          <Link to="/worker/dashboard" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <BadgeCheck className="size-5 text-primary"/>
              <div><p className="font-semibold">Worker dashboard</p></div>
            </div>
          </Link>
        )}

        <button onClick={signOut} className="w-full rounded-xl border border-input bg-card py-3 font-semibold inline-flex items-center justify-center gap-2 text-destructive">
          <LogOut className="size-4"/> Sign out
        </button>
      </main>
    </AppShell>
  );
}
function Field({ label, children }: any) {
  return <label className="block"><p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>{children}</label>;
}
