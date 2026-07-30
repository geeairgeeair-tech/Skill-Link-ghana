import { BadgeCheck, Clock, ShieldAlert, ShieldX } from "lucide-react";

export type VerificationState = "approved" | "pending" | "rejected" | "suspended" | string | null | undefined;

const MAP: Record<string, { label: string; className: string; Icon: any }> = {
  approved: { label: "Verified", className: "bg-success/15 text-success", Icon: BadgeCheck },
  pending: { label: "Verification Pending", className: "bg-warning/20 text-warning-foreground", Icon: Clock },
  rejected: { label: "Verification Rejected", className: "bg-destructive/15 text-destructive", Icon: ShieldAlert },
  suspended: { label: "Suspended", className: "bg-destructive/15 text-destructive", Icon: ShieldX },
};

export function VerificationBadge({
  status,
  compact = false,
  className = "",
}: {
  status: VerificationState;
  compact?: boolean;
  className?: string;
}) {
  const key = String(status ?? "");
  const cfg = MAP[key];
  if (!cfg) return null;
  const { label, className: tone, Icon } = cfg;

  if (compact) {
    return (
      <span title={label} className={`inline-flex items-center rounded-full p-0.5 ${tone} ${className}`}>
        <Icon className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone} ${className}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
