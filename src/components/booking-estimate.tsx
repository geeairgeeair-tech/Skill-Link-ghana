import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Minus, Trash2, FileText, CheckCircle2, XCircle, History, MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const fmtGHS = (n: number | null | undefined) =>
  n == null ? "—" : `GH₵${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LABOUR_TYPES = ["Inspection", "Installation", "Repair", "Replacement", "Maintenance", "Emergency service", "Other"];
const EXTRA_TYPES = ["Transportation", "Delivery", "Disposal", "Emergency fee", "Other"];
const MATERIAL_SUGGESTIONS = ["Cement", "Pipes", "Cable", "Paint", "Tiles", "Sockets", "Bulbs", "Screws & fittings", "Sand", "Wood"];
const REJECT_REASONS = ["Price is too high", "I need more detail", "Materials not needed", "Found another option", "Other"];

type MaterialRow = { name: string; qty: number; unit_price: number };
type ExtraRow = { label: string; amount: number };

export type EstimateRow = {
  id: string;
  version: number;
  labour_type: string | null;
  labour_description: string | null;
  labour_cost: number;
  materials: MaterialRow[];
  extras: ExtraRow[];
  discount: number;
  total: number;
  note: string | null;
  status: string;
  approved_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  created_at: string;
};

export function useEstimates(bookingId: string) {
  return useQuery({
    queryKey: ["booking-estimates", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_estimates")
        .select("*")
        .eq("booking_id", bookingId)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EstimateRow[];
    },
  });
}

export function EstimateSection({
  bookingId,
  isWorker,
  isCustomer,
  canSubmit,
  finalAmount,
  varianceReason,
  varianceNote,
}: {
  bookingId: string;
  isWorker: boolean;
  isCustomer: boolean;
  canSubmit: boolean;
  finalAmount?: number | null;
  varianceReason?: string | null;
  varianceNote?: string | null;
}) {
  const qc = useQueryClient();
  const { data: estimates = [], isLoading } = useEstimates(bookingId);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = estimates[0] ?? null;
  const approved = estimates.find((e) => e.status === "approved") ?? null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["booking-estimates", bookingId] });
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
  };

  const approve = async () => {
    if (!current) return;
    setBusy(true);
    const { error } = await supabase.rpc("customer_approve_estimate", { _estimate_id: current.id } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Estimate approved");
    refresh();
  };

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-sm inline-flex items-center gap-1">
          <FileText className="size-4" /> Estimate
        </h3>
        {estimates.length > 1 && (
          <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-primary inline-flex items-center gap-1">
            <History className="size-3.5" /> {showHistory ? "Hide" : "History"} ({estimates.length})
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading estimate…</p>
      ) : !current ? (
        <p className="text-xs text-muted-foreground">
          {isWorker ? "No estimate sent yet. Create one so the customer knows the cost." : "Your worker has not sent an estimate yet."}
        </p>
      ) : (
        <EstimateCard e={current} />
      )}

      {showHistory && estimates.slice(1).map((e) => (
        <div key={e.id} className="opacity-70"><EstimateCard e={e} /></div>
      ))}

      {/* Customer actions */}
      {isCustomer && current?.status === "sent" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <button onClick={approve} disabled={busy}
            className="rounded-xl bg-success text-success-foreground py-3 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1">
            <CheckCircle2 className="size-4" /> Approve estimate
          </button>
          <button onClick={() => setRejecting(true)} disabled={busy}
            className="rounded-xl bg-destructive/10 text-destructive py-3 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1">
            <XCircle className="size-4" /> Reject
          </button>
          <Link to="/chat/$bookingId" params={{ bookingId }}
            className="rounded-xl bg-muted py-3 text-sm font-semibold inline-flex items-center justify-center gap-1">
            <MessageCircle className="size-4" /> Ask a question
          </Link>
        </div>
      )}

      {/* Worker actions */}
      {isWorker && canSubmit && !showForm && (
        <button onClick={() => setShowForm(true)}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold">
          {current ? "Revise estimate" : "Create estimate"}
        </button>
      )}

      {isWorker && showForm && (
        <EstimateForm
          bookingId={bookingId}
          base={current}
          onClose={() => setShowForm(false)}
          onDone={() => { setShowForm(false); refresh(); }}
        />
      )}

      {/* Final amount comparison */}
      {finalAmount != null && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Final amount</p>
          <div className="flex justify-between"><span>Approved estimate</span><span>{fmtGHS(approved?.total ?? null)}</span></div>
          <div className="flex justify-between font-semibold"><span>Final amount</span><span>{fmtGHS(finalAmount)}</span></div>
          {approved && (
            <div className="flex justify-between text-xs">
              <span>Difference</span>
              <span className={Number(finalAmount) > Number(approved.total) ? "text-destructive" : "text-success"}>
                {fmtGHS(Number(finalAmount) - Number(approved.total))}
              </span>
            </div>
          )}
          {varianceReason && <p className="text-xs pt-1">Reason: <span className="font-semibold">{varianceReason}</span></p>}
          {varianceNote && <p className="text-xs italic text-muted-foreground">"{varianceNote}"</p>}
        </div>
      )}

      {rejecting && current && (
        <RejectModal
          estimateId={current.id}
          onClose={() => setRejecting(false)}
          onDone={() => { setRejecting(false); refresh(); }}
        />
      )}
    </section>
  );
}

function EstimateCard({ e }: { e: EstimateRow }) {
  const matTotal = (e.materials ?? []).reduce((s, m) => s + Number(m.qty ?? 0) * Number(m.unit_price ?? 0), 0);
  const extTotal = (e.extras ?? []).reduce((s, x) => s + Number(x.amount ?? 0), 0);
  const badge =
    e.status === "approved" ? "bg-success/15 text-success"
    : e.status === "rejected" ? "bg-destructive/10 text-destructive"
    : e.status === "superseded" ? "bg-muted text-muted-foreground"
    : "bg-gold/20 text-gold-foreground";
  return (
    <div className="rounded-xl border border-border p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Version {e.version}</p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${badge}`}>{e.status}</span>
      </div>
      <div className="flex justify-between">
        <span>Labour{e.labour_type ? ` · ${e.labour_type}` : ""}</span>
        <span>{fmtGHS(e.labour_cost)}</span>
      </div>
      {e.labour_description && <p className="text-xs text-muted-foreground -mt-1">{e.labour_description}</p>}
      {(e.materials ?? []).length > 0 && (
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materials</p>
          {e.materials.map((m, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span>{m.name} × {m.qty}</span>
              <span>{fmtGHS(Number(m.qty) * Number(m.unit_price))}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-semibold"><span>Materials total</span><span>{fmtGHS(matTotal)}</span></div>
        </div>
      )}
      {(e.extras ?? []).length > 0 && (
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional charges</p>
          {e.extras.map((x, i) => (
            <div key={i} className="flex justify-between text-xs"><span>{x.label}</span><span>{fmtGHS(x.amount)}</span></div>
          ))}
          <div className="flex justify-between text-xs font-semibold"><span>Charges total</span><span>{fmtGHS(extTotal)}</span></div>
        </div>
      )}
      {Number(e.discount) > 0 && (
        <div className="flex justify-between text-xs"><span>Discount</span><span>-{fmtGHS(e.discount)}</span></div>
      )}
      <div className="flex justify-between border-t border-border pt-2 font-bold">
        <span>Estimated total</span><span className="text-primary">{fmtGHS(e.total)}</span>
      </div>
      {e.note && <p className="text-xs italic text-muted-foreground">"{e.note}"</p>}
      {e.reject_reason && <p className="text-xs text-destructive">Rejected: {e.reject_reason}</p>}
      <p className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
    </div>
  );
}

function EstimateForm({ bookingId, base, onClose, onDone }: {
  bookingId: string; base: EstimateRow | null; onClose: () => void; onDone: () => void;
}) {
  const [labourType, setLabourType] = useState(base?.labour_type ?? LABOUR_TYPES[0]);
  const [labourDesc, setLabourDesc] = useState(base?.labour_description ?? "");
  const [labourCost, setLabourCost] = useState<string>(base ? String(base.labour_cost) : "");
  const [materials, setMaterials] = useState<MaterialRow[]>(base?.materials ?? []);
  const [extras, setExtras] = useState<ExtraRow[]>(base?.extras ?? []);
  const [discount, setDiscount] = useState<string>(base ? String(base.discount) : "");
  const [note, setNote] = useState(base?.note ?? "");
  const [saving, setSaving] = useState(false);

  const matTotal = materials.reduce((s, m) => s + Number(m.qty || 0) * Number(m.unit_price || 0), 0);
  const extTotal = extras.reduce((s, x) => s + Number(x.amount || 0), 0);
  const total = Number(labourCost || 0) + matTotal + extTotal - Number(discount || 0);

  const setMat = (i: number, patch: Partial<MaterialRow>) =>
    setMaterials((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (total <= 0) return toast.error("Estimate total must be greater than zero");
    setSaving(true);
    const { error } = await supabase.rpc("worker_submit_estimate", {
      _booking_id: bookingId,
      _labour_type: labourType,
      _labour_description: labourDesc.trim() || null,
      _labour_cost: Number(labourCost || 0),
      _materials: materials.filter((m) => m.name.trim()) as any,
      _extras: extras.filter((x) => x.label.trim()) as any,
      _discount: Number(discount || 0),
      _note: note.trim() || null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Estimate sent to the customer");
    onDone();
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-3 bg-muted/30">
      <p className="font-semibold text-sm">{base ? "Revise estimate" : "New estimate"}</p>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Labour</p>
        <div className="flex flex-wrap gap-1.5">
          {LABOUR_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setLabourType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${labourType === t ? "bg-primary text-primary-foreground border-primary" : "border-input bg-card"}`}>
              {t}
            </button>
          ))}
        </div>
        <input value={labourDesc} onChange={(e) => setLabourDesc(e.target.value)} placeholder="Short labour description (optional)"
          className="mt-2 w-full rounded-xl border border-input bg-card p-3 text-sm" />
        <input value={labourCost} onChange={(e) => setLabourCost(e.target.value)} type="number" min="0" inputMode="decimal"
          placeholder="Labour cost (GH₵)" className="mt-2 w-full rounded-xl border border-input bg-card p-3 text-sm" />
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Materials</p>
        {materials.map((m, i) => (
          <div key={i} className="rounded-xl border border-input bg-card p-2 mb-2 space-y-2">
            <div className="flex gap-2">
              <input value={m.name} onChange={(e) => setMat(i, { name: e.target.value })} placeholder="Material name"
                list="material-suggestions" className="flex-1 rounded-lg border border-input bg-background p-2 text-sm" />
              <button type="button" onClick={() => setMaterials((r) => r.filter((_, idx) => idx !== i))}
                className="px-2 rounded-lg bg-destructive/10 text-destructive" aria-label="Remove material">
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setMat(i, { qty: Math.max(1, Number(m.qty) - 1) })}
                  className="size-9 rounded-lg bg-muted grid place-items-center" aria-label="Decrease quantity"><Minus className="size-4" /></button>
                <span className="w-8 text-center text-sm font-semibold">{m.qty}</span>
                <button type="button" onClick={() => setMat(i, { qty: Number(m.qty) + 1 })}
                  className="size-9 rounded-lg bg-muted grid place-items-center" aria-label="Increase quantity"><Plus className="size-4" /></button>
              </div>
              <input value={m.unit_price || ""} onChange={(e) => setMat(i, { unit_price: Number(e.target.value) })}
                type="number" min="0" inputMode="decimal" placeholder="Unit price"
                className="flex-1 rounded-lg border border-input bg-background p-2 text-sm" />
              <span className="text-sm font-semibold w-24 text-right">{fmtGHS(Number(m.qty) * Number(m.unit_price || 0))}</span>
            </div>
          </div>
        ))}
        <datalist id="material-suggestions">
          {MATERIAL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
        <button type="button" onClick={() => setMaterials((r) => [...r, { name: "", qty: 1, unit_price: 0 }])}
          className="w-full rounded-xl border border-dashed border-input py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1">
          <Plus className="size-4" /> Add item
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Additional charges</p>
        {extras.map((x, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <select value={x.label} onChange={(e) => setExtras((r) => r.map((v, idx) => idx === i ? { ...v, label: e.target.value } : v))}
              className="flex-1 rounded-lg border border-input bg-card p-2 text-sm">
              {EXTRA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={x.amount || ""} onChange={(e) => setExtras((r) => r.map((v, idx) => idx === i ? { ...v, amount: Number(e.target.value) } : v))}
              type="number" min="0" inputMode="decimal" placeholder="Amount"
              className="w-28 rounded-lg border border-input bg-card p-2 text-sm" />
            <button type="button" onClick={() => setExtras((r) => r.filter((_, idx) => idx !== i))}
              className="px-2 rounded-lg bg-destructive/10 text-destructive" aria-label="Remove charge"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setExtras((r) => [...r, { label: EXTRA_TYPES[0], amount: 0 }])}
          className="w-full rounded-xl border border-dashed border-input py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1">
          <Plus className="size-4" /> Add charge
        </button>
      </div>

      <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min="0" inputMode="decimal"
        placeholder="Discount (GH₵, optional)" className="w-full rounded-xl border border-input bg-card p-3 text-sm" />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Short note (optional), e.g. Final material prices may change slightly after inspection."
        className="w-full rounded-xl border border-input bg-card p-3 text-sm" />

      <div className="rounded-xl bg-card border border-border p-3 text-sm space-y-1">
        <div className="flex justify-between"><span>Labour</span><span>{fmtGHS(Number(labourCost || 0))}</span></div>
        <div className="flex justify-between"><span>Materials</span><span>{fmtGHS(matTotal)}</span></div>
        <div className="flex justify-between"><span>Additional charges</span><span>{fmtGHS(extTotal)}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>-{fmtGHS(Number(discount || 0))}</span></div>
        <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Estimated total</span><span className="text-primary">{fmtGHS(total)}</span></div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-muted py-3 text-sm font-semibold">Cancel</button>
        <button type="button" onClick={submit} disabled={saving}
          className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50">
          {saving ? "Sending…" : "Send estimate"}
        </button>
      </div>
    </div>
  );
}

function RejectModal({ estimateId, onClose, onDone }: { estimateId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const finalReason = reason === "Other" ? other.trim() : reason;
    if (finalReason.length < 3) return toast.error("Please explain your reason");
    setSaving(true);
    const { error } = await supabase.rpc("customer_reject_estimate", { _estimate_id: estimateId, _reason: finalReason } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Estimate rejected — your worker can send a new one");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display font-bold">Why are you rejecting this estimate?</h3>
        <div className="space-y-1.5">
          {REJECT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reject" checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
              {r}
            </label>
          ))}
        </div>
        {reason === "Other" && (
          <textarea value={other} onChange={(e) => setOther(e.target.value)} rows={2}
            placeholder="Tell your worker why" className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-muted text-sm font-semibold">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? "Sending…" : "Reject estimate"}
          </button>
        </div>
      </div>
    </div>
  );
}
