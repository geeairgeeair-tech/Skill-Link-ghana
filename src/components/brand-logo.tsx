import { cn } from "@/lib/utils";

/**
 * Skill Link wordmark — two interlocking links forming an "S" / "L" monogram.
 * Uses currentColor so it inherits text color from parent.
 */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="12" fill="currentColor" opacity="0.12" />
      {/* Left link (S) */}
      <path
        d="M19 14 h6 a6 6 0 0 1 6 6 v2"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right link (L) — interlocked */}
      <path
        d="M29 34 h-6 a6 6 0 0 1 -6 -6 v-2"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Central spark/dot — represents 'connection' */}
      <circle cx="24" cy="24" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function BrandLogo({
  className,
  size = 36,
  showText = true,
  textClassName,
}: {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark size={size} />
      {showText && (
        <span className={cn("font-display font-extrabold tracking-tight", textClassName)}>
          Skill<span className="text-gold">Link</span>
        </span>
      )}
    </div>
  );
}
