import { Wrench } from "lucide-react";

/** Shown on professional profiles once an admin approves the profession's equipment photos. */
export function EquipmentBadge({ status, className = "" }: { status?: string | null; className?: string }) {
  if (status !== "approved") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-success/15 text-success ${className}`}
    >
      <Wrench className="size-3" /> Verified Equipment
    </span>
  );
}
