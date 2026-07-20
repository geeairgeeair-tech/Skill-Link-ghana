import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
});

function SupportPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ subject: "", message: "", category: "verification" });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: tickets } = useQuery({
    queryKey: ["my-support-tickets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets")
        .select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!user) return;
    if (form.subject.trim().length < 3) return toast.error("Subject too short");
    if (form.message.trim().length < 10) return toast.error("Message too short");
    setSubmitting(true);
    try {
      let attachment_url: string | null = null;
      if (file) {
        const path = `${user.id}/support/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("job-media").upload(path, file);
        if (upErr) throw upErr;
        attachment_url = path;
      }
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        subject: form.subject.trim(),
        message: form.message.trim(),
        category: form.category,
        related_worker_id: role === "worker" ? user.id : null,
        attachment_url,
      });
      if (error) throw error;
      toast.success("Ticket submitted");
      setForm({ subject: "", message: "", category: "verification" });
      setFile(null);
      qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <header className="fg-gradient-hero text-primary-foreground px-5 pt-6 pb-6 rounded-b-3xl">
        <BackButton className="text-primary-foreground/80" />
        <h1 className="font-display text-2xl font-bold mt-2">Support</h1>
        <p className="text-sm opacity-80">We're here to help</p>
      </header>
      <main className="mx-auto max-w-md px-5 -mt-3 space-y-3">
        <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <h3 className="font-display font-bold">Contact support</h3>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-muted text-sm">
            <option value="verification">Verification issue</option>
            <option value="account">Account</option>
            <option value="payment">Payment</option>
            <option value="booking">Booking</option>
            <option value="general">General</option>
          </select>
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" className="w-full px-3 py-2 rounded-lg bg-muted text-sm" />
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Describe your issue…" rows={4} className="w-full px-3 py-2 rounded-lg bg-muted text-sm" />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
          <button onClick={submit} disabled={submitting} className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit ticket"}
          </button>
        </section>

        <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h3 className="font-display font-bold">Your tickets</h3>
          {(tickets ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          ) : (tickets ?? []).map((t: any) => (
            <div key={t.id} className="py-2 border-t border-border first:border-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm truncate">{t.subject}</p>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted">{t.status}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.message}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()} · {t.category}</p>
              {t.admin_response && (
                <div className="mt-2 rounded-lg bg-primary-soft border border-primary/20 p-2 text-xs">
                  <p className="font-semibold text-primary">Admin response</p>
                  <p className="whitespace-pre-wrap">{t.admin_response}</p>
                  {t.responded_at && <p className="text-[10px] text-muted-foreground mt-1">{new Date(t.responded_at).toLocaleString()}</p>}
                </div>
              )}
            </div>
          ))}
        </section>
        <p className="text-xs text-center text-muted-foreground pb-6">
          <Link to="/profile" className="underline">Back to profile</Link>
        </p>
      </main>
    </AppShell>
  );
}
