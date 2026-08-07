import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { AvatarUpload } from "@/components/avatar-upload";
import { useAuth } from "@/hooks/use-auth";
import { useAppRole } from "@/hooks/use-app-role";
import { LogOut, BadgeCheck, Wrench, ClipboardList, Clock, Lock as LockIcon } from "lucide-react";


export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const { proStatus, isPro, rejectionReason, primaryProfessionName, effectiveRole } = useAppRole();


  const navigate = useNavigate();
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Legal identity is captured at sign-up and locked afterwards. Existing accounts
  // that are missing any of the four fields may complete them exactly once.
  const [identity, setIdentity] = useState<{ first_name: string | null; last_name: string | null; date_of_birth: string | null; gender: string | null } | null>(null);
  const [idForm, setIdForm] = useState({ first_name: "", last_name: "", date_of_birth: "", gender: "" });
  const [savingIdentity, setSavingIdentity] = useState(false);

  const loadIdentity = (uid: string) =>
    supabase.rpc("get_profile_identity", { _id: uid }).then(({ data }) => {
      const c = (data as any)?.[0];
      if (c) {
        setPhone(c.phone ?? "");
        setIdentity({
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
          date_of_birth: c.date_of_birth ?? null,
          gender: c.gender ?? null,
        });
      }
    });

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.full_name ?? ""); setAvatarUrl(data.avatar_url ?? null); }
    });
    supabase.rpc("get_profile_contact", { _id: user.id }).then(({ data }) => {
      const c = (data as any)?.[0];
      if (c) { setPhone(c.phone ?? ""); setAddress(c.address ?? ""); }
    });
    loadIdentity(user.id);
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

  const identityComplete =
    !!identity?.first_name && !!identity?.last_name && !!identity?.date_of_birth && !!identity?.gender;

  const maxDob = new Date();
  maxDob.setFullYear(maxDob.getFullYear() - 18);
  const maxDobStr = maxDob.toISOString().slice(0, 10);

  const saveIdentity = async () => {
    setSavingIdentity(true);
    const { error } = await (supabase.rpc as any)("complete_profile_identity", {
      _first_name: idForm.first_name,
      _last_name: idForm.last_name,
      _date_of_birth: idForm.date_of_birth || null,
      _gender: idForm.gender,
    });
    setSavingIdentity(false);
    if (error) return toast.error(error.message);
    toast.success("Identity details saved and locked");
    await loadIdentity(user.id);
  };

  const save = async () => {
    // Legal identity and the derived display name are intentionally not part of this update.
    const { error } = await supabase.from("profiles").update({ phone, address }).eq("id", user.id);
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
          <p className="text-sm opacity-80">{effectiveRole === "admin" ? "Admin" : isPro ? "Professional" : "Customer"}</p>
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
          <div className="flex items-center gap-2">
            <LockIcon className="size-4 text-muted-foreground" />
            <p className="font-semibold text-sm">Legal identity</p>
          </div>
          {identityComplete ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ReadOnly label="First legal name" value={identity!.first_name!} />
                <ReadOnly label="Last legal name" value={identity!.last_name!} />
                <ReadOnly label="Date of birth" value={new Date(identity!.date_of_birth!).toLocaleDateString()} />
                <ReadOnly label="Gender" value={identity!.gender!} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Legal identity details cannot be changed directly. Contact Support if a correction is required.
              </p>
              <Link to="/support" className="inline-block text-xs font-semibold text-primary">Contact Support</Link>
            </>
          ) : identity ? (
            <>
              <p className="text-xs text-muted-foreground">
                Complete your legal identity details once. After saving, they are locked and can only be corrected by Support.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {identity.first_name
                  ? <ReadOnly label="First legal name" value={identity.first_name} />
                  : <Field label="First legal name"><input value={idForm.first_name} onChange={e=>setIdForm({...idForm, first_name: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>}
                {identity.last_name
                  ? <ReadOnly label="Last legal name" value={identity.last_name} />
                  : <Field label="Last legal name"><input value={idForm.last_name} onChange={e=>setIdForm({...idForm, last_name: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>}
                {identity.date_of_birth
                  ? <ReadOnly label="Date of birth" value={new Date(identity.date_of_birth).toLocaleDateString()} />
                  : <Field label="Date of birth"><input type="date" max={maxDobStr} min="1900-01-01" value={idForm.date_of_birth} onChange={e=>setIdForm({...idForm, date_of_birth: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>}
                {identity.gender
                  ? <ReadOnly label="Gender" value={identity.gender} />
                  : <Field label="Gender">
                      <select value={idForm.gender} onChange={e=>setIdForm({...idForm, gender: e.target.value})} className="w-full rounded-xl border border-input bg-card p-3 text-sm">
                        <option value="">Select gender</option>
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </Field>}
              </div>
              <button onClick={saveIdentity} disabled={savingIdentity} className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50">
                {savingIdentity ? "Saving…" : "Save & lock identity"}
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-3 shadow-card">
          <ReadOnly label="Display name" value={full_name || "—"} />
          <p className="text-[11px] text-muted-foreground">
            Your display name is generated from your legal identity. Contact Support if a correction is required.
          </p>


          <Field label="Phone"><input value={phone} onChange={e=>setPhone(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>
          <Field label="Address"><input value={address} onChange={e=>setAddress(e.target.value)} className="w-full rounded-xl border border-input bg-card p-3 text-sm"/></Field>
          <button onClick={save} className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold">Save changes</button>
        </div>

        <Link to="/jobs/mine" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <ClipboardList className="size-5 text-primary"/>
            <div><p className="font-semibold">My Job Posts</p><p className="text-xs text-muted-foreground">Track jobs you've posted.</p></div>
          </div>
        </Link>

        {proStatus === "none" && (
          <Link to="/worker/onboarding" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Wrench className="size-5 text-primary"/>
              <div><p className="font-semibold">Become a Professional</p><p className="text-xs text-muted-foreground">List your skills and earn.</p></div>
            </div>
          </Link>
        )}

        {proStatus === "pending" && (
          <div className="rounded-2xl bg-warning/15 border border-warning/30 p-4">
            <p className="font-semibold inline-flex items-center gap-2"><Clock className="size-4"/> Professional Application — Pending Review</p>
            <p className="text-xs text-muted-foreground mt-1">You keep full customer access while an admin reviews your documents.</p>
            <Link to="/worker/onboarding" className="mt-2 inline-block text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold">Continue application</Link>
          </div>
        )}

        {proStatus === "rejected" && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 space-y-2">
            <p className="font-semibold text-destructive">Professional application not approved</p>
            {rejectionReason && <p className="text-xs bg-card border border-border rounded-lg p-2">{rejectionReason}</p>}
            <Link to="/worker/onboarding" className="inline-block text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold">Update & resubmit</Link>
          </div>
        )}

        {proStatus === "suspended" && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 space-y-2">
            <p className="font-semibold text-destructive">Professional account suspended</p>
            <Link to="/support" className="inline-block text-xs px-3 py-1.5 rounded-lg bg-muted font-semibold">Contact support</Link>
          </div>
        )}

        {isPro && (
          <>
            <Link to="/worker/profile" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center gap-3">
                <BadgeCheck className="size-5 text-success"/>
                <div>
                  <p className="font-semibold">Professional Profile</p>
                  <p className="text-xs text-muted-foreground">{primaryProfessionName ?? "Approved professional"}</p>
                </div>
              </div>
            </Link>
            <Link to="/worker/dashboard" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center gap-3">
                <Wrench className="size-5 text-primary"/>
                <div><p className="font-semibold">Professional Dashboard</p></div>
              </div>
            </Link>
            <Link to="/worker/professions" className="block rounded-2xl bg-card border border-border p-4 shadow-card">
              <div className="flex items-center gap-3">
                <ClipboardList className="size-5 text-primary"/>
                <div><p className="font-semibold">Manage Professions</p><p className="text-xs text-muted-foreground">Up to 3 professions.</p></div>
              </div>
            </Link>
          </>
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
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="block">
      <p className="text-[11px] font-semibold mb-1 text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="w-full rounded-xl border border-input bg-muted/50 p-3 text-sm text-muted-foreground truncate">{value}</p>
    </div>
  );
}
